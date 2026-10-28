import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { Users, Briefcase } from "lucide-react";
import { and, asc, count, eq, gte, lt } from "drizzle-orm";
import { sema, withTenant } from "@/lib/db";
import { oturumBaglami } from "@/lib/auth/gecerli-kullanici";
import { panelBaglami } from "@/lib/auth/yetki";
import { tl, tlTopla } from "@/lib/para";
import { bankaHesaplariniGetir } from "@/lib/finans/okuma";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import type { PersonelSatir } from "@/types/personel";
import { ayAraligi } from "@/lib/utils";
import { PersonelListesi } from "./personel-listesi";
import { PersonelSekmeCubugu } from "./sekme-cubugu";
import { HesapOzeti, type HesapOzetSatir } from "./hesap-ozeti";
import { PERSONEL_SEKME_TANIMLARI, personelSekmeErisimVarMi, type PersonelSekme } from "./sekmeler";

export default async function PersonelSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; ay?: string }>;
}) {
  const { tab, ay: ayParam } = await searchParams;
  const ctx = await oturumBaglami();
  if (!ctx || ctx.tur !== "personel") {
    redirect("/giris");
  }
  const rol = ctx.rol;
  const yonetici = rol === "klinik_admin";
  // Klinik bağlamı ister (super_admin'de yok → 403).
  const { bag } = await panelBaglami();

  const izinliSekmeler = PERSONEL_SEKME_TANIMLARI.filter((s) => personelSekmeErisimVarMi(s, rol));
  const istenenSekme = PERSONEL_SEKME_TANIMLARI.some((s) => s.key === tab) ? (tab as PersonelSekme) : "liste";
  // İzinli olmayan/geçersiz bir sekme istenirse (elle URL değişikliği), herkese
  // açık olan "liste"ye sessizce düşülür — ayrı bir redirect'e gerek yok, sekme
  // çubuğu zaten sadece izinli sekmeleri linkliyor.
  const aktifSekme: PersonelSekme = izinliSekmeler.some((s) => s.key === istenenSekme) ? istenenSekme : "liste";

  // Puantaj sekmesinin artık kendi ara sayfası yok — direkt cetvele yönlendirilir
  // (sekme çubuğu zaten doğrudan cetvele linkliyor, bu sadece elle ?tab=puantaj
  // yazılması/eski bookmark için güvenlik ağı).
  if (aktifSekme === "puantaj") {
    redirect("/panel/personel/puantaj-cetveli");
  }

  let listeIcerigi: ReactNode = null;
  let hesapIcerigi: ReactNode = null;
  let bekleyenIzinSayisi = 0;

  // Rozet için sekme fark etmeksizin hep çekiliyor (yönetici Liste'deyken bile
  // "onay bekleyen var" görmeli) — tek satır count sorgusu, maliyeti düşük.
  if (yonetici) {
    const sayim = await withTenant(bag, (tx) => tx.select({ n: count() }).from(sema.personelIzinTalebi).where(eq(sema.personelIzinTalebi.durum, "beklemede")));
    bekleyenIzinSayisi = sayim[0]?.n ?? 0;
  }

  if (aktifSekme === "liste") {
    let personelSonucu: PersonelSatir[] = [];
    let error = false;
    const tamamlikMap = new Map<string, boolean>();
    try {
      const v = await withTenant(bag, async (tx) => ({
        personel: await tx
          .select({
            id: sema.personel.id, ad_soyad: sema.personel.adSoyad, gorev: sema.personel.gorev, maas: sema.personel.maas, aktif: sema.personel.aktif,
            telefon: sema.kullanici.telefon, poz_ad: sema.pozisyonlar.ad, poz_grup: sema.pozisyonlar.grup, poz_sira: sema.pozisyonlar.sira,
          })
          .from(sema.personel)
          .leftJoin(sema.kullanici, eq(sema.kullanici.id, sema.personel.kullaniciId))
          .leftJoin(sema.pozisyonlar, eq(sema.pozisyonlar.id, sema.personel.pozisyonId))
          .orderBy(asc(sema.personel.adSoyad)),
        durum: await tx.select({ id: sema.vPersonelBilgiDurumu.personelId, tamam: sema.vPersonelBilgiDurumu.bilgilerTamam }).from(sema.vPersonelBilgiDurumu),
      }));
      for (const d of v.durum) if (d.id) tamamlikMap.set(d.id, Boolean(d.tamam));
      personelSonucu = v.personel.map((p) => ({
        id: p.id, ad_soyad: p.ad_soyad, gorev: p.gorev, maas: p.maas === null ? null : tl(p.maas), aktif: p.aktif,
        kullanici: p.telefon === null ? null : { telefon: p.telefon },
        pozisyon: p.poz_ad === null ? null : { ad: p.poz_ad, grup: p.poz_grup as string, sira: p.poz_sira as number },
      })) as unknown as PersonelSatir[];
    } catch (e) {
      console.error("Personel listesi çekilemedi:", e);
      error = true;
    }

    const personelListesi = personelSonucu.map((p) => ({
      ...p,
      bilgiler_tamam: tamamlikMap.get(p.id) ?? false,
    }));

    listeIcerigi = (
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Personel Listesi"
          description="Çalışanlar; terapistler için performans ve maaş hesaplama."
          icon={Users}
          actions={
            yonetici && (
              <Button
                nativeButton={false}
                className="bg-emerald-500 text-white hover:bg-emerald-600 dark:hover:bg-emerald-600"
                render={
                  <Link href="/panel/personel/basvurular">
                    <Briefcase /> İş Başvurusu Ekle
                  </Link>
                }
              />
            )
          }
        />

        {error && <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>}
        {!error && personelListesi.length === 0 && (
          <EmptyState icon={Users} title="Henüz personel kaydı yok." />
        )}
        {!error && personelListesi.length > 0 && (
          <PersonelListesi personelListesi={personelListesi} yonetici={yonetici} />
        )}
      </div>
    );
  }

  if (aktifSekme === "hesap") {
    const ay = ayAraligi(ayParam);
    const v = await withTenant(bag, async (tx) => ({
      // aktif=false filtrelenmiyor (eski Personel Takip ekranı da filtrelemiyordu) — işten ayrılmış ama hâlâ alacağı olan personel bakiye özetinden kaybolmamalı.
      personel: await tx.select({ id: sema.personel.id, ad_soyad: sema.personel.adSoyad, gorev: sema.personel.gorev, maas: sema.personel.maas }).from(sema.personel).orderBy(asc(sema.personel.adSoyad)),
      bakiyeler: await tx.select({ id: sema.vPersonelHesapBakiye.personelId, bakiye: sema.vPersonelHesapBakiye.bakiye }).from(sema.vPersonelHesapBakiye),
      avanslar: await tx
        .select({ id: sema.personelHesapHareket.personelId, tutar: sema.personelHesapHareket.tutar })
        .from(sema.personelHesapHareket)
        .where(and(eq(sema.personelHesapHareket.tur, "avans"), gte(sema.personelHesapHareket.tarih, ay.baslangicTarih), lt(sema.personelHesapHareket.tarih, ay.bitisTarih))),
      bankaHesaplari: await bankaHesaplariniGetir(tx),
    }));
    const bankaHesaplari = v.bankaHesaplari;
    const personelListesi = v.personel;

    const bakiyeMap = new Map(v.bakiyeler.map((b) => [b.id as string, tl(b.bakiye)]));
    const avansListe = new Map<string, string[]>();
    for (const h of v.avanslar) avansListe.set(h.id, [...(avansListe.get(h.id) ?? []), h.tutar]);
    const avansMap = new Map([...avansListe].map(([id, liste]) => [id, tlTopla(liste)]));

    const satirlar: HesapOzetSatir[] = personelListesi.map((p) => ({
      personelId: p.id,
      adSoyad: p.ad_soyad,
      gorev: p.gorev,
      bakiye: bakiyeMap.get(p.id) ?? 0,
      maas: p.maas === null ? null : tl(p.maas),
      buAykiAvans: avansMap.get(p.id) ?? 0,
    }));

    hesapIcerigi = (
      <HesapOzeti
        satirlar={satirlar}
        ayEtiketi={ay.etiket}
        oncekiParam={ay.oncekiParam}
        sonrakiParam={ay.sonrakiParam}
        bankaHesaplari={bankaHesaplari}
        yonetici={yonetici}
      />
    );
  }

  return (
    <div className="flex-1 bg-background">
      <div className="mx-auto flex max-w-md flex-col gap-4 p-4 pb-24 sm:max-w-3xl sm:p-8">
        <PersonelSekmeCubugu
          aktifSekme={aktifSekme}
          izinliSekmeler={izinliSekmeler.map(({ key, label }) => ({ key, label }))}
          rozetler={{ puantaj: bekleyenIzinSayisi }}
        >
          {aktifSekme === "liste" && listeIcerigi}
          {aktifSekme === "hesap" && hesapIcerigi}
        </PersonelSekmeCubugu>
      </div>
    </div>
  );
}
