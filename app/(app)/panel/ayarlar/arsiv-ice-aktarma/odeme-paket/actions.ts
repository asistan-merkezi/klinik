"use server";

import { pgHata, rpc, withTenant } from "@/lib/db";
import { eylemYetkisi, YETKISIZ_MESAJI } from "@/lib/auth/yetki";
import { turkceSayiyiCevir, tarihSaatiIsoyaCevir } from "@/lib/ice-aktarma/normallestir";
import { kurus, kurusMetni } from "@/lib/para";
import type { ArsivSonucSatiri } from "@/components/panel/ice-aktarma/onizleme-tablosu";

type SonucDurumu = { success: boolean; message: string; sonuclar?: ArsivSonucSatiri[] };

const TUR_ESLEME: Record<string, string> = {
  odeme: "odeme",
  ödeme: "odeme",
  tahsilat: "odeme",
  kredi: "kredi",
  alacak: "kredi",
  borc: "borc",
  borç: "borc",
};

/** Dosyadaki tutar → en çok iki ondalıklı metin (para kuralı lib/para.ts); okunamayan/negatif/sıfır tutar null kalır, RPC satırı "tutar_gecersiz" ile reddeder. */
function tutarMetni(ham: string | undefined): string | null {
  if (!ham) return null;
  const sayi = turkceSayiyiCevir(ham);
  const k = sayi === null ? null : kurus(sayi);
  return k === null ? null : kurusMetni(k);
}

function bakiyeKaydiniNormallestir(kayit: Record<string, string>) {
  const turHam = (kayit.tur ?? "").trim().toLocaleLowerCase("tr");
  return {
    hasta_id: kayit.hasta_id || null,
    tur: TUR_ESLEME[turHam] ?? null,
    tutar: tutarMetni(kayit.tutar),
    tarih: kayit.tarih ? tarihSaatiIsoyaCevir(kayit.tarih) : null,
    aciklama: kayit.aciklama?.trim() || null,
  };
}

// odeme_olustur'un AKSİNE fatura kuyruğuna satır eklemez — bkz. migration
// 20260804090000_arsiv_ice_aktarma.sql'deki hasta_bakiye_hareket_arsiv_ekle notu.
// RPC rol (yalnız klinik_admin) + tenant + hasta sahipliğini kendisi doğrular; tenant oturumdan gelir.
export async function bakiyeHareketleriniArsivdenIceAktar(
  kayitlar: Record<string, string>[],
  baslangicSatirNo: number
): Promise<SonucDurumu> {
  const y = await eylemYetkisi(["klinik_admin"]);
  if (!y.yetkili || !y.bag) return { success: false, message: YETKISIZ_MESAJI };

  const normallestirilmis = kayitlar.map(bakiyeKaydiniNormallestir);

  let data: ArsivSonucSatiri[];
  try {
    data = await withTenant(y.bag, async (tx) => {
      const satir = (await rpc<Record<string, ArsivSonucSatiri[] | null>>(tx, "hasta_bakiye_hareket_arsiv_ekle", { p_kayitlar: normallestirilmis }))[0];
      return satir?.hasta_bakiye_hareket_arsiv_ekle ?? [];
    });
  } catch (e) {
    const h = pgHata(e);
    console.error("Bakiye hareketi arşiv içe aktarma hatası:", h.mesaj);
    if (h.mesaj === "yetkisiz") {
      return { success: false, message: "Bu işlem için yetkiniz yok (sadece klinik yöneticisi kullanabilir)." };
    }
    return { success: false, message: "İçe aktarma başarısız oldu, lütfen tekrar deneyin." };
  }

  const sonuclar = data.map((s) => ({
    ...s,
    satir_no: s.satir_no + baslangicSatirNo - 1,
  }));

  return { success: true, message: "Tamamlandı.", sonuclar };
}

function paketSatisKaydiniNormallestir(kayit: Record<string, string>) {
  return {
    hasta_id: kayit.hasta_id || null,
    kalan_adet: kayit.kalan_adet ? Math.trunc(turkceSayiyiCevir(kayit.kalan_adet) ?? NaN) : null,
    gecerlilik_bitis_tarihi: kayit.gecerlilik_bitis_tarihi ? tarihSaatiIsoyaCevir(kayit.gecerlilik_bitis_tarihi) : null,
    satis_tarihi: kayit.satis_tarihi ? tarihSaatiIsoyaCevir(kayit.satis_tarihi) : null,
  };
}

export async function paketSatislariniArsivdenIceAktar(
  paketId: string,
  kayitlar: Record<string, string>[],
  baslangicSatirNo: number
): Promise<SonucDurumu> {
  const y = await eylemYetkisi(["klinik_admin"]);
  if (!y.yetkili || !y.bag) return { success: false, message: YETKISIZ_MESAJI };

  const normallestirilmis = kayitlar.map(paketSatisKaydiniNormallestir);

  let data: ArsivSonucSatiri[];
  try {
    data = await withTenant(y.bag, async (tx) => {
      const satir = (await rpc<Record<string, ArsivSonucSatiri[] | null>>(tx, "paket_satis_arsiv_ekle", { p_paket_id: paketId, p_kayitlar: normallestirilmis }))[0];
      return satir?.paket_satis_arsiv_ekle ?? [];
    });
  } catch (e) {
    const h = pgHata(e);
    console.error("Paket satış arşiv içe aktarma hatası:", h.mesaj);
    if (h.mesaj === "yetkisiz") {
      return { success: false, message: "Bu işlem için yetkiniz yok (sadece klinik yöneticisi kullanabilir)." };
    }
    if (h.mesaj === "paket_bulunamadi") {
      return { success: false, message: "Seçilen paket bulunamadı." };
    }
    return { success: false, message: "İçe aktarma başarısız oldu, lütfen tekrar deneyin." };
  }

  const sonuclar = data.map((s) => ({
    ...s,
    satir_no: s.satir_no + baslangicSatirNo - 1,
  }));

  return { success: true, message: "Tamamlandı.", sonuclar };
}
