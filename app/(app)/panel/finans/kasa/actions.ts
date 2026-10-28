"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { pgHata, rpc, sema, withTenant } from "@/lib/db";
import { finansOturumu, type FinansOturumu } from "@/lib/finans/eylem";
import { islemAnahtariniKaydet, islemAnahtariniOku } from "@/lib/finans/idempotans";
import { nakitBankaHareketiOlustur, nakitBankaHareketiSil as nakitBankaHareketiSilDb, type NakitBankaHareketiGirdisi } from "@/lib/finans/nakit-banka-hareketi";
import { negatifOlmayanTutarKurus, pozitifTutarKurus, sifirdanFarkliTutarKurus } from "@/lib/finans/tutar";
import { kurusMetni } from "@/lib/para";
import { YETKISIZ_MESAJI } from "@/lib/auth/yetki";

type SonucDurumu = { success: boolean; message: string } | null;

const YETKISIZ: SonucDurumu = { success: false, message: YETKISIZ_MESAJI };
const adminOturumu = () => finansOturumu(["klinik_admin"]);

const baslangicSemasi = z.object({ baslangic_tutari: negatifOlmayanTutarKurus("0'dan küçük olamaz.") });

export async function kasaBaslangicGuncelle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return YETKISIZ;

  const ayristirma = baslangicSemasi.safeParse({ baslangic_tutari: formData.get("baslangic_tutari") });
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  // klinik_ayarlar.ayarlar tek bir jsonb kolonu — düz upsert diğer anahtarları silebileceği için satır kilitlenip okunur, üstüne "kasa" anahtarı yazılır
  // (bkz. app/(app)/panel/tablet/ayarlar/actions.ts'teki aynı desen).
  try {
    await withTenant(o.bag, async (tx) => {
      const mevcut = (await tx.select({ ayarlar: sema.klinikAyarlar.ayarlar }).from(sema.klinikAyarlar).where(eq(sema.klinikAyarlar.klinikId, o.klinikId)).for("update").limit(1))[0];
      const guncelAyarlar = {
        ...(mevcut?.ayarlar as Record<string, unknown> | null),
        // Başlangıç tutarı girildiği an + giren kişi de saklanır: tutar, Kasa Hareketleri'ne "Kasa Başlangıç" olarak BU tarihte işlenir (bkz. kasa/page.tsx). Her güncelleme zamanı yeniler.
        kasa: {
          baslangic_tutari: Number(kurusMetni(ayristirma.data.baslangic_tutari)),
          baslangic_zamani: new Date().toISOString(),
          baslangic_giren: o.adSoyad ?? "—",
        },
      };
      await tx.insert(sema.klinikAyarlar).values({ klinikId: o.klinikId, ayarlar: guncelAyarlar }).onConflictDoUpdate({ target: sema.klinikAyarlar.klinikId, set: { ayarlar: guncelAyarlar } });
    });
  } catch (e) {
    console.error("Kasa başlangıç tutarı güncellenemedi:", pgHata(e).mesaj);
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/finans/kasa");
  return { success: true, message: "Başlangıç tutarı güncellendi." };
}

/** Kasa/Banka manuel hareketi: idempotency anahtarı + hareket AYNI transaction'da. */
async function hareketYaz(o: FinansOturumu, formData: FormData, islem: string, girdi: NakitBankaHareketiGirdisi): Promise<{ error: string | null }> {
  const anahtar = islemAnahtariniOku(formData);
  try {
    await withTenant(o.bag, async (tx) => {
      if (!(await islemAnahtariniKaydet(tx, o.klinikId, anahtar, islem, o.kullaniciId))) return; // aynı istek zaten işlendi
      const s = await nakitBankaHareketiOlustur(tx, o.klinikId, o.kullaniciId, girdi);
      if (s.error) throw new Error(s.error); // transaction'ı geri al (anahtar da düşer)
    });
    return { error: null };
  } catch {
    return { error: "Kaydedilemedi, lütfen tekrar deneyin." };
  }
}

const girenSemasi = z.object({
  karsi_taraf_adi: z.string().trim().min(1, "Gönderen adı girilmeli."),
  tutar: pozitifTutarKurus(),
  tarih: z.string().min(1, "Tarih seçilmeli."),
  aciklama: z.string().trim().optional(),
});

export async function kasayaGirenEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return YETKISIZ;

  const ayristirma = girenSemasi.safeParse({
    karsi_taraf_adi: formData.get("karsi_taraf_adi"),
    tutar: formData.get("tutar"),
    tarih: formData.get("tarih"),
    aciklama: formData.get("aciklama") ?? "",
  });
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { error } = await hareketYaz(o, formData, "kasa_giren", {
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
    tutarKurus: ayristirma.data.tutar,
    tarih: ayristirma.data.tarih,
  });
  if (error) return { success: false, message: error };

  revalidatePath("/panel/finans/kasa");
  return { success: true, message: "Kasaya giriş kaydedildi." };
}

const cikanDigerSemasi = z.object({
  karsi_taraf_adi: z.string().trim().min(1, "Alıcı adı girilmeli."),
  tutar: pozitifTutarKurus(),
  tarih: z.string().min(1, "Tarih seçilmeli."),
  aciklama: z.string().trim().optional(),
});

export async function kasadanDigerCikanEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return YETKISIZ;

  const ayristirma = cikanDigerSemasi.safeParse({
    karsi_taraf_adi: formData.get("karsi_taraf_adi"),
    tutar: formData.get("tutar"),
    tarih: formData.get("tarih"),
    aciklama: formData.get("aciklama") ?? "",
  });
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { error } = await hareketYaz(o, formData, "kasa_cikan", {
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
    tutarKurus: ayristirma.data.tutar,
    tarih: ayristirma.data.tarih,
  });
  if (error) return { success: false, message: error };

  revalidatePath("/panel/finans/kasa");
  return { success: true, message: "Kasadan çıkış kaydedildi." };
}

const transferSemasi = z.object({
  hedef_banka_hesap_id: z.string().uuid("Hedef hesap seçilmeli."),
  tutar: pozitifTutarKurus(),
  tarih: z.string().min(1, "Tarih seçilmeli."),
  aciklama: z.string().trim().optional(),
});

export async function kasadanBankayaTransferEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return YETKISIZ;

  const ayristirma = transferSemasi.safeParse({
    hedef_banka_hesap_id: formData.get("hedef_banka_hesap_id"),
    tutar: formData.get("tutar"),
    tarih: formData.get("tarih"),
    aciklama: formData.get("aciklama") ?? "",
  });
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { error } = await hareketYaz(o, formData, "kasa_transfer", {
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
    tutarKurus: ayristirma.data.tutar,
    tarih: ayristirma.data.tarih,
  });
  if (error) return { success: false, message: error };

  revalidatePath("/panel/finans/kasa");
  revalidatePath("/panel/finans/banka");
  return { success: true, message: "Transfer kaydedildi." };
}

/** Manuel Kasa/Banka hareketini siler (yalnız klinik_admin; bu tabloda yalnız manuel kayıtlar var). Silme audit_log'a düşer. */
export async function nakitBankaHareketiSil(id: string): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return YETKISIZ;
  if (!z.string().uuid().safeParse(id).success) return { success: false, message: "Hareket bulunamadı." };

  const s = await withTenant(o.bag, (tx) => nakitBankaHareketiSilDb(tx, id));
  if (s.error) return { success: false, message: s.error };
  if (s.silinen === 0) return { success: false, message: "Hareket bulunamadı." };

  revalidatePath("/panel/finans/kasa");
  revalidatePath("/panel/finans/banka");
  return { success: true, message: "Hareket silindi." };
}

const personelOdemeSemasi = z.object({
  personel_id: z.string().uuid("Personel seçilmeli."),
  tur: z.enum(["odeme", "avans"]),
  tutar: pozitifTutarKurus(),
  tarih: z.string().min(1, "Tarih seçilmeli."),
  aciklama: z.string().trim().optional(),
});

/**
 * Kasa'nın "Personel" adımı — app/(app)/panel/personel/[id]/actions.ts'teki hesapHareketiEkle'yi ÇAĞIRMAZ (o /panel/personel/[id]'e bağlı);
 * burada aynı RPC'yi (kendi içinde rol + tenant kontrolü yapar) Kasa'nın kendi rotasını revalidate eden ince bir action ile çağırıyoruz.
 */
export async function kasaPersonelOdemesiEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return YETKISIZ;

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
  const anahtar = islemAnahtariniOku(formData);
  try {
    await withTenant(o.bag, async (tx) => {
      if (!(await islemAnahtariniKaydet(tx, o.klinikId, anahtar, "kasa_personel_odemesi", o.kullaniciId))) return;
      await rpc(tx, "personel_hesap_hareket_ekle", {
        p_personel_id: personel_id,
        p_tur: tur,
        p_tutar: kurusMetni(tutar),
        p_tarih: tarih,
        p_aciklama: aciklama ? aciklama : null,
        p_odeme_tipi: "nakit",
        p_banka_hesap_id: null,
      });
    });
  } catch (e) {
    console.error("Personel ödemesi eklenemedi:", pgHata(e).mesaj);
    return { success: false, message: "Eklenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/finans/kasa");
  return { success: true, message: "Personel ödemesi kaydedildi." };
}

const dengelemeSemasi = z.object({
  tutar: sifirdanFarkliTutarKurus(),
  aciklama: z.string().trim().optional(),
});

/** Kasa Kontrol > Kasa Dengeleme: işaretli tutar (+ kasaya ekler, − kasadan düşer). */
export async function kasaDengelemeEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return YETKISIZ;

  const ayristirma = dengelemeSemasi.safeParse({
    tutar: formData.get("tutar"),
    aciklama: formData.get("aciklama") ?? "",
  });
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const anahtar = islemAnahtariniOku(formData);
  try {
    await withTenant(o.bag, async (tx) => {
      if (!(await islemAnahtariniKaydet(tx, o.klinikId, anahtar, "kasa_dengeleme", o.kullaniciId))) return;
      await tx.insert(sema.kasaDengeleme).values({
        klinikId: o.klinikId,
        tutar: kurusMetni(ayristirma.data.tutar),
        aciklama: ayristirma.data.aciklama ? ayristirma.data.aciklama : null,
        ekleyenKullaniciId: o.kullaniciId,
        ekleyenAd: o.adSoyad ?? "—",
      });
    });
  } catch (e) {
    console.error("Kasa dengelemesi eklenemedi:", pgHata(e).mesaj);
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/finans/kasa");
  return { success: true, message: "Kasa dengelemesi kaydedildi." };
}

export async function kasaDengelemeSil(id: string): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return YETKISIZ;
  if (!z.string().uuid().safeParse(id).success) return { success: false, message: "Dengeleme bulunamadı." };

  try {
    const silinen = await withTenant(o.bag, (tx) => tx.delete(sema.kasaDengeleme).where(eq(sema.kasaDengeleme.id, id)).returning({ id: sema.kasaDengeleme.id }));
    if (silinen.length === 0) return { success: false, message: "Dengeleme bulunamadı." };
  } catch (e) {
    console.error("Kasa dengelemesi silinemedi:", pgHata(e).mesaj);
    return { success: false, message: "Silinemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/finans/kasa");
  return { success: true, message: "Dengeleme silindi." };
}
