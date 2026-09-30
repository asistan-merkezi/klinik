// Tablet kiosk "çevrimdışı yedek sayfa" service worker'ı — NETWORK-ONLY.
//
// Yalnızca statik /tablet-offline.html önbelleğe alınır. Hiçbir sayfa, API
// yanıtı ya da kimlik doğrulamalı içerik önbelleğe ALINMAZ: navigasyon her
// zaman ağa gider, yalnız ağ hatası olursa yedek sayfa gösterilir.
// Kapsam /panel/tablet/ ile sınırlı (bkz. tablet-offline-kaydi.tsx).
const ONBELLEK = "tablet-offline-v1";
const OFFLINE_URL = "/tablet-offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(ONBELLEK)
      .then((onbellek) => onbellek.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((adlar) => Promise.all(adlar.filter((ad) => ad !== ONBELLEK).map((ad) => caches.delete(ad))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(async () => {
      const yedek = await caches.match(OFFLINE_URL);
      return yedek ?? Response.error();
    })
  );
});
