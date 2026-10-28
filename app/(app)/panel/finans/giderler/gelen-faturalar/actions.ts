"use server";

import { pgHata, sema, withTenant, type TenantBaglami } from "@/lib/db";
import { finansOturumu } from "@/lib/finans/eylem";
import { YETKISIZ_MESAJI } from "@/lib/auth/yetki";

type SonucDurumu = { success: boolean; message: string } | null;

/** Muhasebe Sync bağlantı kontrolü: secret kolonu OKUNMAZ, yalnız durum bilgisi. */
async function baglantiKontrolu(bag: TenantBaglami): Promise<SonucDurumu> {
  let durum: string | null = null;
  try {
    const satir = await withTenant(bag, (tx) => tx.select({ durum: sema.klinikMuhasebeEntegrasyonu.baglantiDurumu }).from(sema.klinikMuhasebeEntegrasyonu).limit(1));
    durum = satir[0]?.durum ?? null;
  } catch (e) {
    console.error("Muhasebe bağlantı durumu okunamadı:", pgHata(e).mesaj);
  }

  if (durum !== "baglandi") {
    return {
      success: false,
      message: "Muhasebe Sync henüz bağlı değil. Ayarlar > Muhasebe Sync'ten Paraşüt bilgilerini girin.",
    };
  }

  return null;
}

export async function arsiviGuncelle(): Promise<SonucDurumu> {
  const o = await finansOturumu(["klinik_admin", "muhasebe"]);
  if (!o) {
    return { success: false, message: YETKISIZ_MESAJI };
  }

  const baglantiHatasi = await baglantiKontrolu(o.bag);
  if (baglantiHatasi) {
    return baglantiHatasi;
  }

  // Kimlik bilgisi girilmiş olsa da gerçek Paraşüt API client'ı henüz yazılmadı
  // (bkz. CLAUDE.md), bu yüzden arşiv çekimi henüz çalışmıyor.
  return {
    success: false,
    message: "Muhasebe Sync bağlı ama Paraşüt API entegrasyonu henüz yazılmadı, arşiv otomatik çekilemiyor.",
  };
}

export async function stokFiyatlariniGuncelle(): Promise<SonucDurumu> {
  const o = await finansOturumu(["klinik_admin", "muhasebe"]);
  if (!o) {
    return { success: false, message: YETKISIZ_MESAJI };
  }

  const baglantiHatasi = await baglantiKontrolu(o.bag);
  if (baglantiHatasi) {
    return baglantiHatasi;
  }

  return {
    success: false,
    message: "Muhasebe Sync bağlı ama Paraşüt API entegrasyonu henüz yazılmadı, stok fiyatları senkronize edilemiyor.",
  };
}
