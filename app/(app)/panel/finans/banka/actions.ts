"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { pgHata, rpc, withTenant } from "@/lib/db";
import { finansOturumu, type FinansOturumu } from "@/lib/finans/eylem";
import { islemAnahtariniKaydet, islemAnahtariniOku } from "@/lib/finans/idempotans";
import { nakitBankaHareketiOlustur, type NakitBankaHareketiGirdisi } from "@/lib/finans/nakit-banka-hareketi";
import { pozitifTutarKurus } from "@/lib/finans/tutar";
import { kurusMetni } from "@/lib/para";
import { YETKISIZ_MESAJI } from "@/lib/auth/yetki";
import { nakitBankaHareketiSil as kasaHareketiSil } from "../kasa/actions";

type SonucDurumu = { success: boolean; message: string } | null;

const YETKISIZ: SonucDurumu = { success: false, message: YETKISIZ_MESAJI };
const adminOturumu = () => finansOturumu(["klinik_admin"]);

/** Hareket + idempotency anahtarı AYNI transaction'da (bkz. kasa/actions.ts). Hesap bütünlüğünü DB tetikleyicisi (nakit_banka_hareketi_hesap_butunluk) ayrıca zorlar. */
async function hareketYaz(o: FinansOturumu, formData: FormData, islem: string, girdi: NakitBankaHareketiGirdisi): Promise<{ error: string | null }> {
  const anahtar = islemAnahtariniOku(formData);
  try {
    await withTenant(o.bag, async (tx) => {
      if (!(await islemAnahtariniKaydet(tx, o.klinikId, anahtar, islem, o.kullaniciId))) return;
      const s = await nakitBankaHareketiOlustur(tx, o.klinikId, o.kullaniciId, girdi);
      if (s.error) throw new Error(s.error);
    });
    return { error: null };
  } catch {
    return { error: "Kaydedilemedi, lütfen tekrar deneyin." };
  }
}

const girenSemasi = z.strictObject({
  hedef_banka_hesap_id: z.string().uuid("Hesap seçilmeli."),
  odeme_yontemi: z.enum(["nakit", "banka_havalesi"]),
  karsi_taraf_adi: z.string().trim().min(1, "Gönderen adı girilmeli."),
  karsi_taraf_banka: z.string().trim().optional(),
  karsi_taraf_iban: z.string().trim().optional(),
  tutar: pozitifTutarKurus(),
  tarih: z.string().min(1, "Tarih seçilmeli."),
  aciklama: z.string().trim().optional(),
});

export async function bankayaGirenEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return YETKISIZ;

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

  const { error } = await hareketYaz(o, formData, "banka_giren", {
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
    tutarKurus: veri.tutar,
    tarih: veri.tarih,
  });
  if (error) return { success: false, message: error };

  revalidatePath("/panel/finans/banka");
  return { success: true, message: "Bankaya giriş kaydedildi." };
}

const cikanDigerSemasi = z.strictObject({
  kaynak_banka_hesap_id: z.string().uuid("Hesap seçilmeli."),
  karsi_taraf_adi: z.string().trim().min(1, "Alıcı adı girilmeli."),
  karsi_taraf_banka: z.string().trim().optional(),
  karsi_taraf_iban: z.string().trim().optional(),
  tutar: pozitifTutarKurus(),
  tarih: z.string().min(1, "Tarih seçilmeli."),
  aciklama: z.string().trim().optional(),
});

export async function bankadanDigerCikanEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return YETKISIZ;

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

  const { error } = await hareketYaz(o, formData, "banka_cikan", {
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
    tutarKurus: veri.tutar,
    tarih: veri.tarih,
  });
  if (error) return { success: false, message: error };

  revalidatePath("/panel/finans/banka");
  return { success: true, message: "Bankadan çıkış kaydedildi." };
}

const transferSemasi = z.strictObject({
  kaynak_banka_hesap_id: z.string().uuid("Kaynak hesap seçilmeli."),
  hedef: z.string().trim().min(1, "Hedef seçilmeli."), // "kasa" veya bir banka_hesap_id
  tutar: pozitifTutarKurus(),
  tarih: z.string().min(1, "Tarih seçilmeli."),
  aciklama: z.string().trim().optional(),
});

export async function bankadanTransferEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return YETKISIZ;

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
  if (!hedefKasa && !z.string().uuid().safeParse(veri.hedef).success) {
    return { success: false, message: "Hedef seçilmeli." };
  }

  const { error } = await hareketYaz(o, formData, "banka_transfer", {
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
    tutarKurus: veri.tutar,
    tarih: veri.tarih,
  });
  if (error) return { success: false, message: error };

  revalidatePath("/panel/finans/banka");
  revalidatePath("/panel/finans/kasa");
  return { success: true, message: "Transfer kaydedildi." };
}

/** Kasa ile aynı tablo/kural: silme tek yerde (kasa/actions.ts). */
export async function nakitBankaHareketiSil(id: string): Promise<SonucDurumu> {
  return kasaHareketiSil(id);
}

const personelOdemeSemasi = z.strictObject({
  personel_id: z.string().uuid("Personel seçilmeli."),
  banka_hesap_id: z.string().uuid("Hesap seçilmeli."),
  tur: z.enum(["odeme", "avans"]),
  tutar: pozitifTutarKurus(),
  tarih: z.string().min(1, "Tarih seçilmeli."),
  aciklama: z.string().trim().optional(),
});

/** Kasa'daki kasaPersonelOdemesiEkle'nin banka karşılığı — bkz. oradaki not. RPC rol + tenant + hesap bütünlüğünü kendisi doğrular. */
export async function bankaPersonelOdemesiEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return YETKISIZ;

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
  const anahtar = islemAnahtariniOku(formData);
  try {
    await withTenant(o.bag, async (tx) => {
      if (!(await islemAnahtariniKaydet(tx, o.klinikId, anahtar, "banka_personel_odemesi", o.kullaniciId))) return;
      await rpc(tx, "personel_hesap_hareket_ekle", {
        p_personel_id: personel_id,
        p_tur: tur,
        p_tutar: kurusMetni(tutar),
        p_tarih: tarih,
        p_aciklama: aciklama ? aciklama : null,
        p_odeme_tipi: "havale",
        p_banka_hesap_id: banka_hesap_id,
      });
    });
  } catch (e) {
    console.error("Personel ödemesi eklenemedi:", pgHata(e).mesaj);
    return { success: false, message: "Eklenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/finans/banka");
  return { success: true, message: "Personel ödemesi kaydedildi." };
}
