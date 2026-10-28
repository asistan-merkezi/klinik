import { desc, eq } from "drizzle-orm";
import { MessageSquareWarning } from "lucide-react";
import { sema, withTenant } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { PageHeader } from "@/components/ui/page-header";
import type { DestekTalebi } from "@/types/destek";
import { TalepFormu } from "./talep-formu";
import { TalepListesi } from "./talep-listesi";
import { AdminTalepListesi } from "./admin-talep-listesi";

export default async function TalepSikayetlerSayfasi() {
  const { ctx, bag } = await panelBaglami();
  // Klinik geneli liste yalnız klinik_admin (ya da destek bağlamındaki super_admin); RLS aynı kuralı uygular.
  const klinikGeneliAdmin = ctx.rol === "klinik_admin" || ctx.rol === "super_admin";
  const T = sema.destekTalebi;
  const kolonlar = { id: T.id, klinik_id: T.klinikId, kullanici_id: T.kullaniciId, tur: T.tur, konu: T.konu, aciklama: T.aciklama, durum: T.durum, created_at: T.createdAt, guncellenme_tarihi: T.guncellenmeTarihi };

  const { kendi, klinik } = await withTenant(bag, async (tx) => ({
    kendi: await tx.select(kolonlar).from(T).where(eq(T.kullaniciId, ctx.userId)).orderBy(desc(T.createdAt)),
    klinik: klinikGeneliAdmin
      ? await tx
          .select({ ...kolonlar, ad_soyad: sema.kullanici.adSoyad })
          .from(T)
          .leftJoin(sema.kullanici, eq(sema.kullanici.id, T.kullaniciId))
          .where(eq(T.klinikId, bag.tenantId))
          .orderBy(desc(T.createdAt))
      : null,
  }));

  const kendiTalepler = kendi.map((t) => ({ ...t, kullanici: null })) as unknown as DestekTalebi[];
  const klinikTalepleri = (klinik ?? []).map(({ ad_soyad, ...t }) => ({ ...t, kullanici: ad_soyad ? { ad_soyad } : null })) as unknown as DestekTalebi[];

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          icon={MessageSquareWarning}
          title="Talep ve Şikayetler"
          description="Panel/yazılımla ilgili bir talep veya şikayetinizi buradan iletebilirsiniz. Hasta kimlik veya sağlık bilgisi yazmayın."
        />

        <TalepFormu />

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Gönderdiklerim</h2>
          <TalepListesi talepler={kendiTalepler} />
        </section>

        {klinikGeneliAdmin && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Klinik Geneli (Tümü)</h2>
            <AdminTalepListesi talepler={klinikTalepleri} />
          </section>
        )}
      </div>
    </div>
  );
}
