"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SIDEBAR_GIZLI_VARSAYILAN, SIDEBAR_YETKI_OGELERI } from "@/lib/panel/menu-gruplari";

type SonucDurumu = { success: boolean; message: string } | null;

const rolSemasi = z.enum(["klinik_admin", "resepsiyon", "terapist", "muhasebe"]);
const anahtarSemasi = z.enum(SIDEBAR_YETKI_OGELERI.map((o) => o.key) as [string, ...string[]]);

/**
 * Ayarlar > Yetkilendirme'deki "Sidebar Menü Görünürlüğü" — QR Kodları/Tablet
 * Ayarları'ndaki aynı read-modify-write deseni: klinik_ayarlar.ayarlar tek
 * jsonb kolonu, "sidebar_gizli" anahtarı { [rol]: gizli_anahtar[] } şeklinde.
 * Hiç ayarlanmamış roller SIDEBAR_GIZLI_VARSAYILAN'a düşer (sidebar.tsx'teki
 * eski sabit "terapist Finans'ı görmez" kuralıyla aynı) — bu action ilk kez
 * çağrıldığında o varsayılanın üzerine yazıyor, sonrasında hep DB'deki değer
 * geçerli olur.
 */
export async function sidebarMenuGorunurlukDegistir(
  rolHam: string,
  anahtarHam: string,
  gorunur: boolean
): Promise<SonucDurumu> {
  const rolAyristirma = rolSemasi.safeParse(rolHam);
  const anahtarAyristirma = anahtarSemasi.safeParse(anahtarHam);
  if (!rolAyristirma.success || !anahtarAyristirma.success) {
    return { success: false, message: "Geçersiz istek." };
  }
  const rol = rolAyristirma.data;
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
  const mevcutRolListesi = mevcutSidebarGizli[rol] ?? SIDEBAR_GIZLI_VARSAYILAN[rol] ?? [];

  const yeniRolListesi = gorunur
    ? mevcutRolListesi.filter((k) => k !== anahtar)
    : mevcutRolListesi.includes(anahtar)
      ? mevcutRolListesi
      : [...mevcutRolListesi, anahtar];

  const guncelAyarlar = {
    ...mevcutAyarlar,
    sidebar_gizli: { ...mevcutSidebarGizli, [rol]: yeniRolListesi },
  };

  const { error } = await supabase
    .from("klinik_ayarlar")
    .upsert({ klinik_id: klinikId, ayarlar: guncelAyarlar }, { onConflict: "klinik_id" });

  if (error) {
    console.error("Sidebar menü görünürlüğü güncellenemedi:", error);
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/ayarlar/yetkilendirme");
  // Sidebar tüm /panel altında ortak layout'tan geliyor — rolü değişen
  // kullanıcı bir sonraki sayfa geçişinde güncel listeyi görür.
  revalidatePath("/panel", "layout");
  return { success: true, message: gorunur ? "Menü açıldı." : "Menü kapatıldı." };
}
