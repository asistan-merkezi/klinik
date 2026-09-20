"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { MODULE_TREE, type ModuleNode } from "@/lib/auth/roles";

type SonucDurumu = { success: boolean; message: string } | null;

function tumAnahtarlar(dugumler: ModuleNode[], sonuc: string[] = []): string[] {
  for (const dugum of dugumler) {
    sonuc.push(dugum.key);
    if (dugum.children) tumAnahtarlar(dugum.children, sonuc);
  }
  return sonuc;
}

const GECERLI_ANAHTARLAR = new Set(tumAnahtarlar(MODULE_TREE));

const izinSemasi = z
  .array(z.string())
  .refine((liste) => liste.every((k) => GECERLI_ANAHTARLAR.has(k)), { message: "Geçersiz modül anahtarı." });

async function yetkiliKlinikAdminGetir() {
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
    return { supabase, klinikId: null as string | null, yetkisiz: true as const };
  }

  return { supabase, klinikId: kullanici.klinik_id, yetkisiz: false as const };
}

/**
 * Ayarlar > Yetkilendirme'deki "Modül İzinleri" — bir pozisyonun varsayılan
 * erişim ağacını (pozisyonlar.allowed_modules) yazar. Sidebar ve hub sayfa
 * korumasının (lib/auth/roles.ts) TEK okuduğu kaynak burasıdır.
 */
export async function pozisyonIzinleriGuncelle(pozisyonId: string, allowedModules: string[]): Promise<SonucDurumu> {
  const { supabase, klinikId, yetkisiz } = await yetkiliKlinikAdminGetir();
  if (yetkisiz || !klinikId) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const ayristirma = izinSemasi.safeParse(allowedModules);
  if (!ayristirma.success) {
    return { success: false, message: "Geçersiz modül seçimi." };
  }

  const { error } = await supabase
    .from("pozisyonlar")
    .update({ allowed_modules: ayristirma.data })
    .eq("id", pozisyonId)
    .eq("klinik_id", klinikId);

  if (error) {
    console.error("Pozisyon izinleri güncellenemedi:", error);
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/ayarlar/yetkilendirme");
  // Sidebar tüm /panel altında ortak layout'tan geliyor — izni değişen
  // pozisyondaki kullanıcılar bir sonraki sayfa geçişinde güncel listeyi görür.
  revalidatePath("/panel", "layout");
  return { success: true, message: "İzinler güncellendi." };
}
