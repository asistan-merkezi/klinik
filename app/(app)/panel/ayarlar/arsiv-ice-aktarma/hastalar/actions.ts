"use server";

import { createClient } from "@/lib/supabase/server";
import { tarihiIsoyaCevir, metniBooleanaCevir } from "@/lib/ice-aktarma/normallestir";
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

function hastaKaydiniNormallestir(kayit: Record<string, string>) {
  const cinsiyetHam = (kayit.cinsiyet ?? "").trim().toLocaleLowerCase("tr");

  return {
    ad_soyad: (kayit.ad_soyad ?? "").trim(),
    telefon: (kayit.telefon ?? "").trim(),
    dogum_tarihi: kayit.dogum_tarihi ? tarihiIsoyaCevir(kayit.dogum_tarihi) : null,
    cinsiyet: CINSIYET_ESLEME[cinsiyetHam] ?? null,
    eposta: kayit.eposta?.trim() || null,
    referans_kanali: kayit.referans_kanali?.trim() || null,
    whatsapp_izin_durumu: kayit.whatsapp_izin_durumu ? metniBooleanaCevir(kayit.whatsapp_izin_durumu) : false,
    kimlik_no: kayit.kimlik_no?.trim() || null,
    kimlik_no_tipi: kayit.kimlik_no_tipi?.trim().toLocaleLowerCase("tr") || null,
    adres: kayit.adres?.trim() || null,
    il: kayit.il?.trim() || null,
    ilce: kayit.ilce?.trim() || null,
    mahalle: kayit.mahalle?.trim() || null,
    acil_durum_ad_soyad: kayit.acil_durum_ad_soyad?.trim() || null,
    acil_durum_yakinlik: kayit.acil_durum_yakinlik?.trim() || null,
    acil_durum_telefon: kayit.acil_durum_telefon?.trim() || null,
    kronik_hastaliklar: kayit.kronik_hastaliklar?.trim() || null,
    surekli_ilaclar: kayit.surekli_ilaclar?.trim() || null,
    alerjiler: kayit.alerjiler?.trim() || null,
    gecirilmis_ameliyatlar: kayit.gecirilmis_ameliyatlar?.trim() || null,
    gelis_sebebi: kayit.gelis_sebebi?.trim() || null,
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
