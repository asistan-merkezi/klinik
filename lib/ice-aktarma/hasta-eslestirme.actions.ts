"use server";

import { createClient } from "@/lib/supabase/server";
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
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || telefonlar.length === 0) {
    return {};
  }

  const { data, error } = await supabase.from("hasta").select("id, ad_soyad, telefon");

  if (error || !data) {
    console.error("Hasta telefon eşleştirme hatası:", error);
    return {};
  }

  const gruplar = new Map<string, { id: string; ad_soyad: string }[]>();
  for (const satir of data) {
    const anahtar = telefonAnahtari(satir.telefon);
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
