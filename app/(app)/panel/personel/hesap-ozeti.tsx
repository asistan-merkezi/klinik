import Link from "next/link";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export type HesapOzetSatir = {
  personelId: string;
  adSoyad: string;
  gorev: string;
  bakiye: number;
  buAyEklenen: number;
};

export function HesapOzeti({
  satirlar,
  ayEtiketi,
  oncekiParam,
  sonrakiParam,
}: {
  satirlar: HesapOzetSatir[];
  ayEtiketi: string;
  oncekiParam: string;
  sonrakiParam: string;
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
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/panel/personel?tab=hesap&ay=${sonrakiParam}`}>Sonraki ›</Link>}
            />
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
                    <span className="text-xs text-muted-foreground">
                      {s.gorev} · {ayEtiketi}: {s.buAyEklenen.toLocaleString("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 })} eklendi
                    </span>
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
