// Form/DB snake_case alanlarını Drizzle kolon anahtarlarına (camelCase) çevirir. Bilinmeyen bir alan SESSİZCE yok sayılmaz, hata fırlatılır
// (Drizzle bilinmeyen anahtarı sessizce atlar; formdaki bir alanın kaydedilmeden kalması fark edilmeden kalırdı).
import { getTableColumns } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

export function snakeKolonlari(tablo: PgTable, veri: Record<string, unknown>): Record<string, unknown> {
  const kolonlar = getTableColumns(tablo);
  const adIndeksi = new Map(Object.entries(kolonlar).map(([anahtar, k]) => [k.name, anahtar]));
  const sonuc: Record<string, unknown> = {};
  for (const [ad, deger] of Object.entries(veri)) {
    const anahtar = adIndeksi.get(ad);
    if (!anahtar) throw new Error(`bilinmeyen_kolon:${ad}`);
    sonuc[anahtar] = deger;
  }
  return sonuc;
}
