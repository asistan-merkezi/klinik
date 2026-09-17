import Link from "next/link";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import type { KlinikBankaHesabi } from "@/types/klinik";
import { HesapOdemeEkleButonu } from "./hesap-odeme-ekle-butonu";

export type HesapOzetSatir = {
  personelId: string;
  adSoyad: string;
  gorev: string;
  bakiye: number;
  /** personel.maas — "kayıtta olan" sabit maaş, Toplu Ödeme'de tutar önerisinin kaynağı. */
  maas: number | null;
  /** Görüntülenen ay içinde bu personele verilmiş avans toplamı (maaş önerisinden düşülür). */
  buAykiAvans: number;
};

export function HesapOzeti({
  satirlar,
  ayEtiketi,
  oncekiParam,
  sonrakiParam,
  bankaHesaplari,
  yonetici,
}: {
  satirlar: HesapOzetSatir[];
  ayEtiketi: string;
  oncekiParam: string;
  sonrakiParam: string;
  bankaHesaplari: KlinikBankaHesabi[];
  yonetici: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Hesap"
        description="Tüm personelin cari bakiyesi."
        icon={Wallet}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/panel/personel?tab=hesap&ay=${oncekiParam}`}>‹ Önceki</Link>}
            />
            <span className="px-1 text-sm font-medium whitespace-nowrap">{ayEtiketi}</span>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/panel/personel?tab=hesap&ay=${sonrakiParam}`}>Sonraki ›</Link>}
            />
            {yonetici && <HesapOdemeEkleButonu satirlar={satirlar} bankaHesaplari={bankaHesaplari} />}
          </>
        }
      />

      {satirlar.length === 0 ? (
        <EmptyState icon={Wallet} title="Henüz personel kaydı yok." compact />
      ) : (
        <ul className="flex flex-col gap-2">
          {satirlar.map((s) => (
            <li key={s.personelId}>
              <Card interactive className="flex-row items-center justify-between gap-3 p-3">
                <Link href={`/panel/personel/${s.personelId}?tab=odemeler`} className="flex flex-1 items-center justify-between gap-3">
                  <div className="flex flex-col">
                    <span className="font-medium">{s.adSoyad}</span>
                    <span className="text-xs text-muted-foreground">{s.gorev}</span>
                  </div>
                  <span className={`font-semibold ${s.bakiye < 0 ? "text-rose-600 dark:text-rose-400" : ""}`}>
                    {s.bakiye.toLocaleString("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 })}
                  </span>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
