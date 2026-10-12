import { revalidatePath } from "next/cache";

/** Gider/cari/kart değişikliği Giderler + Tedarikçiler + Raporlar + Kasa/Banka/Kredi Kartı ekranlarına yansır. */
export function finansSayfalariniYenile() {
  revalidatePath("/panel/finans/giderler");
  revalidatePath("/panel/finans/giderler/tedarikciler");
  revalidatePath("/panel/finans/raporlar");
  revalidatePath("/panel/finans/kasa");
  revalidatePath("/panel/finans/banka");
  revalidatePath("/panel/finans/kredi-karti");
}
