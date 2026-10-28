"use server";

import { arsivParcasiSemasi } from "@/lib/guvenlik/girdi";
import { pgHata, rpc, withTenant } from "@/lib/db";
import { eylemYetkisi, YETKISIZ_MESAJI } from "@/lib/auth/yetki";
import { tarihiIsoyaCevir } from "@/lib/ice-aktarma/normallestir";
import type { ArsivSonucSatiri } from "@/components/panel/ice-aktarma/onizleme-tablosu";

const CINSIYET_ESLEME: Record<string, string> = {
  kadın: "kadin",
  kadin: "kadin",
  k: "kadin",
  erkek: "erkek",
  e: "erkek",
  belirtilmemiş: "belirtilmemis",
  belirtilmemis: "belirtilmemis",
};

// Kullanıcı kararıyla sadeleştirildi: referans kanalı, WhatsApp izni, kimlik
// türü, acil durum kişisi, tıbbi ön geçmiş alanları (kronik hastalık/ilaç/
// alerji/ameliyat/geliş sebebi) içe aktarma sihirbazından kaldırıldı — bu
// alanlar artık gönderilmiyor, RPC eksik/null geldiğinde zaten güvenli
// varsayılanlara düşüyor (whatsapp_izin_durumu=false, kimlik_no_tipi='tc').
function hastaKaydiniNormallestir(kayit: Record<string, string>) {
  const cinsiyetHam = (kayit.cinsiyet ?? "").trim().toLocaleLowerCase("tr");

  return {
    ad_soyad: (kayit.ad_soyad ?? "").trim(),
    telefon: (kayit.telefon ?? "").trim(),
    dogum_tarihi: kayit.dogum_tarihi ? tarihiIsoyaCevir(kayit.dogum_tarihi) : null,
    cinsiyet: CINSIYET_ESLEME[cinsiyetHam] ?? null,
    eposta: kayit.eposta?.trim() || null,
    kimlik_no: kayit.kimlik_no?.trim() || null,
    adres: kayit.adres?.trim() || null,
    il: kayit.il?.trim() || null,
    ilce: kayit.ilce?.trim() || null,
    mahalle: kayit.mahalle?.trim() || null,
  };
}

type SonucDurumu = { success: boolean; message: string; sonuclar?: ArsivSonucSatiri[] };

// Dosya client'ta okunup eşlendikten sonra parçalar (chunk) halinde çağrılır
// (bkz. sihirbaz.tsx) — baslangicSatirNo, bu parçanın orijinal dosyadaki
// gerçek satır numarasını RPC'nin döndürdüğü parça-içi sıraya eklemek için.
export async function hastalariArsivdenIceAktar(
  kayitlar: Record<string, string>[],
  baslangicSatirNo: number
): Promise<SonucDurumu> {
  // Girdi sınırları (zod): parça başına en çok 500 satır, alan başına 1000 karakter.
  if (!arsivParcasiSemasi.safeParse({ kayitlar, baslangicSatirNo }).success) return { success: false, message: "Geçersiz veri parçası." };
  // Arşiv içe aktarma yalnız klinik_admin (RPC de aynı kuralı içeride zorlar); tenant oturumdan gelir.
  const y = await eylemYetkisi(["klinik_admin"]);
  if (!y.yetkili || !y.bag) return { success: false, message: YETKISIZ_MESAJI };

  const normallestirilmis = kayitlar.map(hastaKaydiniNormallestir);

  let data: ArsivSonucSatiri[];
  try {
    data = await withTenant(y.bag, async (tx) => {
      const satir = (await rpc<Record<string, ArsivSonucSatiri[] | null>>(tx, "hasta_arsiv_ice_aktar", { p_kayitlar: normallestirilmis }))[0];
      return satir?.hasta_arsiv_ice_aktar ?? [];
    });
  } catch (e) {
    const h = pgHata(e);
    console.error("Hasta arşiv içe aktarma hatası:", h.mesaj);
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
