"use server";

import { createClient } from "@/lib/supabase/server";
import { turkceSayiyiCevir, tarihSaatiIsoyaCevir } from "@/lib/ice-aktarma/normallestir";
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

function bakiyeKaydiniNormallestir(kayit: Record<string, string>) {
  const turHam = (kayit.tur ?? "").trim().toLocaleLowerCase("tr");
  return {
    hasta_id: kayit.hasta_id || null,
    tur: TUR_ESLEME[turHam] ?? null,
    tutar: kayit.tutar ? turkceSayiyiCevir(kayit.tutar) : null,
    tarih: kayit.tarih ? tarihSaatiIsoyaCevir(kayit.tarih) : null,
    aciklama: kayit.aciklama?.trim() || null,
  };
}

// odeme_olustur'un AKSİNE fatura kuyruğuna satır eklemez — bkz. migration
// 20260804090000_arsiv_ice_aktarma.sql'deki hasta_bakiye_hareket_arsiv_ekle notu.
export async function bakiyeHareketleriniArsivdenIceAktar(
  kayitlar: Record<string, string>[],
  baslangicSatirNo: number
): Promise<SonucDurumu> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, message: "Oturum bulunamadı." };
  }

  const normallestirilmis = kayitlar.map(bakiyeKaydiniNormallestir);

  const { data, error } = await supabase.rpc("hasta_bakiye_hareket_arsiv_ekle", { p_kayitlar: normallestirilmis });

  if (error) {
    console.error("Bakiye hareketi arşiv içe aktarma hatası:", error);
    if (error.message === "yetkisiz") {
      return { success: false, message: "Bu işlem için yetkiniz yok (sadece klinik yöneticisi kullanabilir)." };
    }
    return { success: false, message: "İçe aktarma başarısız oldu, lütfen tekrar deneyin." };
  }

  const sonuclar = ((data ?? []) as ArsivSonucSatiri[]).map((s) => ({
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
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, message: "Oturum bulunamadı." };
  }

  const normallestirilmis = kayitlar.map(paketSatisKaydiniNormallestir);

  const { data, error } = await supabase.rpc("paket_satis_arsiv_ekle", {
    p_paket_id: paketId,
    p_kayitlar: normallestirilmis,
  });

  if (error) {
    console.error("Paket satış arşiv içe aktarma hatası:", error);
    if (error.message === "yetkisiz") {
      return { success: false, message: "Bu işlem için yetkiniz yok (sadece klinik yöneticisi kullanabilir)." };
    }
    if (error.message === "paket_bulunamadi") {
      return { success: false, message: "Seçilen paket bulunamadı." };
    }
    return { success: false, message: "İçe aktarma başarısız oldu, lütfen tekrar deneyin." };
  }

  const sonuclar = ((data ?? []) as ArsivSonucSatiri[]).map((s) => ({
    ...s,
    satir_no: s.satir_no + baslangicSatirNo - 1,
  }));

  return { success: true, message: "Tamamlandı.", sonuclar };
}
