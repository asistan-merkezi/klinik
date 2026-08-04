"use server";

import { createClient } from "@/lib/supabase/server";
import { tarihSaatiIsoyaCevir } from "@/lib/ice-aktarma/normallestir";
import type { ArsivSonucSatiri } from "@/components/panel/ice-aktarma/onizleme-tablosu";

// "YYYY-MM-DDTHH:MM:SS" formatındaki (saat dilimsiz) başlangıca dakika ekler,
// aynı formatta döner. toISOString() KULLANILMIYOR — o UTC'ye çevirir ve
// baslangic'in orijinal (offset'siz) yorumuyla tutarsız kalırdı. Yerel getter'lar
// (getHours vb.) kullanılıp aynı şekilde geri yazıldığı için, RPC'nin
// ::timestamptz cast'i baslangic ile bitis'e AYNI ofseti uyguluyor — ikisi
// arasındaki fark (yani süre) her koşulda doğru kalıyor.
function bitisVarsayilandanHesapla(baslangicIso: string, sureDakika: number): string {
  const tarih = new Date(baslangicIso);
  tarih.setMinutes(tarih.getMinutes() + sureDakika);
  const iki = (n: number) => String(n).padStart(2, "0");
  return `${tarih.getFullYear()}-${iki(tarih.getMonth() + 1)}-${iki(tarih.getDate())}T${iki(tarih.getHours())}:${iki(tarih.getMinutes())}:${iki(tarih.getSeconds())}`;
}

function randevuKaydiniNormallestir(kayit: Record<string, string>, varsayilanSureDakika: number) {
  const baslangic = kayit.baslangic ? tarihSaatiIsoyaCevir(kayit.baslangic) : null;
  const bitisHam = kayit.bitis ? tarihSaatiIsoyaCevir(kayit.bitis) : null;

  return {
    hasta_id: kayit.hasta_id || null,
    terapist_id: kayit.terapist_id || null,
    oda_id: kayit.oda_id || null,
    islem_tanimi_id: kayit.islem_tanimi_id || null,
    baslangic,
    bitis: bitisHam ?? (baslangic ? bitisVarsayilandanHesapla(baslangic, varsayilanSureDakika) : null),
    tani: kayit.tani?.trim() || null,
  };
}

type SonucDurumu = { success: boolean; message: string; sonuclar?: ArsivSonucSatiri[] };

export async function randevulariArsivdenIceAktar(
  kayitlar: Record<string, string>[],
  baslangicSatirNo: number,
  varsayilanSureDakika: number
): Promise<SonucDurumu> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, message: "Oturum bulunamadı." };
  }

  const normallestirilmis = kayitlar.map((kayit) => randevuKaydiniNormallestir(kayit, varsayilanSureDakika));

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
