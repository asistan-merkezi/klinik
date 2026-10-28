"use server";

import { arsivParcasiSemasi } from "@/lib/guvenlik/girdi";
import { pgHata, rpc, withTenant } from "@/lib/db";
import { eylemYetkisi, YETKISIZ_MESAJI } from "@/lib/auth/yetki";
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
  // Girdi sınırları (zod): parça başına en çok 500 satır, alan başına 1000 karakter.
  if (!arsivParcasiSemasi.safeParse({ kayitlar, baslangicSatirNo }).success) return { success: false, message: "Geçersiz veri parçası." };
  if (!Number.isInteger(varsayilanSureDakika) || varsayilanSureDakika < 5 || varsayilanSureDakika > 480) return { success: false, message: "Varsayılan süre geçersiz." };
  // Arşiv içe aktarma yalnız klinik_admin (RPC de aynı kuralı içeride zorlar); tenant oturumdan gelir.
  const y = await eylemYetkisi(["klinik_admin"]);
  if (!y.yetkili || !y.bag) return { success: false, message: YETKISIZ_MESAJI };

  const normallestirilmis = kayitlar.map((kayit) => randevuKaydiniNormallestir(kayit, varsayilanSureDakika));

  let data: ArsivSonucSatiri[];
  try {
    data = await withTenant(y.bag, async (tx) => {
      const satir = (await rpc<Record<string, ArsivSonucSatiri[] | null>>(tx, "randevu_arsiv_ice_aktar", { p_kayitlar: normallestirilmis }))[0];
      return satir?.randevu_arsiv_ice_aktar ?? [];
    });
  } catch (e) {
    const h = pgHata(e);
    console.error("Randevu arşiv içe aktarma hatası:", h.mesaj);
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
