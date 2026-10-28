import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { LifeBuoy } from "lucide-react";
import { sema, withKullanici } from "@/lib/db";
import { oturumBaglami } from "@/lib/auth/gecerli-kullanici";
import { kullaniciGerekli } from "@/lib/auth/oturum";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/datetime";
import { DestekBaglamiFormu } from "./destek-baglami-formu";
import { destekBaglamiKapat } from "./actions";

export default async function DestekBaglamiSayfasi() {
  const ctx = await oturumBaglami();
  if (!ctx || ctx.tur !== "personel") redirect("/giris");
  // Yalnız super_admin (rol oturumdan/DB'den gelir). Diğer roller kendi paneline döner.
  if (ctx.rol !== "super_admin") redirect("/panel");

  const klinikler = await withKullanici(kullaniciGerekli(ctx), (tx) => tx.select({ id: sema.klinik.id, ad: sema.klinik.ad }).from(sema.klinik).orderBy(asc(sema.klinik.ad)));
  const aktifKlinik = ctx.destek ? klinikler.find((k) => k.id === ctx.destek!.klinikId) : undefined;

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <PageHeader
          icon={LifeBuoy}
          title="Destek Bağlamı"
          description="Bir kliniğin verisine yalnız süre sınırlı (en çok 2 saat) ve gerekçeli destek bağlamıyla girilir. Açılış ve kapanış klinik yöneticisinin Denetim Geçmişi'ne yazılır; süre dolunca erişim veritabanı tarafından kapatılır."
        />

        {ctx.destek ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
            <p className="text-sm">
              <span className="font-medium">{aktifKlinik?.ad ?? "Klinik"}</span> kliniğinde destek bağlamı açık. Bitiş:{" "}
              <span className="font-medium tabular">{formatDateTime(ctx.destek.bitis.toISOString())}</span>
            </p>
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{ctx.destek.gerekce}</p>
            <div className="flex flex-wrap gap-2">
              <Button nativeButton={false} render={<a href="/panel">Panele git</a>} />
              <form action={destekBaglamiKapat}>
                <Button type="submit" variant="outline">
                  Bağlamı kapat
                </Button>
              </form>
            </div>
          </div>
        ) : (
          <DestekBaglamiFormu klinikler={klinikler} />
        )}
      </div>
    </div>
  );
}
