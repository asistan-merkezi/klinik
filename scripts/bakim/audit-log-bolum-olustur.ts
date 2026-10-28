// Her ayın 1'i 02:00: audit_log'un önümüzdeki 3 ayına ait aylık partition'larını önceden açar (audit_log_bolum_olustur, idempotent).
// Bölüm yoksa satır DEFAULT partition'a düşer ve o ay için bölüm sonradan açılamaz; bu yüzden pencere ileri taşınır.
import { bakimOturumuAc } from "@/lib/db/bakim";
import { rpc } from "@/lib/db";
import { calistir, gunlukYaz } from "./ortak";

const AD = "audit-log-bolum-olustur";
await calistir(AD, async () => {
  const oturum = bakimOturumuAc();
  try {
    // bakim_rolu bu fonksiyona doğrudan EXECUTE hakkına sahiptir (klinik bağlamı gerekmez).
    const r = await oturum.global((tx) => rpc<{ audit_log_bolum_olustur: { olusturulan: string[]; varsayilan_satir: number } }>(tx, "audit_log_bolum_olustur", { p_ileri_ay: 3 }));
    const sonuc = r[0]?.audit_log_bolum_olustur ?? { olusturulan: [], varsayilan_satir: 0 };
    if (sonuc.varsayilan_satir > 0) gunlukYaz(AD, "uyari", "DEFAULT partition'da satır var: bir ayın bölümü zamanında açılmamış", { satir: sonuc.varsayilan_satir });
    return { ozet: { olusturulan: sonuc.olusturulan.length, varsayilanSatir: sonuc.varsayilan_satir }, hataSayisi: sonuc.varsayilan_satir > 0 ? 1 : 0 };
  } finally {
    await oturum.kapat();
  }
});
