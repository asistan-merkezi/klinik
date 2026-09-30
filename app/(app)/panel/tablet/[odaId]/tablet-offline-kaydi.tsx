"use client";

import { useEffect } from "react";

/**
 * Tablet çevrimdışıyken sayfa yeniden yüklenirse (F5/yeniden başlatma)
 * tarayıcının hata ekranı yerine statik "Bağlantı Bekleniyor" sayfasını
 * gösteren service worker'ı kaydeder. Sayfa önbelleği YOK (bkz. public/tablet-sw.js).
 */
export function TabletOfflineKaydi() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/tablet-sw.js", { scope: "/panel/tablet/" })
      .catch(() => {
        // Kayıt başarısızsa yalnız yedek sayfa devre dışı kalır; ekran etkilenmez.
      });
  }, []);

  return null;
}
