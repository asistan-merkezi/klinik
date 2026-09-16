"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { nakitBankaHareketiOlustur, nakitBankaHareketiSil as nakitBankaHareketiSilDb } from "@/lib/finans/nakit-banka-hareketi";

type SonucDurumu = { success: boolean; message: string } | null;

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

  return { supabase, user, klinikId: kullanici?.klinik_id ?? null, rol: kullanici?.rol ?? null };
}

const girenSemasi = z.object({
  hedef_banka_hesap_id: z.string().trim().min(1, "Hesap seçilmeli."),
  odeme_yontemi: z.enum(["nakit", "banka_havalesi"]),
  karsi_taraf_adi: z.string().trim().min(1, "Gönderen adı girilmeli."),
  karsi_taraf_banka: z.string().trim().optional(),
  karsi_taraf_iban: z.string().trim().optional(),
  tutar: z.coerce.number().positive("Tutar 0'dan büyük olmalı."),
  tarih: z.string().min(1, "Tarih seçilmeli."),
  aciklama: z.string().trim().optional(),
});

export async function bankayaGirenEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const { supabase, user, klinikId, rol } = await yetkiliBaglantiGetir();
  if (!klinikId) return { success: false, message: "Klinik bilgisi bulunamadı." };
  if (rol !== "klinik_admin") return { success: false, message: "Bu işlem için yetkiniz yok." };

  const ayristirma = girenSemasi.safeParse({
    hedef_banka_hesap_id: formData.get("hedef_banka_hesap_id"),
    odeme_yontemi: formData.get("odeme_yontemi"),
    karsi_taraf_adi: formData.get("karsi_taraf_adi"),
    karsi_taraf_banka: formData.get("karsi_taraf_banka") ?? "",
    karsi_taraf_iban: formData.get("karsi_taraf_iban") ?? "",
    tutar: formData.get("tutar"),
    tarih: formData.get("tarih"),
    aciklama: formData.get("aciklama") ?? "",
  });
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }
  const veri = ayristirma.data;

  const { error } = await nakitBankaHareketiOlustur(supabase, klinikId, user!.id, {
    tip: "gelen",
    kaynakKasa: false,
    kaynakBankaHesapId: null,
    hedefKasa: false,
    hedefBankaHesapId: veri.hedef_banka_hesap_id,
    odemeYontemi: veri.odeme_yontemi,
    karsiTarafAdi: veri.karsi_taraf_adi,
    karsiTarafBanka: veri.odeme_yontemi === "banka_havalesi" && veri.karsi_taraf_banka ? veri.karsi_taraf_banka : null,
    karsiTarafIban: veri.odeme_yontemi === "banka_havalesi" && veri.karsi_taraf_iban ? veri.karsi_taraf_iban : null,
    aciklama: veri.aciklama ? veri.aciklama : null,
    tutar: veri.tutar,
    tarih: veri.tarih,
  });
  if (error) return { success: false, message: error };

  revalidatePath("/panel/finans/banka");
  return { success: true, message: "Bankaya giriş kaydedildi." };
}

const cikanDigerSemasi = z.object({
  kaynak_banka_hesap_id: z.string().trim().min(1, "Hesap seçilmeli."),
  karsi_taraf_adi: z.string().trim().min(1, "Alıcı adı girilmeli."),
  karsi_taraf_banka: z.string().trim().optional(),
  karsi_taraf_iban: z.string().trim().optional(),
  tutar: z.coerce.number().positive("Tutar 0'dan büyük olmalı."),
  tarih: z.string().min(1, "Tarih seçilmeli."),
  aciklama: z.string().trim().optional(),
});

export async function bankadanDigerCikanEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const { supabase, user, klinikId, rol } = await yetkiliBaglantiGetir();
  if (!klinikId) return { success: false, message: "Klinik bilgisi bulunamadı." };
  if (rol !== "klinik_admin") return { success: false, message: "Bu işlem için yetkiniz yok." };

  const ayristirma = cikanDigerSemasi.safeParse({
    kaynak_banka_hesap_id: formData.get("kaynak_banka_hesap_id"),
    karsi_taraf_adi: formData.get("karsi_taraf_adi"),
    karsi_taraf_banka: formData.get("karsi_taraf_banka") ?? "",
    karsi_taraf_iban: formData.get("karsi_taraf_iban") ?? "",
    tutar: formData.get("tutar"),
    tarih: formData.get("tarih"),
    aciklama: formData.get("aciklama") ?? "",
  });
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }
  const veri = ayristirma.data;

  const { error } = await nakitBankaHareketiOlustur(supabase, klinikId, user!.id, {
    tip: "giden",
    kaynakKasa: false,
    kaynakBankaHesapId: veri.kaynak_banka_hesap_id,
    hedefKasa: false,
    hedefBankaHesapId: null,
    odemeYontemi: null,
    karsiTarafAdi: veri.karsi_taraf_adi,
    karsiTarafBanka: veri.karsi_taraf_banka ? veri.karsi_taraf_banka : null,
    karsiTarafIban: veri.karsi_taraf_iban ? veri.karsi_taraf_iban : null,
    aciklama: veri.aciklama ? veri.aciklama : null,
    tutar: veri.tutar,
    tarih: veri.tarih,
  });
  if (error) return { success: false, message: error };

  revalidatePath("/panel/finans/banka");
  return { success: true, message: "Bankadan çıkış kaydedildi." };
}

const transferSemasi = z.object({
  kaynak_banka_hesap_id: z.string().trim().min(1, "Kaynak hesap seçilmeli."),
  hedef: z.string().trim().min(1, "Hedef seçilmeli."), // "kasa" veya bir banka_hesap_id
  tutar: z.coerce.number().positive("Tutar 0'dan büyük olmalı."),
  tarih: z.string().min(1, "Tarih seçilmeli."),
  aciklama: z.string().trim().optional(),
});

export async function bankadanTransferEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const { supabase, user, klinikId, rol } = await yetkiliBaglantiGetir();
  if (!klinikId) return { success: false, message: "Klinik bilgisi bulunamadı." };
  if (rol !== "klinik_admin") return { success: false, message: "Bu işlem için yetkiniz yok." };

  const ayristirma = transferSemasi.safeParse({
    kaynak_banka_hesap_id: formData.get("kaynak_banka_hesap_id"),
    hedef: formData.get("hedef"),
    tutar: formData.get("tutar"),
    tarih: formData.get("tarih"),
    aciklama: formData.get("aciklama") ?? "",
  });
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }
  const veri = ayristirma.data;
  const hedefKasa = veri.hedef === "kasa";

  const { error } = await nakitBankaHareketiOlustur(supabase, klinikId, user!.id, {
    tip: "hesaplar_arasi",
    kaynakKasa: false,
    kaynakBankaHesapId: veri.kaynak_banka_hesap_id,
    hedefKasa,
    hedefBankaHesapId: hedefKasa ? null : veri.hedef,
    odemeYontemi: null,
    karsiTarafAdi: null,
    karsiTarafBanka: null,
    karsiTarafIban: null,
    aciklama: veri.aciklama ? veri.aciklama : null,
    tutar: veri.tutar,
    tarih: veri.tarih,
  });
  if (error) return { success: false, message: error };

  revalidatePath("/panel/finans/banka");
  revalidatePath("/panel/finans/kasa");
  return { success: true, message: "Transfer kaydedildi." };
}

export async function nakitBankaHareketiSil(id: string): Promise<SonucDurumu> {
  const { supabase, rol } = await yetkiliBaglantiGetir();
  if (rol !== "klinik_admin") {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const { error } = await nakitBankaHareketiSilDb(supabase, id);
  if (error) return { success: false, message: error };

  revalidatePath("/panel/finans/banka");
  revalidatePath("/panel/finans/kasa");
  return { success: true, message: "Hareket silindi." };
}

const personelOdemeSemasi = z.object({
  personel_id: z.string().trim().min(1, "Personel seçilmeli."),
  banka_hesap_id: z.string().trim().min(1, "Hesap seçilmeli."),
  tur: z.enum(["odeme", "avans"]),
  tutar: z.coerce.number().positive("Tutar 0'dan büyük olmalı."),
  tarih: z.string().min(1, "Tarih seçilmeli."),
  aciklama: z.string().trim().optional(),
});

/** Kasa'daki kasaPersonelOdemesiEkle'nin banka karşılığı — bkz. oradaki not (hesapHareketiEkle reuse edilmiyor). */
export async function bankaPersonelOdemesiEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const { supabase, klinikId, rol } = await yetkiliBaglantiGetir();
  if (!klinikId) return { success: false, message: "Klinik bilgisi bulunamadı." };
  if (rol !== "klinik_admin") return { success: false, message: "Bu işlem için yetkiniz yok." };

  const ayristirma = personelOdemeSemasi.safeParse({
    personel_id: formData.get("personel_id"),
    banka_hesap_id: formData.get("banka_hesap_id"),
    tur: formData.get("tur"),
    tutar: formData.get("tutar"),
    tarih: formData.get("tarih"),
    aciklama: formData.get("aciklama") ?? "",
  });
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { personel_id, banka_hesap_id, tur, tutar, tarih, aciklama } = ayristirma.data;
  const { error } = await supabase.rpc("personel_hesap_hareket_ekle", {
    p_personel_id: personel_id,
    p_tur: tur,
    p_tutar: tutar,
    p_tarih: tarih,
    p_aciklama: aciklama ? aciklama : null,
    p_odeme_tipi: "havale",
    p_banka_hesap_id: banka_hesap_id,
  });

  if (error) {
    console.error("Personel ödemesi eklenemedi:", error);
    return { success: false, message: "Eklenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/finans/banka");
  return { success: true, message: "Personel ödemesi kaydedildi." };
}
