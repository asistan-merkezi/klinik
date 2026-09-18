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

export async function pozisyonSistemErisimiDegistir(pozisyonId: string, yeniDurum: boolean): Promise<SonucDurumu> {
  const { supabase, klinikId, yetkisiz } = await yetkiliKlinikAdminGetir();
  if (yetkisiz || !klinikId) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const { error } = await supabase
    .from("pozisyonlar")
    .update({ sistem_erisimi: yeniDurum })
    .eq("id", pozisyonId)
    .eq("klinik_id", klinikId);

  if (error) {
    console.error("Pozisyon sistem erişimi değiştirilemedi:", error);
    return { success: false, message: "Değiştirilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/ayarlar/personel-tanimlama");
  return {
    success: true,
    message: yeniDurum ? "Sistem erişimi açıldı." : "Sistem erişimi kapatıldı.",
  };
}

const ozelPozisyonSemasi = z.object({
  grup: z.string().trim().min(1, "Departman seçilmeli."),
  ad: z.string().trim().min(1, "Ünvan zorunlu."),
});

export async function ozelPozisyonOlustur(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const { supabase, klinikId, yetkisiz } = await yetkiliKlinikAdminGetir();
  if (yetkisiz || !klinikId) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const ayristirma = ozelPozisyonSemasi.safeParse({
    grup: formData.get("grup"),
    ad: formData.get("ad"),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { grup, ad } = ayristirma.data;

  // Rol/ücret tipi/puantaj modu artık ayrıca sorulmuyor — seçilen departmandaki
  // mevcut bir pozisyondan (en küçük sıralı) devralınır, yeni ünvan aynı
  // departmanın tipik ayarlarıyla sisteme girer.
  const { data: ornekPozisyon } = await supabase
    .from("pozisyonlar")
    .select("varsayilan_rol, ucret_tipi, puantaj_modu")
    .eq("klinik_id", klinikId)
    .eq("grup", grup)
    .order("sira", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!ornekPozisyon) {
    return { success: false, message: "Departman bulunamadı." };
  }

  const { error } = await supabase.from("pozisyonlar").insert({
    klinik_id: klinikId,
    ad,
    grup,
    sira: 999,
    sistem_erisimi: false,
    varsayilan_rol: ornekPozisyon.varsayilan_rol,
    ucret_tipi: ornekPozisyon.ucret_tipi,
    puantaj_modu: ornekPozisyon.puantaj_modu,
    ozel_mi: true,
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
