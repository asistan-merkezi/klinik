// Her ayın 1'i 04:00: bu yıl ve gelecek yılın sabit resmi tatillerini kesin tatil olarak yazar (global), dini bayramları Nager.Date'ten öneri olarak
// kliniklere düşürür (yönetici Ayarlar > Resmi Tatiller'den onaylar). İdempotent; Nager'a ulaşılamazsa sabit tatiller yine yazılır, öneriler sonraki çalışmada denenir.
import { bakimOturumuAc } from "@/lib/db/bakim";
import { guncellenecekYillar, klinikOnerileriniYaz, onerileriTopla, sabitTatilleriYaz } from "@/lib/tatil/guncelleme";
import { calistir, gunlukYaz } from "./ortak";

const AD = "resmi-tatil-guncelle";
await calistir(AD, async () => {
  const oturum = bakimOturumuAc();
  try {
    const yillar = guncellenecekYillar();
    const sabitEklenen = await oturum.global((tx) => sabitTatilleriYaz(tx, yillar));
    const { oneriler, hatalar } = await onerileriTopla(yillar);
    for (const h of hatalar) gunlukYaz(AD, "uyari", "Nager.Date'e ulaşılamadı", { ayrinti: h });
    const sonuclar = oneriler.size === 0 ? [] : await oturum.dolas((tx, klinik) => klinikOnerileriniYaz(tx, klinik.id, oneriler, yillar));
    const oneriEklenen = sonuclar.reduce((t, s) => t + (s.ok ? s.sonuc : 0), 0);
    const basarisiz = sonuclar.filter((s) => !s.ok);
    for (const s of basarisiz) if (!s.ok) gunlukYaz(AD, "hata", "klinik önerileri yazılamadı", { klinikId: s.klinikId, hata: s.hata });
    return { ozet: { yillar, sabitEklenen, oneriEklenen, nagerHatasi: hatalar.length }, hataSayisi: basarisiz.length };
  } finally {
    await oturum.kapat();
  }
});
