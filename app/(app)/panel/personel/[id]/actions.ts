"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type SonucDurumu = { success: boolean; message: string } | null;

function bosIseNull(deger: FormDataEntryValue | null) {
  if (deger == null) return null;
  const s = String(deger).trim();
  return s === "" ? null : s;
}

const maasAyarSemasi = z.object({
  maas: z.coerce.number().min(0, "Maaş 0'dan küçük olamaz.").nullable(),
  maas_gecerlilik_tarihi: z.string().min(1, "Geçerlilik tarihi seçilmeli."),
  maas_hesaplama_modeli: z.enum(["sabit", "islem_basi_prim", "barajli_prim"]),
  prim_sabit_tutar: z.coerce.number().min(0, "Prim tutarı 0'dan küçük olamaz.").nullable(),
  baraj_seans_sayisi: z.coerce.number().int("Tam sayı olmalı.").min(1, "Baraj en az 1 seans olmalı.").nullable(),
  baraj_bonus_tutari: z.coerce.number().min(0, "Bonus tutarı 0'dan küçük olamaz.").nullable(),
});

const hakedisSemasi = z.object({
  tur: z.enum(["yol", "yemek", "mesai", "avans", "diger"]),
  tutar: z.coerce.number().positive("Tutar 0'dan büyük olmalı."),
  tarih: z.string().min(1, "Tarih seçilmeli."),
  aciklama: z.string().trim().optional(),
});

const pinSemasi = z.object({
  pin: z.string().regex(/^\d{6}$/, "PIN 6 haneli rakamlardan oluşmalı."),
});

async function yetkiliBaglantiGetir() {
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

  return { supabase, klinikId: kullanici?.klinik_id ?? null, rol: kullanici?.rol ?? null };
}

export async function maasAyarlariGuncelle(
  personelId: string,
  terapistId: string,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const { supabase, klinikId, rol } = await yetkiliBaglantiGetir();
  if (!klinikId) {
    return { success: false, message: "Klinik bilgisi bulunamadı." };
  }
  if (rol !== "klinik_admin") {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const ayristirma = maasAyarSemasi.safeParse({
    maas: bosIseNull(formData.get("maas")),
    maas_gecerlilik_tarihi: formData.get("maas_gecerlilik_tarihi"),
    maas_hesaplama_modeli: formData.get("maas_hesaplama_modeli"),
    prim_sabit_tutar: bosIseNull(formData.get("prim_sabit_tutar")),
    baraj_seans_sayisi: bosIseNull(formData.get("baraj_seans_sayisi")),
    baraj_bonus_tutari: bosIseNull(formData.get("baraj_bonus_tutari")),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const {
    maas,
    maas_gecerlilik_tarihi,
    maas_hesaplama_modeli,
    prim_sabit_tutar,
    baraj_seans_sayisi,
    baraj_bonus_tutari,
  } = ayristirma.data;

  const { data: eskiPersonel } = await supabase.from("personel").select("maas").eq("id", personelId).single();

  const [personelSonucu, terapistSonucu] = await Promise.all([
    supabase.from("personel").update({ maas }).eq("id", personelId),
    supabase
      .from("terapist")
      .update({
        maas_hesaplama_modeli,
        prim_sabit_tutar,
        baraj_seans_sayisi,
        baraj_bonus_tutari,
      })
      .eq("id", terapistId),
  ]);

  if (personelSonucu.error || terapistSonucu.error) {
    console.error("Maaş ayarları güncellenemedi:", personelSonucu.error, terapistSonucu.error);
    return { success: false, message: "Maaş ayarları güncellenemedi, lütfen tekrar deneyin." };
  }

  // Maaş fiilen değiştiyse geçmişe bir satır düşülür (kullanıcı kararı: "hangi
  // tarihte hangi maaşı alıyor kayıt olsun") — prim/baraj ayarı değişse bile
  // maaş aynıysa geçmiş tabloya gereksiz tekrar satır eklenmez.
  if (maas != null && maas !== eskiPersonel?.maas) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error: gecmisHata } = await supabase.from("personel_maas_gecmisi").insert({
      klinik_id: klinikId,
      personel_id: personelId,
      maas,
      gecerlilik_tarihi: maas_gecerlilik_tarihi,
      ekleyen_kullanici_id: user?.id ?? null,
    });

    if (gecmisHata) {
      console.error("Maaş geçmişi kaydedilemedi:", gecmisHata);
    }
  }

  revalidatePath(`/panel/personel/${personelId}`);
  return { success: true, message: "Maaş ayarları güncellendi." };
}

export async function hakedisEkle(
  personelId: string,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const { supabase, klinikId, rol } = await yetkiliBaglantiGetir();
  if (!klinikId) {
    return { success: false, message: "Klinik bilgisi bulunamadı." };
  }
  if (rol !== "klinik_admin") {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const ayristirma = hakedisSemasi.safeParse({
    tur: formData.get("tur"),
    tutar: formData.get("tutar"),
    tarih: formData.get("tarih"),
    aciklama: formData.get("aciklama") ?? "",
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { tur, tutar, tarih, aciklama } = ayristirma.data;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("personel_ekstra_hakedis").insert({
    klinik_id: klinikId,
    personel_id: personelId,
    tur,
    tutar,
    tarih,
    aciklama: aciklama ? aciklama : null,
    ekleyen_kullanici_id: user?.id ?? null,
  });

  if (error) {
    console.error("Ödeme eklenemedi:", error);
    return { success: false, message: "Ödeme eklenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath(`/panel/personel/${personelId}`);
  return { success: true, message: "Ödeme eklendi." };
}

/**
 * Puantaj PIN'i — personel klinik kapısındaki QR'ı okutup kendi giriş/çıkış
 * saatini kaydedebilsin diye (bkz. app/(app)/puantaj/[klinikId]/[tur]).
 * Bilinçli olarak admin'e kısıtlanmıyor — personelin KENDİSİ de kendi
 * PIN'ini belirleyebilmeli; yetki kontrolü tamamen personel_puantaj_pin_belirle
 * RPC'sinin içinde (is_super_admin OR admin-kendi-kliniginde OR kendisi,
 * COALESCE ile fail-closed).
 */
export async function personelPuantajPinBelirle(personelId: string, _onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const { supabase } = await yetkiliBaglantiGetir();

  const ayristirma = pinSemasi.safeParse({ pin: formData.get("pin") });
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "PIN geçersiz." };
  }

  const { error } = await supabase.rpc("personel_puantaj_pin_belirle", {
    p_personel_id: personelId,
    p_yeni_pin: ayristirma.data.pin,
  });

  if (error) {
    console.error("Puantaj PIN'i belirlenemedi:", error);
    const mesaj =
      error.message === "pin_kullanimda"
        ? "Bu PIN klinikteki başka bir personel tarafından kullanılıyor, farklı bir PIN seçin."
        : error.message === "yetkisiz"
          ? "Bu işlem için yetkiniz yok."
          : "PIN belirlenemedi, lütfen tekrar deneyin.";
    return { success: false, message: mesaj };
  }

  revalidatePath(`/panel/personel/${personelId}`);
  return { success: true, message: "Puantaj PIN'i belirlendi." };
}

/** Sadece klinik_admin — personel PIN'ini unuttuğunda temizler. */
export async function personelPuantajPinSifirla(personelId: string): Promise<SonucDurumu> {
  const { supabase, rol } = await yetkiliBaglantiGetir();
  if (rol !== "klinik_admin") {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const { error } = await supabase.rpc("personel_puantaj_pin_sifirla", { p_personel_id: personelId });

  if (error) {
    console.error("Puantaj PIN'i sıfırlanamadı:", error);
    return { success: false, message: "PIN sıfırlanamadı, lütfen tekrar deneyin." };
  }

  revalidatePath(`/panel/personel/${personelId}`);
  return { success: true, message: "Puantaj PIN'i sıfırlandı." };
}
