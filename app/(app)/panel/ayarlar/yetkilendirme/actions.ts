"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SIDEBAR_GIZLI_VARSAYILAN_DEPARTMAN, SIDEBAR_YETKI_OGELERI } from "@/lib/panel/menu-gruplari";

type SonucDurumu = { success: boolean; message: string } | null;

const departmanSemasi = z.string().trim().min(1, "Departman zorunlu.");
const anahtarSemasi = z.enum(SIDEBAR_YETKI_OGELERI.map((o) => o.key) as [string, ...string[]]);

/**
 * Ayarlar > Yetkilendirme'deki "Sidebar Menü Görünürlüğü" — QR Kodları/Tablet
 * Ayarları'ndaki aynı read-modify-write deseni: klinik_ayarlar.ayarlar tek
 * jsonb kolonu, "sidebar_gizli" anahtarı { [departman]: gizli_anahtar[] }
 * şeklinde. Departman (rol değil — bkz. lib/panel/menu-gruplari.ts) burada
 * sabit bir enum değil, personel-tanimlama'daki katalogdan gelen serbest bir
 * string; klinik_admin'in Özel Pozisyon Ekle/Personel Tanımlama'dan görüp
 * seçtiği departman adının BİREBİR aynısı olmalı, o yüzden zod'da sadece
 * boş-olmama kontrolü var, sabit enum yok.
 */
export async function sidebarMenuGorunurlukDegistir(
  departmanHam: string,
  anahtarHam: string,
  gorunur: boolean
): Promise<SonucDurumu> {
  const departmanAyristirma = departmanSemasi.safeParse(departmanHam);
  const anahtarAyristirma = anahtarSemasi.safeParse(anahtarHam);
  if (!departmanAyristirma.success || !anahtarAyristirma.success) {
    return { success: false, message: "Geçersiz istek." };
  }
  const departman = departmanAyristirma.data;
  const anahtar = anahtarAyristirma.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("klinik_id, rol")
    .eq("id", user.id)
    .single();

  if (!kullanici || kullanici.rol !== "klinik_admin" || !kullanici.klinik_id) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }
  const klinikId = kullanici.klinik_id;

  const { data: mevcutSatir } = await supabase
    .from("klinik_ayarlar")
    .select("ayarlar")
    .eq("klinik_id", klinikId)
    .maybeSingle();

  const mevcutAyarlar = (mevcutSatir?.ayarlar as Record<string, unknown> | null) ?? {};
  const mevcutSidebarGizli = (mevcutAyarlar.sidebar_gizli as Record<string, string[]> | undefined) ?? {};
  const mevcutListe = mevcutSidebarGizli[departman] ?? SIDEBAR_GIZLI_VARSAYILAN_DEPARTMAN[departman] ?? [];

  const yeniListe = gorunur
    ? mevcutListe.filter((k) => k !== anahtar)
    : mevcutListe.includes(anahtar)
      ? mevcutListe
      : [...mevcutListe, anahtar];

  const guncelAyarlar = {
    ...mevcutAyarlar,
    sidebar_gizli: { ...mevcutSidebarGizli, [departman]: yeniListe },
  };

  const { error } = await supabase
    .from("klinik_ayarlar")
    .upsert({ klinik_id: klinikId, ayarlar: guncelAyarlar }, { onConflict: "klinik_id" });

  if (error) {
    console.error("Sidebar menü görünürlüğü güncellenemedi:", error);
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/ayarlar/yetkilendirme");
  // Sidebar tüm /panel altında ortak layout'tan geliyor — departmanı değişen
  // kullanıcı bir sonraki sayfa geçişinde güncel listeyi görür.
  revalidatePath("/panel", "layout");
  return { success: true, message: gorunur ? "Menü açıldı." : "Menü kapatıldı." };
}
