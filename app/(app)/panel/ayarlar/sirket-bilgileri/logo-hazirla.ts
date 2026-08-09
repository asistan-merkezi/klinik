const HEIC_UZANTI_REGEX = /\.(heic|heif)$/i;
const MAKS_KENAR_PIXEL = 1280;
const WEBP_KALITE = 0.85;

function heicMi(dosya: File): boolean {
  return dosya.type === "image/heic" || dosya.type === "image/heif" || HEIC_UZANTI_REGEX.test(dosya.name);
}

function svgMi(dosya: File): boolean {
  return dosya.type === "image/svg+xml" || dosya.name.toLowerCase().endsWith(".svg");
}

/**
 * Logo yükleme öncesi client-side hazırlık: HEIC/HEIF -> JPEG, ardından
 * canvas üzerinden en uzun kenarı MAKS_KENAR_PIXEL'e indirip WebP'ye çevirir.
 * SVG vektör olduğu için rasterize edilmeden olduğu gibi bırakılır.
 */
export async function logoHazirla(dosya: File): Promise<File> {
  if (svgMi(dosya)) return dosya;

  let calisilanDosya: File = dosya;

  if (heicMi(dosya)) {
    const heic2any = (await import("heic2any")).default;
    const sonuc = await heic2any({ blob: dosya, toType: "image/jpeg", quality: 0.92 });
    const blob = Array.isArray(sonuc) ? sonuc[0] : sonuc;
    calisilanDosya = new File([blob], dosya.name.replace(HEIC_UZANTI_REGEX, ".jpg"), {
      type: "image/jpeg",
    });
  }

  const objectUrl = URL.createObjectURL(calisilanDosya);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Görsel okunamadı."));
      el.src = objectUrl;
    });

    let { width, height } = img;
    const enUzunKenar = Math.max(width, height);
    if (enUzunKenar > MAKS_KENAR_PIXEL) {
      const olcek = MAKS_KENAR_PIXEL / enUzunKenar;
      width = Math.round(width * olcek);
      height = Math.round(height * olcek);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas desteklenmiyor.");
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", WEBP_KALITE));
    if (!blob) throw new Error("Görsel sıkıştırılamadı.");

    const isim = calisilanDosya.name.replace(/\.[^.]+$/, "") + ".webp";
    return new File([blob], isim, { type: "image/webp" });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
