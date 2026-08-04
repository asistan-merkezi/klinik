"use server";

import { createClient } from "@/lib/supabase/server";
import { tarihSaatiIsoyaCevir } from "@/lib/ice-aktarma/normallestir";
import type { ArsivSonucSatiri } from "@/components/panel/ice-aktarma/onizleme-tablosu";

function randevuKaydiniNormallestir(kayit: Record<string, string>) {
  return {
    hasta_id: kayit.hasta_id || null,
    terapist_id: kayit.terapist_id || null,
    oda_id: kayit.oda_id || null,
    islem_tanimi_id: kayit.islem_tanimi_id || null,
    baslangic: kayit.baslangic ? tarihSaatiIsoyaCevir(kayit.baslangic) : null,
    bitis: kayit.bitis ? tarihSaatiIsoyaCevir(kayit.bitis) : null,
    tani: kayit.tani?.trim() || null,
  };
}

type SonucDurumu = { success: boolean; message: string; sonuclar?: ArsivSonucSatiri[] };

export async function randevulariArsivdenIceAktar(
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

  const normallestirilmis = kayitlar.map(randevuKaydiniNormallestir);

  const { data, error } = await supabase.rpc("randevu_arsiv_ice_aktar", { p_kayitlar: normallestirilmis });

  if (error) {
    console.error("Randevu arşiv içe aktarma hatası:", error);
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
