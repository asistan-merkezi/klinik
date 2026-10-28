// Mesaj İÇERİĞİ kuralı (docs/kvkk-aktarim.md, TÜM kanallar: e-posta, SMS, WhatsApp): mesajda kişisel/sağlık verisi OLMAZ.
// İzinli değişkenler yalnız `klinik_adi` ve `baglanti` (tek kullanımlık, süreli; lib/mesaj/baglanti.ts). Ad, tarih, tutar, paket, terapist gibi
// bilgiler mesaja GİRMEZ; alıcı bağlantıdan giriş yapıp ayrıntıyı uygulamada görür.
import { desenleriMaskeleSayisi } from "@/lib/destek-chatbot/maskele";

export const IZINLI_DEGISKENLER: readonly string[] = ["klinik_adi", "baglanti"];
export const GENEL_MESAJ_METNI = "{{klinik_adi}} size bir bildirim gönderdi. Görüntülemek için: {{baglanti}}";
/** E-posta konusu SABİT ve veri içermez. */
export const EPOSTA_KONUSU = "Klinik bildirimi";

export function metniDoldur(sablon: string, g: { klinikAdi: string; baglanti: string }): string {
  return sablon.replace(/\{\{(\w+)\}\}/g, (tam, ad: string) => (ad === "klinik_adi" ? g.klinikAdi : ad === "baglanti" ? g.baglanti : tam));
}

export type SablonKontrolu = { gecerli: boolean; neden?: "bilinmeyen_degisken" | "kisisel_veri_deseni"; ayrinti?: string[] };

/**
 * Kliniğin yazdığı serbest şablon: yalnız izinli değişkenler ve kimlik/IBAN/kart/telefon/e-posta DESENİ içermemeli. (Ad-soyad gibi serbest metin kod ile
 * yakalanamaz: klinik yöneticisinin sorumluluğudur; panelde uyarı gösterilir.) Kaydederken VE göndermeden hemen önce çağrılır.
 */
export function sablonuDogrula(metin: string): SablonKontrolu {
  const bilinmeyen = [...metin.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).filter((d) => !IZINLI_DEGISKENLER.includes(d));
  if (bilinmeyen.length > 0) return { gecerli: false, neden: "bilinmeyen_degisken", ayrinti: [...new Set(bilinmeyen)] };
  if (desenleriMaskeleSayisi(metin.replace(/\{\{\w+\}\}/g, "")) > 0) return { gecerli: false, neden: "kisisel_veri_deseni" };
  return { gecerli: true };
}
