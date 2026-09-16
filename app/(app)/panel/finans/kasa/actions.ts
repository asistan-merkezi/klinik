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

const baslangicSemasi = z.object({
  baslangic_tutari: z.coerce.number().min(0, "0'dan küçük olamaz."),
});

export async function kasaBaslangicGuncelle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const { supabase, klinikId, rol } = await yetkiliBaglantiGetir();
  if (!klinikId) {
    return { success: false, message: "Klinik bilgisi bulunamadı." };
  }
  if (rol !== "klinik_admin") {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const ayristirma = baslangicSemasi.safeParse({ baslangic_tutari: formData.get("baslangic_tutari") });
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  // klinik_ayarlar.ayarlar tek bir jsonb kolonu — düz upsert diğer anahtarları
  // silebileceği için önce mevcut değeri okuyup üstüne "kasa" anahtarını yazıyoruz
  // (bkz. app/(app)/panel/tablet/ayarlar/actions.ts'teki aynı desen).
  const { data: mevcutSatir } = await supabase
    .from("klinik_ayarlar")
    .select("ayarlar")
    .eq("klinik_id", klinikId)
    .maybeSingle();

  const guncelAyarlar = {
    ...(mevcutSatir?.ayarlar as Record<string, unknown> | null),
    kasa: { baslangic_tutari: ayristirma.data.baslangic_tutari },
  };

  const { error } = await supabase
    .from("klinik_ayarlar")
    .upsert({ klinik_id: klinikId, ayarlar: guncelAyarlar }, { onConflict: "klinik_id" });

  if (error) {
    console.error("Kasa başlangıç tutarı güncellenemedi:", error);
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/finans/kasa");
  return { success: true, message: "Başlangıç tutarı güncellendi." };
}

const girenSemasi = z.object({
  karsi_taraf_adi: z.string().trim().min(1, "Gönderen adı girilmeli."),
  tutar: z.coerce.number().positive("Tutar 0'dan büyük olmalı."),
  tarih: z.string().min(1, "Tarih seçilmeli."),
  aciklama: z.string().trim().optional(),
});

export async function kasayaGirenEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const { supabase, user, klinikId, rol } = await yetkiliBaglantiGetir();
  if (!klinikId) return { success: false, message: "Klinik bilgisi bulunamadı." };
  if (rol !== "klinik_admin") return { success: false, message: "Bu işlem için yetkiniz yok." };

  const ayristirma = girenSemasi.safeParse({
    karsi_taraf_adi: formData.get("karsi_taraf_adi"),
    tutar: formData.get("tutar"),
    tarih: formData.get("tarih"),
    aciklama: formData.get("aciklama") ?? "",
  });
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { error } = await nakitBankaHareketiOlustur(supabase, klinikId, user!.id, {
    tip: "gelen",
    kaynakKasa: false,
    kaynakBankaHesapId: null,
    hedefKasa: true,
    hedefBankaHesapId: null,
    odemeYontemi: null,
    karsiTarafAdi: ayristirma.data.karsi_taraf_adi,
    karsiTarafBanka: null,
    karsiTarafIban: null,
    aciklama: ayristirma.data.aciklama ? ayristirma.data.aciklama : null,
    tutar: ayristirma.data.tutar,
    tarih: ayristirma.data.tarih,
  });
  if (error) return { success: false, message: error };

  revalidatePath("/panel/finans/kasa");
  return { success: true, message: "Kasaya giriş kaydedildi." };
}

const cikanDigerSemasi = z.object({
  karsi_taraf_adi: z.string().trim().min(1, "Alıcı adı girilmeli."),
  tutar: z.coerce.number().positive("Tutar 0'dan büyük olmalı."),
  tarih: z.string().min(1, "Tarih seçilmeli."),
  aciklama: z.string().trim().optional(),
});

export async function kasadanDigerCikanEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const { supabase, user, klinikId, rol } = await yetkiliBaglantiGetir();
  if (!klinikId) return { success: false, message: "Klinik bilgisi bulunamadı." };
  if (rol !== "klinik_admin") return { success: false, message: "Bu işlem için yetkiniz yok." };

  const ayristirma = cikanDigerSemasi.safeParse({
    karsi_taraf_adi: formData.get("karsi_taraf_adi"),
    tutar: formData.get("tutar"),
    tarih: formData.get("tarih"),
    aciklama: formData.get("aciklama") ?? "",
  });
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { error } = await nakitBankaHareketiOlustur(supabase, klinikId, user!.id, {
    tip: "giden",
    kaynakKasa: true,
    kaynakBankaHesapId: null,
    hedefKasa: false,
    hedefBankaHesapId: null,
    odemeYontemi: null,
    karsiTarafAdi: ayristirma.data.karsi_taraf_adi,
    karsiTarafBanka: null,
    karsiTarafIban: null,
    aciklama: ayristirma.data.aciklama ? ayristirma.data.aciklama : null,
    tutar: ayristirma.data.tutar,
    tarih: ayristirma.data.tarih,
  });
  if (error) return { success: false, message: error };

  revalidatePath("/panel/finans/kasa");
  return { success: true, message: "Kasadan çıkış kaydedildi." };
}

const transferSemasi = z.object({
  hedef_banka_hesap_id: z.string().trim().min(1, "Hedef hesap seçilmeli."),
  tutar: z.coerce.number().positive("Tutar 0'dan büyük olmalı."),
  tarih: z.string().min(1, "Tarih seçilmeli."),
  aciklama: z.string().trim().optional(),
});

export async function kasadanBankayaTransferEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const { supabase, user, klinikId, rol } = await yetkiliBaglantiGetir();
  if (!klinikId) return { success: false, message: "Klinik bilgisi bulunamadı." };
  if (rol !== "klinik_admin") return { success: false, message: "Bu işlem için yetkiniz yok." };

  const ayristirma = transferSemasi.safeParse({
    hedef_banka_hesap_id: formData.get("hedef_banka_hesap_id"),
    tutar: formData.get("tutar"),
    tarih: formData.get("tarih"),
    aciklama: formData.get("aciklama") ?? "",
  });
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { error } = await nakitBankaHareketiOlustur(supabase, klinikId, user!.id, {
    tip: "hesaplar_arasi",
    kaynakKasa: true,
    kaynakBankaHesapId: null,
    hedefKasa: false,
    hedefBankaHesapId: ayristirma.data.hedef_banka_hesap_id,
    odemeYontemi: null,
    karsiTarafAdi: null,
    karsiTarafBanka: null,
    karsiTarafIban: null,
    aciklama: ayristirma.data.aciklama ? ayristirma.data.aciklama : null,
    tutar: ayristirma.data.tutar,
    tarih: ayristirma.data.tarih,
  });
  if (error) return { success: false, message: error };

  revalidatePath("/panel/finans/kasa");
  revalidatePath("/panel/finans/banka");
  return { success: true, message: "Transfer kaydedildi." };
}

export async function nakitBankaHareketiSil(id: string): Promise<SonucDurumu> {
  const { supabase, rol } = await yetkiliBaglantiGetir();
  if (rol !== "klinik_admin") {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const { error } = await nakitBankaHareketiSilDb(supabase, id);
  if (error) return { success: false, message: error };

  revalidatePath("/panel/finans/kasa");
  revalidatePath("/panel/finans/banka");
  return { success: true, message: "Hareket silindi." };
}

const personelOdemeSemasi = z.object({
  personel_id: z.string().trim().min(1, "Personel seçilmeli."),
  tur: z.enum(["odeme", "avans"]),
  tutar: z.coerce.number().positive("Tutar 0'dan büyük olmalı."),
  tarih: z.string().min(1, "Tarih seçilmeli."),
  aciklama: z.string().trim().optional(),
});

/**
 * Kasa'nın "Personel" adımı — app/(app)/panel/personel/[id]/actions.ts'teki
 * hesapHareketiEkle'yi ÇAĞIRMAZ (o /panel/personel/[id]'e bağlı, ilk
 * parametresi zaten bind edilmiş personelId bekliyor ve o rotayı revalidate
 * ediyor) — burada aynı RPC'yi doğrudan, Kasa'nın kendi rotasını revalidate
 * eden ince bir action ile çağırıyoruz.
 */
export async function kasaPersonelOdemesiEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const { supabase, klinikId, rol } = await yetkiliBaglantiGetir();
  if (!klinikId) return { success: false, message: "Klinik bilgisi bulunamadı." };
  if (rol !== "klinik_admin") return { success: false, message: "Bu işlem için yetkiniz yok." };

  const ayristirma = personelOdemeSemasi.safeParse({
    personel_id: formData.get("personel_id"),
    tur: formData.get("tur"),
    tutar: formData.get("tutar"),
    tarih: formData.get("tarih"),
    aciklama: formData.get("aciklama") ?? "",
  });
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { personel_id, tur, tutar, tarih, aciklama } = ayristirma.data;
  const { error } = await supabase.rpc("personel_hesap_hareket_ekle", {
    p_personel_id: personel_id,
    p_tur: tur,
    p_tutar: tutar,
    p_tarih: tarih,
    p_aciklama: aciklama ? aciklama : null,
    p_odeme_tipi: "nakit",
    p_banka_hesap_id: null,
  });

  if (error) {
    console.error("Personel ödemesi eklenemedi:", error);
    return { success: false, message: "Eklenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/finans/kasa");
  return { success: true, message: "Personel ödemesi kaydedildi." };
}
