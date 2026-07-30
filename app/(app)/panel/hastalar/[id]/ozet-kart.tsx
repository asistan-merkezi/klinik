import { Card, CardContent } from "@/components/ui/card";
import type { Cinsiyet } from "@/types/hasta";

function yasHesapla(dogumTarihi: string | null): number | null {
  if (!dogumTarihi) return null;
  const dogum = new Date(dogumTarihi);
  const bugun = new Date();
  let yas = bugun.getFullYear() - dogum.getFullYear();
  const ayFarki = bugun.getMonth() - dogum.getMonth();
  if (ayFarki < 0 || (ayFarki === 0 && bugun.getDate() < dogum.getDate())) {
    yas--;
  }
  return yas;
}

const CINSIYET_ETIKETLERI: Record<Cinsiyet, string | null> = {
  kadin: "Kadın",
  erkek: "Erkek",
  belirtilmemis: null,
};

export function OzetKart({
  adSoyad,
  telefon,
  dogumTarihi,
  cinsiyet,
}: {
  adSoyad: string;
  telefon: string;
  dogumTarihi: string | null;
  cinsiyet: Cinsiyet | null;
}) {
  const yas = yasHesapla(dogumTarihi);
  const cinsiyetEtiketi = cinsiyet ? CINSIYET_ETIKETLERI[cinsiyet] : null;

  return (
    <Card>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">{adSoyad}</h1>
          {cinsiyetEtiketi && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {cinsiyetEtiketi}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          <a href={`tel:${telefon}`} className="underline decoration-dotted underline-offset-2 hover:text-foreground">
            {telefon}
          </a>
          {yas != null && ` · ${yas} yaşında`}
        </p>
      </CardContent>
    </Card>
  );
}
