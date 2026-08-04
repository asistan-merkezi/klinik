import { Label } from "@/components/ui/label";

export type HedefAlan = { key: string; label: string; zorunlu?: boolean };

// AdresSecici'deki gerekçeyle aynı: dinamik/çok sayıda seçenek + programatik
// value için Base UI Select yerine native <select> (bkz. CLAUDE.md'deki Select
// "items" prop notu).
export function SutunEsleme({
  kaynakBasliklar,
  hedefAlanlar,
  esleme,
  onDegistir,
}: {
  kaynakBasliklar: string[];
  hedefAlanlar: HedefAlan[];
  esleme: Record<string, string>;
  onDegistir: (hedefKey: string, kaynakBaslik: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {hedefAlanlar.map((alan) => (
        <div key={alan.key} className="flex flex-col gap-1.5">
          <Label htmlFor={`esleme-${alan.key}`}>
            {alan.label}
            {alan.zorunlu && <span className="text-destructive"> *</span>}
          </Label>
          <select
            id={`esleme-${alan.key}`}
            className="h-8 w-full rounded-lg border border-input bg-input-bg px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            value={esleme[alan.key] ?? ""}
            onChange={(e) => onDegistir(alan.key, e.target.value)}
          >
            <option value="">— Eşleştirilmedi —</option>
            {kaynakBasliklar.map((baslik) => (
              <option key={baslik} value={baslik}>
                {baslik}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

// Randevu/Ödeme sihirbazlarındaki "dosya başına bir kere terapist/oda/paket
// eşleştir" adımında da kullanılıyor (bkz. randevular/sihirbaz.tsx).
export function metniNormallestir(deger: string): string {
  return deger
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/[^a-zçğöşü0-9]/g, "");
}

// Kaynak başlıkları hedef alan etiketleriyle basit bir benzerlik kontrolüyle
// otomatik eşleştirir (birebir/alt-dize eşleşme) — kullanıcı elle düzeltebilir,
// baştan tamamen boş bir formla uğraşmaz.
export function otomatikEslemeOner(kaynakBasliklar: string[], hedefAlanlar: HedefAlan[]): Record<string, string> {
  const esleme: Record<string, string> = {};
  for (const alan of hedefAlanlar) {
    const alanNorm = metniNormallestir(alan.label);
    const bulunan = kaynakBasliklar.find((baslik) => {
      const baslikNorm = metniNormallestir(baslik);
      return baslikNorm === alanNorm || baslikNorm.includes(alanNorm) || alanNorm.includes(baslikNorm);
    });
    if (bulunan) {
      esleme[alan.key] = bulunan;
    }
  }
  return esleme;
}

// Bir dosyadaki satırları, eşleme (hedef alan key -> kaynak başlık) kullanarak
// {hedefKey: deger} kayıtlarına çevirir. Üç sihirbazın hepsi bu şekilde önizleme
// ve gönderim verisini üretiyor.
export function esitlemeyleSatirlariCevir(
  satirlar: Record<string, string>[],
  esleme: Record<string, string>
): Record<string, string>[] {
  return satirlar.map((satir) => {
    const kayit: Record<string, string> = {};
    for (const [hedefKey, kaynakBaslik] of Object.entries(esleme)) {
      if (kaynakBaslik) {
        kayit[hedefKey] = satir[kaynakBaslik] ?? "";
      }
    }
    return kayit;
  });
}
