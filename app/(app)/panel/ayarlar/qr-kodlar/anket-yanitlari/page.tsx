import { Star, MessageSquareHeart } from "lucide-react";
import { count, desc, eq, sum } from "drizzle-orm";
import { sema, withTenant, zamanlariIsoyaCevir } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { formatDateTime } from "@/lib/datetime";
import { cn, telefonGoster } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

const LISTE_LIMITI = 200;

export default async function AnketYanitlariSayfasi() {
  const { kullanici } = await sayfaYetkisiIste(["klinik_admin"], { yetkisizHedef: "/panel/ayarlar" });
  const { bag } = await panelBaglami();

  // Liste son 200 yanıtla sınırlı; ortalama ise TÜM puanlardan (tek toplama sorgusu — sayfalama/1000 satır kesilmesi sorunu yok).
  const { yanitlar, ozet } = await withTenant(bag, async (tx) => ({
    yanitlar: zamanlariIsoyaCevir(
      await tx
        .select({ id: sema.anketYaniti.id, puan: sema.anketYaniti.puan, oneri_metni: sema.anketYaniti.oneriMetni, ad_soyad: sema.anketYaniti.adSoyad, telefon: sema.anketYaniti.telefon, created_at: sema.anketYaniti.createdAt })
        .from(sema.anketYaniti)
        .where(eq(sema.anketYaniti.klinikId, kullanici.klinik_id!))
        .orderBy(desc(sema.anketYaniti.createdAt))
        .limit(LISTE_LIMITI)
    ),
    ozet: (await tx.select({ adet: count(sema.anketYaniti.puan), toplam: sum(sema.anketYaniti.puan) }).from(sema.anketYaniti).where(eq(sema.anketYaniti.klinikId, kullanici.klinik_id!)))[0],
  }));

  const oyAdedi = Number(ozet?.adet ?? 0);
  const ortalama = oyAdedi > 0 ? (Number(ozet?.toplam ?? 0) / oyAdedi).toFixed(1) : null;

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <PageHeader
          icon={MessageSquareHeart}
          title="Anket ve Öneriler"
          description={`QR kod üzerinden gelen hasta geri bildirimleri.${ortalama ? ` Ortalama puan: ${ortalama} / 5 (${oyAdedi} oy)` : ""}`}
        />

        {(!yanitlar || yanitlar.length === 0) && (
          <EmptyState icon={MessageSquareHeart} title="Henüz yanıt yok." />
        )}

        <ul className="flex flex-col divide-y divide-border">
          {(yanitlar ?? []).map((y) => (
            <li key={y.id} className="flex flex-col gap-2 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  {y.puan !== null &&
                    [1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={cn("size-4", n <= y.puan! ? "fill-amber-400 text-amber-400" : "text-muted-foreground")}
                      />
                    ))}
                </div>
                <span className="text-xs text-muted-foreground">{formatDateTime(y.created_at)}</span>
              </div>
              {y.oneri_metni && <p>{y.oneri_metni}</p>}
              {(y.ad_soyad || y.telefon) && (
                <p className="text-xs text-muted-foreground">
                  {[y.ad_soyad, telefonGoster(y.telefon)].filter(Boolean).join(" · ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
