"use server";

import { telefonListesiSemasi } from "@/lib/guvenlik/girdi";
import { sema, withTenant } from "@/lib/db";
import { eylemYetkisi } from "@/lib/auth/yetki";
import { telefonAnahtari } from "@/lib/ice-aktarma/normallestir";

export type TelefonEslesmesi =
  | { durum: "bulundu"; hasta_id: string; ad_soyad: string }
  | { durum: "bulunamadi" }
  | { durum: "birden_fazla" };

// Randevu ve Ödeme/Paket arşiv sihirbazlarının ortak "hasta eşleştirme" adımı.
// BİLİNÇLİ OLARAK ham string eşleşmesi (`.eq`/`.in("telefon", ...)`) DEĞİL,
// normalize edilmiş `telefonAnahtari` üzerinden eşleştiriyor — hasta.telefon
// sistemde serbest metin (resepsiyonun elle girdiği format), arşiv dosyasındaki
// format birebir aynı olmayabilir ("0532 123 45 67" vs "5321234567" vs
// "+90 532...") — ham karşılaştırma bu farkları sessizce kaçırırdı. Bu yüzden
// hedefli `.in()` yerine klinik'in TÜM hastaları (RLS zaten current_klinik_id()'ye
// kısıtlıyor) çekilip anahtar bazında gruplanıyor.
export async function hastaTelefonlariniEslestir(telefonlar: string[]): Promise<Record<string, TelefonEslesmesi>> {
  // Arşiv içe aktarma yalnız klinik_admin; tenant oturumdan gelir.
  const y = await eylemYetkisi(["klinik_admin"]);
  if (!y.yetkili || !y.bag || telefonlar.length === 0 || !telefonListesiSemasi.safeParse(telefonlar).success) {
    return {};
  }

  // Drizzle'da PostgREST'in 1000 satır sınırı yoktur; klinik'in TÜM hastaları (RLS tenant'a kısıtlar) tek sorguda okunur.
  let data: { id: string; ad_soyad: string; telefon: string | null }[];
  try {
    data = await withTenant(y.bag, (tx) => tx.select({ id: sema.hasta.id, ad_soyad: sema.hasta.adSoyad, telefon: sema.hasta.telefon }).from(sema.hasta).orderBy(sema.hasta.id));
  } catch (hata) {
    console.error("Hasta telefon eşleştirme hatası:", hata);
    return {};
  }

  const gruplar = new Map<string, { id: string; ad_soyad: string }[]>();
  for (const satir of data) {
    const anahtar = telefonAnahtari(satir.telefon ?? "");
    if (!anahtar) continue;
    const liste = gruplar.get(anahtar) ?? [];
    liste.push({ id: satir.id, ad_soyad: satir.ad_soyad });
    gruplar.set(anahtar, liste);
  }

  const sonuc: Record<string, TelefonEslesmesi> = {};
  for (const telefon of telefonlar) {
    const eslesenler = gruplar.get(telefonAnahtari(telefon));
    if (!eslesenler || eslesenler.length === 0) {
      sonuc[telefon] = { durum: "bulunamadi" };
    } else if (eslesenler.length > 1) {
      sonuc[telefon] = { durum: "birden_fazla" };
    } else {
      sonuc[telefon] = { durum: "bulundu", hasta_id: eslesenler[0].id, ad_soyad: eslesenler[0].ad_soyad };
    }
  }
  return sonuc;
}
