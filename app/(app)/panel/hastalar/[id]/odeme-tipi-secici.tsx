"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OdemeYontemi } from "@/types/odeme";

// "Havale" burada types/odeme.ts'teki OdemeYontemi ile aynı değeri
// (banka_havalesi) kullanıyor ama daha kısa etiketle gösteriliyor.
export const ODEME_TIPI_ETIKETLERI: Record<OdemeYontemi, string> = {
  nakit: "Nakit",
  kredi_karti: "Kredi Kartı",
  banka_havalesi: "Havale",
};
const ODEME_TIPI_SIRASI: OdemeYontemi[] = ["nakit", "kredi_karti", "banka_havalesi"];
// "!" (important) önekleri bilinçli: Button'ın variant="outline" sınıfları
// (border-border/bg-surface-2) Tailwind'in derlenmiş CSS'inde bu emerald
// sınıflarından SONRA tanımlanıyor — aynı özgüllükte "sonraki kazanır"
// kuralı yüzünden className override'ı sessizce kaybediyordu (kullanıcı
// bildirdi: seçili kutu/buton renklenmiyordu). "!" ile override garantiye
// alındı, Tailwind kaynak sıralamasına bağımlı kalınmadı.
export const ODEME_TIPI_SECILI_SINIFI =
  "!border-emerald-500 !bg-emerald-500 !text-white hover:!bg-emerald-600 dark:hover:!bg-emerald-500/90";

export function OdemeTipiSecici({
  value,
  onChange,
  disabled,
}: {
  value: OdemeYontemi;
  onChange: (deger: OdemeYontemi) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {ODEME_TIPI_SIRASI.map((tip) => (
        <Button
          key={tip}
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn(value === tip && ODEME_TIPI_SECILI_SINIFI)}
          onClick={() => onChange(tip)}
        >
          {ODEME_TIPI_ETIKETLERI[tip]}
        </Button>
      ))}
    </div>
  );
}
