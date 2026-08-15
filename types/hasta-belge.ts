export type BelgeKategori = "radyoloji" | "klinik_foto" | "dokuman";

export const BELGE_KATEGORI_ETIKETLERI: Record<BelgeKategori, string> = {
  radyoloji: "Radyoloji",
  klinik_foto: "Klinik Foto",
  dokuman: "Doküman",
};

export type BelgeTuruRadyoloji = "rontgen" | "mr" | "tomografi" | "ultrason";
export type BelgeTuruKlinikFoto = "postur_on" | "postur_yan" | "postur_arka" | "bolgesel";
export type BelgeTuruDokuman = "recete" | "sevk" | "epikriz" | "diger";
export type BelgeTuru = BelgeTuruRadyoloji | BelgeTuruKlinikFoto | BelgeTuruDokuman;

export const BELGE_TURU_SECENEKLERI: Record<BelgeKategori, { value: BelgeTuru; label: string }[]> = {
  radyoloji: [
    { value: "rontgen", label: "Röntgen" },
    { value: "mr", label: "MR" },
    { value: "tomografi", label: "Tomografi" },
    { value: "ultrason", label: "Ultrason" },
  ],
  klinik_foto: [
    { value: "postur_on", label: "Postür (Ön)" },
    { value: "postur_yan", label: "Postür (Yan)" },
    { value: "postur_arka", label: "Postür (Arka)" },
    { value: "bolgesel", label: "Bölgesel" },
  ],
  dokuman: [
    { value: "recete", label: "Reçete" },
    { value: "sevk", label: "Sevk" },
    { value: "epikriz", label: "Epikriz" },
    { value: "diger", label: "Diğer" },
  ],
};

export const BELGE_TURU_ETIKETLERI: Record<BelgeTuru, string> = Object.fromEntries(
  Object.values(BELGE_TURU_SECENEKLERI)
    .flat()
    .map((s) => [s.value, s.label])
) as Record<BelgeTuru, string>;

export type BelgeAsama = "tedavi_oncesi" | "ara_kontrol" | "tedavi_sonrasi";

export const BELGE_ASAMA_ETIKETLERI: Record<BelgeAsama, string> = {
  tedavi_oncesi: "Tedavi Öncesi",
  ara_kontrol: "Ara Kontrol",
  tedavi_sonrasi: "Tedavi Sonrası",
};

export const KABUL_EDILEN_MIME_TIPLERI = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
] as const;

// Hangi boyutta gelirse gelsin fotoğraf sıkıştırılıp kaydedilsin istendiği
// için bu sadece tarayıcının donmaması için bir üst güvenlik sınırı —
// normal telefon/tarayıcı fotoğrafları (hatta yüksek çözünürlüklü taramalar)
// bu sınırın çok altında kalır ve gorseliHazirla() zaten her görseli 1280px
// kenar + WebP %85 kaliteye indiriyor.
export const MAX_DOSYA_BOYUTU_BYTE = 50 * 1024 * 1024;

export type HastaBelge = {
  id: string;
  hasta_id: string;
  kategori: BelgeKategori;
  belge_turu: BelgeTuru;
  bolge: string | null;
  cekim_tarihi: string;
  upload_tarihi: string;
  karsilastirma_grubu_id: string | null;
  asama: BelgeAsama | null;
  onam_id: string | null;
  storage_path: string;
  thumbnail_path: string | null;
  dosya_mime: string | null;
  dosya_boyut_byte: number | null;
  versiyon_no: number;
  onceki_belge_id: string | null;
  is_guncel: boolean;
  metadata: Record<string, unknown>;
  yukleyen_kullanici_id: string | null;
};
