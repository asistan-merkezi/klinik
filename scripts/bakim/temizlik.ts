// Günlük temizlik (her klinik kendi tenant bağlamında): 2 günden eski islem_anahtari satırları (mali yazma idempotency anahtarları)
// ve süresi 1 günden uzun zaman önce dolmuş bildirim_baglanti satırları silinir. İdempotent.
import { bakimOturumuAc } from "@/lib/db/bakim";
import { klinikTemizle } from "@/lib/bakim/temizlik";
import { calistir, gunlukYaz } from "./ortak";

const AD = "temizlik";
await calistir(AD, async () => {
  const oturum = bakimOturumuAc();
  try {
    const sonuclar = await oturum.dolas((tx) => klinikTemizle(tx));
    let islemAnahtari = 0;
    let bildirimBaglanti = 0;
    let hata = 0;
    for (const s of sonuclar) {
      if (s.ok) {
        islemAnahtari += s.sonuc.islemAnahtari;
        bildirimBaglanti += s.sonuc.bildirimBaglanti;
      } else {
        hata++;
        gunlukYaz(AD, "hata", "klinik temizlenemedi", { klinikId: s.klinikId, hata: s.hata });
      }
    }
    return { ozet: { klinik: sonuclar.length, islemAnahtari, bildirimBaglanti }, hataSayisi: hata };
  } finally {
    await oturum.kapat();
  }
});
