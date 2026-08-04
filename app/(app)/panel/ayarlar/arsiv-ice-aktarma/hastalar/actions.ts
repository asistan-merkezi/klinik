"use server";

import { createClient } from "@/lib/supabase/server";
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
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, message: "Oturum bulunamadı." };
  }

  const normallestirilmis = kayitlar.map(hastaKaydiniNormallestir);

  const { data, error } = await supabase.rpc("hasta_arsiv_ice_aktar", { p_kayitlar: normallestirilmis });

  if (error) {
    console.error("Hasta arşiv içe aktarma hatası:", error);
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
