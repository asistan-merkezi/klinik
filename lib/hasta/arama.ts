// Hasta listesi ve hızlı aramanın TEK giriş noktası: Türkçe uyumlu, yazım hatasına toleranslı `hasta_ara` fonksiyonu
// ("sahin" → "Şahin", "mehemt" → "Mehmet", telefon rakamları). Fonksiyon SETOF hasta döner ve çağıranın RLS'ine tabidir (tenant sınırı DB'de).
import { rpc, type Tx } from "@/lib/db";

export type HastaAramaSatiri = {
  id: string;
  ad_soyad: string;
  telefon: string;
  dogum_tarihi: string | null;
  kvkk_onay_tarihi: string | null;
  whatsapp_izin_durumu: boolean;
  eposta: string | null;
  kategori: string;
};

export async function hastaAra(tx: Tx, arama: string, limit: number): Promise<HastaAramaSatiri[]> {
  const satirlar = await rpc<HastaAramaSatiri>(tx, "hasta_ara", { p_sorgu: arama, p_limit: limit });
  return satirlar.map((h) => ({
    id: h.id,
    ad_soyad: h.ad_soyad,
    telefon: h.telefon,
    dogum_tarihi: h.dogum_tarihi,
    kvkk_onay_tarihi: h.kvkk_onay_tarihi,
    whatsapp_izin_durumu: h.whatsapp_izin_durumu,
    eposta: h.eposta,
    kategori: h.kategori,
  }));
}
