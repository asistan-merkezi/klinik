"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { toUTC } from "@/lib/datetime";
import { sonrakiGun } from "@/lib/puantaj";

type SonucDurumu = { success: boolean; message: string } | null;

async function yetkiliBaglantiGetir() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("klinik_id, rol").eq("id", user.id).single();

  return { supabase, klinikId: kullanici?.klinik_id ?? null, rol: kullanici?.rol ?? null };
}

function bosIseUndefined(deger: FormDataEntryValue | null): string | undefined {
  if (deger == null) return undefined;
  const s = String(deger).trim();
  return s === "" ? undefined : s;
}

const gunSemasi = z.object({
  giris_saat: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  cikis_saat: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  mola_dakika: z.coerce.number().int().min(0, "Mola 0'dan küçük olamaz."),
  durum: z.enum(["calisti", "izinli", "raporlu", "gelmedi", "resmi_tatil"]).optional(),
  not_metni: z.string().trim().optional(),
});

export async function gunKaydet(
  personelId: string,
  tarih: string,
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

  const durumHam = bosIseUndefined(formData.get("durum"));

  const ayristirma = gunSemasi.safeParse({
    giris_saat: bosIseUndefined(formData.get("giris_saat")),
    cikis_saat: bosIseUndefined(formData.get("cikis_saat")),
    mola_dakika: formData.get("mola_dakika") || 0,
    // "otomatik" -> undefined: DB'ye hiç gönderilmez, INSERT'te trigger izinden
    // tespit eder, UPDATE'te mevcut değer dokunulmadan kalır.
    durum: durumHam === "otomatik" ? undefined : durumHam,
    not_metni: bosIseUndefined(formData.get("not_metni")),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { giris_saat, cikis_saat, mola_dakika, durum, not_metni } = ayristirma.data;

  if (giris_saat && cikis_saat && cikis_saat === giris_saat) {
    return { success: false, message: "Giriş ve çıkış saati aynı olamaz." };
  }

  const girisIso = giris_saat ? toUTC(`${tarih}T${giris_saat}:00`) : null;
  let cikisIso: string | null = null;
  if (cikis_saat) {
    // Gece vardiyası: çıkış saati giriş saatinden erkense ertesi güne sarkmış kabul edilir.
    const cikisTarih = giris_saat && cikis_saat < giris_saat ? sonrakiGun(tarih) : tarih;
    cikisIso = toUTC(`${cikisTarih}T${cikis_saat}:00`);
  }

  const payload: Record<string, unknown> = {
    personel_id: personelId,
    tarih,
    giris_saat: girisIso,
    cikis_saat: cikisIso,
    mola_dakika,
    not_metni: not_metni ?? null,
  };
  if (durum) payload.durum = durum;

  const { error } = await supabase.from("personel_puantaj").upsert(payload, { onConflict: "personel_id,tarih" });

  if (error) {
    console.error("Puantaj günü kaydedilemedi:", error);
    if (error.code === "42501" || error.message?.includes("row-level security")) {
      return { success: false, message: "Bu ay dönemi kapalı olduğu için düzenlenemiyor." };
    }
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath(`/panel/personel/${personelId}/calisma-cizelgesi`);
  revalidatePath(`/panel/personel/${personelId}`);
  return { success: true, message: "Gün kaydedildi." };
}

export async function fmOnayGuncelle(
  personelId: string,
  puantajId: string,
  yeniDurum: "onaylandi" | "reddedildi" | "bekliyor"
): Promise<SonucDurumu> {
  const { supabase, klinikId, rol } = await yetkiliBaglantiGetir();
  if (!klinikId) {
    return { success: false, message: "Klinik bilgisi bulunamadı." };
  }
  if (rol !== "klinik_admin") {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const { error } = await supabase
    .from("personel_puantaj")
    .update({ fm_onay_durumu: yeniDurum })
    .eq("id", puantajId);

  if (error) {
    console.error("FM onay durumu güncellenemedi:", error);
    return { success: false, message: "Güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath(`/panel/personel/${personelId}/calisma-cizelgesi`);
  revalidatePath(`/panel/personel/${personelId}`);
  return { success: true, message: "FM onay durumu güncellendi." };
}

export async function donemKapat(personelId: string, yil: number, ay: number): Promise<SonucDurumu> {
  const { supabase, klinikId, rol } = await yetkiliBaglantiGetir();
  if (!klinikId) {
    return { success: false, message: "Klinik bilgisi bulunamadı." };
  }
  if (rol !== "klinik_admin") {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const { error } = await supabase.rpc("personel_puantaj_donem_kapat", {
    p_personel_id: personelId,
    p_yil: yil,
    p_ay: ay,
  });

  if (error) {
    console.error("Dönem kapatılamadı:", error);
    const mesaj = error.message === "donem_zaten_kapali" ? "Bu dönem zaten kapalı." : "Dönem kapatılamadı, lütfen tekrar deneyin.";
    return { success: false, message: mesaj };
  }

  revalidatePath(`/panel/personel/${personelId}/calisma-cizelgesi`);
  revalidatePath(`/panel/personel/${personelId}`);
  return { success: true, message: "Dönem kapatıldı." };
}

export async function donemYenidenAc(personelId: string, yil: number, ay: number): Promise<SonucDurumu> {
  const { supabase, klinikId, rol } = await yetkiliBaglantiGetir();
  if (!klinikId) {
    return { success: false, message: "Klinik bilgisi bulunamadı." };
  }
  if (rol !== "klinik_admin") {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const { error } = await supabase.rpc("personel_puantaj_donem_yeniden_ac", {
    p_personel_id: personelId,
    p_yil: yil,
    p_ay: ay,
  });

  if (error) {
    console.error("Dönem yeniden açılamadı:", error);
    return { success: false, message: "Dönem yeniden açılamadı, lütfen tekrar deneyin." };
  }

  revalidatePath(`/panel/personel/${personelId}/calisma-cizelgesi`);
  revalidatePath(`/panel/personel/${personelId}`);
  return { success: true, message: "Dönem yeniden açıldı." };
}
