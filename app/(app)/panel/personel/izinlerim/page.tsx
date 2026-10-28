import { CalendarOff, CalendarClock } from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { sema, withTenant } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { izinBakiyesiGetir, kendiIzinTalepleriniGetir } from "@/lib/personel/sorgular";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { BakiyeKarti } from "./bakiye-karti";
import { TalepFormu, type PersonelSecici } from "./talep-formu";
import { TalepListesi } from "./talep-listesi";

export default async function IzinlerimSayfasi() {
  const { ctx, bag } = await panelBaglami();

  const personel = (
    await withTenant(bag, (tx) => tx.select({ id: sema.personel.id, ad_soyad: sema.personel.adSoyad }).from(sema.personel).where(eq(sema.personel.kullaniciId, ctx.userId)).limit(1))
  )[0];

  // klinik_admin/muhasebe kendi adına talep açmanın yanı sıra, departman → kişi seçerek BAŞKA bir personel adına da talep açabilir —
  // bu yüzden personel kaydı olmasalar bile sayfa boş dönmüyor, sadece Bakiye/Taleplerim bölümleri atlanıyor.
  const secimYapabilir = ctx.rol === "klinik_admin" || ctx.rol === "muhasebe";

  if (!personel && !secimYapabilir) {
    return (
      <div className="flex-1 bg-background p-4 sm:p-8">
        <div className="mx-auto max-w-2xl">
          <EmptyState icon={CalendarOff} title="Bu hesaba bağlı bir personel kaydı bulunamadı." />
        </div>
      </div>
    );
  }

  const v = await withTenant(bag, async (tx) => ({
    bakiye: personel ? await izinBakiyesiGetir(tx, personel.id) : null,
    talepler: personel ? await kendiIzinTalepleriniGetir(tx, personel.id) : null,
    liste: secimYapabilir
      ? await tx
          .select({ id: sema.personel.id, ad_soyad: sema.personel.adSoyad, grup: sema.pozisyonlar.grup })
          .from(sema.personel)
          .leftJoin(sema.pozisyonlar, eq(sema.pozisyonlar.id, sema.personel.pozisyonId))
          .where(eq(sema.personel.aktif, true))
          .orderBy(asc(sema.personel.adSoyad))
      : [],
  }));
  const bakiye = v.bakiye;
  const talepler = v.talepler;
  const personelListesiSonucu = v.liste.map((p) => ({ id: p.id, ad_soyad: p.ad_soyad, pozisyon: p.grup === null ? null : { grup: p.grup } }));

  const personelSecici: PersonelSecici = secimYapabilir
    ? {
        mod: "sec",
        personelListesi: personelListesiSonucu.map((p) => ({
          id: p.id,
          adSoyad: p.ad_soyad,
          departman: p.pozisyon?.grup ?? "Diğer",
        })),
      }
    : { mod: "kendi", adSoyad: personel!.ad_soyad };

  return (
    <div className="flex-1 bg-background">
      <div className="mx-auto flex max-w-2xl flex-col gap-5 p-4 pb-24 sm:p-8">
        <PageHeader title="İzin Talep Formu" description="Yeni izin talep giriş sayfası." icon={CalendarClock} />

        {bakiye && <BakiyeKarti bakiye={bakiye} />}

        <TalepFormu personelSecici={personelSecici} />

        {personel && (
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Taleplerim</h2>
            {!talepler || talepler.length === 0 ? (
              <EmptyState icon={CalendarOff} title="Henüz izin talebiniz yok." compact />
            ) : (
              <TalepListesi talepler={talepler} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
