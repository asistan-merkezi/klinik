// Her ayın 1'i 03:00: son 3 ayın dönemlerini TÜM kliniklerdeki takipli aktif personel için kapatır ve hakedişi yazar (elle "Dönem Kapat" ile aynı kural).
// Çekirdek: lib/personel/donem-kapat.ts (idempotent; kapalı dönem tekrar çalışınca çift kayıt yazmaz).
import { bakimOturumuAc } from "@/lib/db/bakim";
import { klinikDonemleriniKapat } from "@/lib/personel/donem-kapat";
import { calistir, gunlukYaz } from "./ortak";

const AD = "personel-donem-otomatik-kapat";
await calistir(AD, async () => {
  const oturum = bakimOturumuAc();
  try {
    const klinikler = await oturum.klinikler();
    let kapatildi = 0;
    let zatenKapali = 0;
    let hata = 0;
    // Klinikler sırayla (her biri kendi içinde kişi/ay başına ayrı transaction); bir kliniğin hatası diğerlerini durdurmaz.
    for (const k of klinikler) {
      try {
        const aylar = await klinikDonemleriniKapat((is) => oturum.klinikte(k.id, is));
        for (const a of aylar) {
          kapatildi += a.kapatildi;
          zatenKapali += a.zatenKapali;
          hata += a.hata;
        }
      } catch (e) {
        hata++;
        gunlukYaz(AD, "hata", "klinik işlenemedi", { klinikId: k.id, hata: e instanceof Error ? e.message : String(e) });
      }
    }
    return { ozet: { klinik: klinikler.length, kapatildi, zatenKapali }, hataSayisi: hata };
  } finally {
    await oturum.kapat();
  }
});
