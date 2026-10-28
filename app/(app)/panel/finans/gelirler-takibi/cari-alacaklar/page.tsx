import { asc, desc } from "drizzle-orm";
import { sema, withTenant } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { tl } from "@/lib/para";
import { ROL_GRUPLARI, sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { HandCoins } from "lucide-react";
import { CariAlacaklarListesi } from "./cari-alacaklar-listesi";

type CariOzetSatiri = {
  hasta_id: string;
  ad_soyad: string;
  toplam_bakiye: number;
  tahsil_edilen: number;
  kalan_bakiye: number;
};

export default async function CariAlacaklarTakibiSayfasi() {
  await sayfaYetkisiIste(ROL_GRUPLARI.finansFatura);
  const { bag } = await panelBaglami();

  // v_hasta_cari_ozet (SQL view) — cari bakiye kuralının TEK kaynağı; yalnız net borcu (kalan_bakiye > 0) olan hastalar gelir.
  const satirlar: CariOzetSatiri[] = await withTenant(bag, async (tx) => {
    const V = sema.vHastaCariOzet;
    const r = await tx
      .select({ hasta_id: V.hastaId, ad_soyad: V.adSoyad, toplam_bakiye: V.toplamBakiye, tahsil_edilen: V.tahsilEdilen, kalan_bakiye: V.kalanBakiye })
      .from(V)
      .orderBy(desc(V.kalanBakiye), desc(V.toplamBakiye), asc(V.hastaId));
    return r.map((x) => ({ hasta_id: x.hasta_id as string, ad_soyad: x.ad_soyad as string, toplam_bakiye: tl(x.toplam_bakiye), tahsil_edilen: tl(x.tahsil_edilen), kalan_bakiye: tl(x.kalan_bakiye) }));
  });

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <PageHeader
          title="Cari Alacaklar Takibi"
          description="Seans bedeli veya paket satışı cariye işlenen hastaların toplam bakiye, tahsil edilen ve kalan bakiye durumu. Bir satıra tıklayınca hastanın Cari & Ödeme sayfası açılır."
          icon={HandCoins}
        />

        {satirlar.length === 0 ? (
          <EmptyState icon={HandCoins} title="Henüz cari borç kaydı yok." />
        ) : (
          <CariAlacaklarListesi satirlar={satirlar} />
        )}
      </div>
    </div>
  );
}
