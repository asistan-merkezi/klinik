"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type SonucDurumu = { success: boolean; message: string } | null;

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

// ---------------------------------------------------------------------
// Pozisyonlar
// ---------------------------------------------------------------------
const pozisyonSemasi = z.object({
  grup: z.string().trim().min(1, "Grup zorunlu."),
  sira: z.coerce.number().int().default(0),
  sistem_erisimi: z.coerce.boolean(),
  varsayilan_rol: z.enum(["klinik_admin", "resepsiyon", "terapist", "muhasebe"]),
  ucret_tipi: z.enum(["aylik_maas", "prim_usulu"]),
  puantaj_modu: z.enum(["gunluk", "esnek", "takipsiz"]),
});

export async function pozisyonGuncelle(pozisyonId: string, _onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const { supabase, klinikId, yetkisiz } = await yetkiliKlinikAdminGetir();
  if (yetkisiz || !klinikId) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const ayristirma = pozisyonSemasi.safeParse({
    grup: formData.get("grup"),
    sira: formData.get("sira") || 0,
    sistem_erisimi: formData.get("sistem_erisimi") === "on",
    varsayilan_rol: formData.get("varsayilan_rol"),
    ucret_tipi: formData.get("ucret_tipi"),
    puantaj_modu: formData.get("puantaj_modu"),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { error } = await supabase
    .from("pozisyonlar")
    .update(ayristirma.data)
    .eq("id", pozisyonId)
    .eq("klinik_id", klinikId);

  if (error) {
    console.error("Pozisyon güncellenemedi:", error);
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/ayarlar/personel-tanimlama");
  return { success: true, message: "Pozisyon güncellendi." };
}

export async function pozisyonAktifDurumDegistir(pozisyonId: string, yeniDurum: boolean): Promise<SonucDurumu> {
  const { supabase, klinikId, yetkisiz } = await yetkiliKlinikAdminGetir();
  if (yetkisiz || !klinikId) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const { error } = await supabase
    .from("pozisyonlar")
    .update({ aktif: yeniDurum })
    .eq("id", pozisyonId)
    .eq("klinik_id", klinikId);

  if (error) {
    console.error("Pozisyon durumu değiştirilemedi:", error);
    const mesaj =
      error.message?.includes("pozisyon_personel_bagli")
        ? "Bu pozisyonda hâlâ aktif personel var — önce onları başka bir pozisyona taşıyın."
        : "Değiştirilemedi, lütfen tekrar deneyin.";
    return { success: false, message: mesaj };
  }

  revalidatePath("/panel/ayarlar/personel-tanimlama");
  return { success: true, message: yeniDurum ? "Pozisyon aktifleştirildi." : "Pozisyon pasife alındı." };
}

const ozelPozisyonSemasi = pozisyonSemasi.extend({
  ad: z.string().trim().min(1, "Pozisyon adı zorunlu."),
});

export async function ozelPozisyonOlustur(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const { supabase, klinikId, yetkisiz } = await yetkiliKlinikAdminGetir();
  if (yetkisiz || !klinikId) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const ayristirma = ozelPozisyonSemasi.safeParse({
    ad: formData.get("ad"),
    grup: formData.get("grup") || "Diğer",
    sira: 999,
    sistem_erisimi: formData.get("sistem_erisimi") === "on",
    varsayilan_rol: formData.get("varsayilan_rol"),
    ucret_tipi: formData.get("ucret_tipi"),
    puantaj_modu: formData.get("puantaj_modu"),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { error } = await supabase.from("pozisyonlar").insert({
    klinik_id: klinikId,
    ozel_mi: true,
    ...ayristirma.data,
  });

  if (error) {
    console.error("Özel pozisyon oluşturulamadı:", error);
    if (error.code === "23505") {
      return { success: false, message: "Bu isimde bir pozisyon zaten var." };
    }
    return { success: false, message: "Oluşturulamadı, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/ayarlar/personel-tanimlama");
  return { success: true, message: "Özel pozisyon eklendi." };
}
