"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { pgHata, rpc, sema, withTenant } from "@/lib/db";
import { tedarikciAnahtari } from "@/lib/finans/tedarikci-anahtari";
import { finansSayfalariniYenile } from "@/lib/finans/sayfa-yenile";
import { finansOturumu, type FinansOturumu } from "@/lib/finans/eylem";
import { islemAnahtariniKaydet, islemAnahtariniOku } from "@/lib/finans/idempotans";
import { pozitifTutarKurus } from "@/lib/finans/tutar";
import { kurusMetni, tl, tlFark } from "@/lib/para";
import { YETKISIZ_MESAJI } from "@/lib/auth/yetki";
import { giderEkle } from "../actions";

type SonucDurumu = { success: boolean; message: string } | null;

/** klinik_cari_odeme_ekle RPC'sinin `raise exception` kodlarını kullanıcıya anlaşılır çevirir. */
function cariRpcHatasi(mesaj: string | undefined): string {
  if (!mesaj) return "Cari ödemesi kaydedilemedi, lütfen tekrar deneyin.";
  if (mesaj.includes("bakiye_asildi")) return "Ödeme tutarı tedarikçinin cari bakiyesini aşıyor.";
  if (mesaj.includes("yetkisiz")) return "Bu işlem için yetkiniz yok.";
  if (mesaj.includes("tedarikci_gerekli")) return "Tedarikçi seçilmeli.";
  if (mesaj.includes("tutar_gecersiz")) return "Tutar 0'dan büyük olmalı.";
  if (mesaj.includes("banka_hesabi_gerekli")) return "Havale için banka hesabı seçilmeli.";
  if (mesaj.includes("kart_bulunamadi")) return "Seçilen kredi kartı bulunamadı.";
  if (mesaj.includes("odeme_tipi_gecersiz")) return "Ödeme yöntemi seçilmeli.";
  return "Cari ödemesi kaydedilemedi, lütfen tekrar deneyin.";
}

const cariOdemeSemasi = z.object({
  tedarikci_adi: z.string().trim().min(1, "Tedarikçi seçilmeli."),
  tutar: pozitifTutarKurus(),
  tarih: z.string().min(1, "Tarih seçilmeli."),
  odeme_tipi: z.enum(["nakit", "havale", "kredi_karti"], { message: "Ödeme yöntemi seçilmeli." }),
  banka_hesap_id: z.string().trim().optional(),
  kredi_karti_id: z.string().trim().optional(),
  aciklama: z.string().trim().optional(),
});

const uuidMi = (v: string | undefined) => !!v && z.string().uuid().safeParse(v).success;

/**
 * Cari ödemesi: yazım yalnız `klinik_cari_odeme_ekle` RPC'sinden (rol + tenant + hesap bütünlüğü + tedarikçi bazlı advisory lock ile
 * bakiye aşımı kontrolü RPC içinde). Idempotency anahtarı RPC ile AYNI transaction'da: çift gönderimde ikinci istek yazmaz.
 */
async function cariOdemeYaz(o: FinansOturumu, veri: z.infer<typeof cariOdemeSemasi>, anahtar: string | null): Promise<SonucDurumu> {
  try {
    await withTenant(o.bag, async (tx) => {
      if (!(await islemAnahtariniKaydet(tx, o.klinikId, anahtar, "cari_odeme", o.kullaniciId))) return;
      await rpc(tx, "klinik_cari_odeme_ekle", {
        p_tedarikci_adi: veri.tedarikci_adi,
        p_tutar: kurusMetni(veri.tutar),
        p_tarih: veri.tarih,
        p_odeme_tipi: veri.odeme_tipi,
        p_banka_hesap_id: veri.odeme_tipi === "havale" && uuidMi(veri.banka_hesap_id) ? veri.banka_hesap_id : null,
        p_kredi_karti_id: veri.odeme_tipi === "kredi_karti" && uuidMi(veri.kredi_karti_id) ? veri.kredi_karti_id : null,
        p_aciklama: veri.aciklama ? veri.aciklama : null,
      });
    });
  } catch (e) {
    const h = pgHata(e);
    console.error("Cari ödemesi kaydedilemedi:", h.mesaj);
    return { success: false, message: cariRpcHatasi(h.mesaj) };
  }
  finansSayfalariniYenile();
  return { success: true, message: "Cari ödemesi kaydedildi." };
}

function cariOdemeFormuOku(formData: FormData) {
  return cariOdemeSemasi.safeParse({
    tedarikci_adi: formData.get("tedarikci_adi") ?? "",
    tutar: formData.get("tutar"),
    tarih: formData.get("tarih"),
    odeme_tipi: formData.get("odeme_tipi"),
    banka_hesap_id: formData.get("banka_hesap_id") ?? "",
    kredi_karti_id: formData.get("kredi_karti_id") ?? "",
    aciklama: formData.get("aciklama") ?? "",
  });
}

/** Tedarikçi Cari Paneli > Ödeme Ekle. Bakiyeyi aşan tutar RPC'de (tedarikçi bazlı kilitle) reddedilir. */
export async function cariOdemeEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const o = await finansOturumu(["klinik_admin"]);
  if (!o) return { success: false, message: YETKISIZ_MESAJI };
  const ayristirma = cariOdemeFormuOku(formData);
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }
  return cariOdemeYaz(o, ayristirma.data, islemAnahtariniOku(formData));
}

/** Cari ödemesini siler (bakiye geri artar; Kasa/Banka/Kart borcundan da düşer). */
export async function cariOdemeSil(id: string): Promise<SonucDurumu> {
  const o = await finansOturumu(["klinik_admin"]);
  if (!o) return { success: false, message: YETKISIZ_MESAJI };
  if (!uuidMi(id)) return { success: false, message: "Cari ödemesi bulunamadı." };
  try {
    const silinen = await withTenant(o.bag, (tx) =>
      tx.delete(sema.klinikCariOdeme).where(and(eq(sema.klinikCariOdeme.id, id), eq(sema.klinikCariOdeme.klinikId, o.klinikId))).returning({ id: sema.klinikCariOdeme.id })
    );
    if (silinen.length === 0) return { success: false, message: "Cari ödemesi bulunamadı." };
  } catch (e) {
    console.error("Cari ödemesi silinemedi:", pgHata(e).mesaj);
    return { success: false, message: "Cari ödemesi silinemedi, lütfen tekrar deneyin." };
  }
  finansSayfalariniYenile();
  return { success: true, message: "Cari ödemesi silindi." };
}

export type CariBakiyeBilgisi = { borc: number; odenen: number; bakiye: number };

/** Kasa/Banka "Tedarikçi" formunda yazılan ada göre cari bakiyeyi gösterir (yoksa null). */
export async function cariBakiyeGetir(tedarikciAdi: string): Promise<CariBakiyeBilgisi | null> {
  const o = await finansOturumu(["klinik_admin", "muhasebe"]);
  if (!o) return null;
  const anahtar = tedarikciAnahtari(tedarikciAdi);
  if (!anahtar) return null;

  try {
    const satirlar = await withTenant(o.bag, (tx) => rpc<{ anahtar: string; borc: string; odenen: string }>(tx, "klinik_cari_bakiyeler", { p_klinik_id: o.klinikId, p_anahtar: anahtar }));
    if (!satirlar[0]) return null;
    const borc = tl(satirlar[0].borc);
    const odenen = tl(satirlar[0].odenen);
    return { borc, odenen, bakiye: tlFark(borc, odenen) };
  } catch (e) {
    console.error("Cari bakiye okunamadı:", pgHata(e).mesaj);
    return null;
  }
}

/**
 * Kasa/Banka "Tedarikçi" çıkışı: "Bu ödeme cari borçtan düşsün" işaretliyse ödeme cari ödemesi olarak yazılır
 * (gider olarak DEĞİL — Raporlar'da çift gider sayılmaz); değilse eskisi gibi yeni gider kaydı.
 */
export async function tedarikciOdemesiEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  if (formData.get("cariden_dus") !== "on") {
    return giderEkle(_onceki, formData);
  }
  const o = await finansOturumu(["klinik_admin"]);
  if (!o) return { success: false, message: YETKISIZ_MESAJI };
  const ayristirma = cariOdemeFormuOku(formData);
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }
  return cariOdemeYaz(o, ayristirma.data, islemAnahtariniOku(formData));
}
