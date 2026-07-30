"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type SonucDurumu = { success: boolean; message: string; geciciSifre?: string } | null;

const KARAKTER_HAVUZU = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function geciciSifreUret(): string {
  let sifre = "";
  for (let i = 0; i < 10; i++) {
    sifre += KARAKTER_HAVUZU[Math.floor(Math.random() * KARAKTER_HAVUZU.length)];
  }
  return sifre;
}

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

  if (kullanici?.rol !== "klinik_admin" || !kullanici.klinik_id) {
    return { supabase, klinikId: null as string | null, yetkisiz: true as const };
  }

  return { supabase, klinikId: kullanici.klinik_id, yetkisiz: false as const };
}

const personelSemasi = z.object({
  ad_soyad: z.string().trim().min(2, "Ad soyad en az 2 karakter olmalı."),
  tc_kimlik_no: z
    .string()
    .trim()
    .regex(/^\d{11}$/, "T.C. Kimlik No 11 haneli olmalı.")
    .optional()
    .or(z.literal("")),
  eposta: z.string().trim().email("Geçersiz kurumsal e-posta."),
  gsm: z
    .string()
    .trim()
    .min(7, "GSM numarası geçersiz.")
    .max(20, "GSM numarası geçersiz.")
    .regex(/^[0-9+ ]+$/, "GSM sadece rakam, boşluk ve + içerebilir."),
  unvan: z.string().trim().min(2, "Unvan/branş en az 2 karakter olmalı."),
  uzmanlik_tescil_no: z.string().trim().optional().or(z.literal("")),
  il: z.string().trim().optional().or(z.literal("")),
  ilce: z.string().trim().optional().or(z.literal("")),
  mahalle: z.string().trim().optional().or(z.literal("")),
  adres: z.string().trim().optional().or(z.literal("")),
  rol: z.enum(["klinik_admin", "resepsiyon", "terapist", "muhasebe"]),
});

export async function personelHesabiOlustur(
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const { klinikId, yetkisiz } = await yetkiliKlinikAdminGetir();
  if (yetkisiz || !klinikId) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const ayristirma = personelSemasi.safeParse({
    ad_soyad: formData.get("ad_soyad"),
    tc_kimlik_no: formData.get("tc_kimlik_no") ?? "",
    eposta: formData.get("eposta"),
    gsm: formData.get("gsm"),
    unvan: formData.get("unvan"),
    uzmanlik_tescil_no: formData.get("uzmanlik_tescil_no") ?? "",
    il: formData.get("adres_il") ?? "",
    ilce: formData.get("adres_ilce") ?? "",
    mahalle: formData.get("adres_mahalle") ?? "",
    adres: formData.get("adres") ?? "",
    rol: formData.get("rol"),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { ad_soyad, tc_kimlik_no, eposta, gsm, unvan, uzmanlik_tescil_no, il, ilce, mahalle, adres, rol } =
    ayristirma.data;

  const adminClient = createAdminClient();
  const geciciSifre = geciciSifreUret();

  const { data: yeniKullanici, error: createError } = await adminClient.auth.admin.createUser({
    email: eposta,
    password: geciciSifre,
    email_confirm: true,
  });

  if (createError || !yeniKullanici.user) {
    console.error("Personel auth hesabı oluşturulamadı:", createError);
    if (createError?.code === "email_exists") {
      return { success: false, message: "Bu e-posta adresi zaten kullanılıyor." };
    }
    return { success: false, message: "Hesap oluşturulamadı, lütfen tekrar deneyin." };
  }

  const { error: kullaniciError } = await adminClient.from("kullanici").insert({
    id: yeniKullanici.user.id,
    klinik_id: klinikId,
    rol,
    ad_soyad,
    telefon: gsm,
  });

  if (kullaniciError) {
    console.error("kullanici eklenemedi:", kullaniciError);
    await adminClient.auth.admin.deleteUser(yeniKullanici.user.id);
    return { success: false, message: "Hesap oluşturulamadı, lütfen tekrar deneyin." };
  }

  const { data: yeniPersonel, error: personelError } = await adminClient
    .from("personel")
    .insert({
      klinik_id: klinikId,
      kullanici_id: yeniKullanici.user.id,
      ad_soyad,
      gorev: unvan,
      tc_kimlik_no: tc_kimlik_no || null,
      uzmanlik_tescil_no: uzmanlik_tescil_no || null,
      il: il || null,
      ilce: ilce || null,
      mahalle: mahalle || null,
      adres: adres || null,
      aktif: true,
    })
    .select("id")
    .single();

  if (personelError || !yeniPersonel) {
    console.error("personel eklenemedi:", personelError);
    await adminClient.from("kullanici").delete().eq("id", yeniKullanici.user.id);
    await adminClient.auth.admin.deleteUser(yeniKullanici.user.id);
    if (personelError?.code === "23505") {
      return { success: false, message: "Bu T.C. Kimlik No başka bir personelde kayıtlı." };
    }
    return { success: false, message: "Hesap oluşturulamadı, lütfen tekrar deneyin." };
  }

  if (rol === "terapist") {
    const { error: terapistError } = await adminClient.from("terapist").insert({
      klinik_id: klinikId,
      personel_id: yeniPersonel.id,
    });

    if (terapistError) {
      console.error("terapist eklenemedi:", terapistError);
      // personel/kullanici zaten oluştu; terapist alt kaydı elle tekrar denenebilir,
      // tüm hesabı geri almak (personel geçmişi varsa) riskli olur.
      return {
        success: true,
        message: "Hesap oluşturuldu ama terapist ayarları kaydedilemedi, lütfen tekrar deneyin.",
        geciciSifre,
      };
    }
  }

  revalidatePath("/panel/personel");
  return { success: true, message: "Personel hesabı oluşturuldu.", geciciSifre };
}
