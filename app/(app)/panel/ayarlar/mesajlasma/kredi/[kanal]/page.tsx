import { notFound } from "next/navigation";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { sema, withTenant } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { KrediTakip, type KrediTakipGorunum, type KrediTakipMesaj } from "@/components/mesajlasma/KrediTakip";
import { KrediYukleme } from "@/components/mesajlasma/KrediYukleme";
import { KANAL_ETIKET, type MesajKanal, type MesajKrediHareketi } from "@/types/mesajlasma";
import { tetikleyiciGetir } from "@/lib/mesaj/tetikleyiciler";
import { merkezdenKrediPaketleriCek } from "@/lib/mesaj/merkez-client";
import { bugunIstanbulTarihi, formatDateForInput } from "@/lib/datetime";
import { raporAyDonemi, raporGunDonemi, raporYilDonemi } from "@/lib/raporlar/donem";
import { krediOdemeBaslat } from "./actions";

const GECERLI_KANALLAR: MesajKanal[] = ["sms", "whatsapp", "mail"];

type SayfaParametreleri = { sekme?: string; gorunum?: string; tarih?: string; odeme?: string };

function gunEkle(tarih: string, delta: number): string {
  const [y, a, g] = tarih.split("-").map(Number);
  return new Date(Date.UTC(y, a - 1, g + delta)).toISOString().slice(0, 10);
}

function ayEkle(tarih: string, delta: number): string {
  const [y, a] = tarih.split("-").map(Number);
  return new Date(Date.UTC(y, a - 1 + delta, 1)).toISOString().slice(0, 10);
}

function yilEkle(tarih: string, delta: number): string {
  const [y] = tarih.split("-").map(Number);
  return `${y + delta}-01-01`;
}

/** Telefon: son 2 hane açık; e-posta: yerel kısmın ilk harfi + alan adı açık. */
function aliciMaskele(adres: string): string {
  if (adres.includes("@")) {
    const [yerel, alan] = adres.split("@");
    return `${yerel.slice(0, 1)}•••@${alan}`;
  }
  return adres.length <= 2 ? adres : `${"•".repeat(adres.length - 2)}${adres.slice(-2)}`;
}

export default async function KrediDetaySayfasi({
  params,
  searchParams,
}: {
  params: Promise<{ kanal: string }>;
  searchParams: Promise<SayfaParametreleri>;
}) {
  const { kanal: kanalParam } = await params;
  const { sekme: sekmeParam, gorunum: gorunumParam, tarih: tarihParam, odeme } = await searchParams;

  if (!GECERLI_KANALLAR.includes(kanalParam as MesajKanal)) {
    notFound();
  }
  const kanal = kanalParam as MesajKanal;

  const { kullanici } = await sayfaYetkisiIste(["klinik_admin"], { yetkisizHedef: "/panel/ayarlar/mesajlasma" });
  const { bag } = await panelBaglami();

  const klinikId = kullanici.klinik_id;
  if (!klinikId) {
    return (
      <div className="flex-1 bg-background p-4 sm:p-8">
        <p className="text-sm text-muted-foreground">Klinik bilgisi bulunamadı.</p>
      </div>
    );
  }

  // Ödeme dönüşünde bakiye, kredi-senkron bakım işiyle (saatlik) merkezden yansır: kullanıcı oturumu yerel bakiyeyi yazamaz.
  const odemeDonusu = odeme === "donuldu";

  const sekme: "takip" | "yukle" = sekmeParam === "yukle" ? "yukle" : "takip";
  const taban = `/panel/ayarlar/mesajlasma/kredi/${kanal}`;

  const bakiyeSatiri = (
    await withTenant(bag, (tx) =>
      tx
        .select({ bakiye: sema.mesajKredileri.bakiye, son_senkron_zamani: sema.mesajKredileri.sonSenkronZamani })
        .from(sema.mesajKredileri)
        .where(and(eq(sema.mesajKredileri.klinikId, klinikId), eq(sema.mesajKredileri.kanal, kanal)))
        .limit(1)
    )
  )[0];

  const bugun = bugunIstanbulTarihi();

  let icerik: React.ReactNode;

  if (sekme === "takip") {
    const gorunum: KrediTakipGorunum = gorunumParam === "aylik" || gorunumParam === "yillik" ? gorunumParam : "gunluk";
    const gecerliTarih = !!tarihParam && /^\d{4}-\d{2}-\d{2}$/.test(tarihParam);
    const tarih = gecerliTarih ? (tarihParam > bugun ? bugun : tarihParam) : bugun;
    const [yil, ay] = tarih.split("-").map(Number);

    const donem = gorunum === "gunluk" ? raporGunDonemi(tarih) : gorunum === "aylik" ? raporAyDonemi(yil, ay) : raporYilDonemi(yil);

    // Önceki/sonraki gezinme tek bir "çapa" tarih üzerinden; sonraki yalnız
    // içinde bulunulan dönemi aşmıyorsa açık (gelecek dönem boş olurdu).
    const onceki = gorunum === "gunluk" ? gunEkle(tarih, -1) : gorunum === "aylik" ? ayEkle(tarih, -1) : yilEkle(tarih, -1);
    const sonrakiAday = gorunum === "gunluk" ? gunEkle(tarih, 1) : gorunum === "aylik" ? ayEkle(tarih, 1) : yilEkle(tarih, 1);
    const sonrakiAcik =
      gorunum === "gunluk"
        ? sonrakiAday <= bugun
        : gorunum === "aylik"
          ? sonrakiAday.slice(0, 7) <= bugun.slice(0, 7)
          : sonrakiAday.slice(0, 4) <= bugun.slice(0, 4);
    const href = (g: KrediTakipGorunum, t: string) => `${taban}?sekme=takip&gorunum=${g}&tarih=${t}`;

    type KuyrukSatiri = { id: string; tetikleyici_kodu: string; gonderim_zamani: string; alici_adres: string };

    const satirlar: KuyrukSatiri[] = (await withTenant(bag, (tx) =>
      tx
        .select({ id: sema.mesajKuyrugu.id, tetikleyici_kodu: sema.mesajKuyrugu.tetikleyiciKodu, gonderim_zamani: sema.mesajKuyrugu.gonderimZamani, alici_adres: sema.mesajKuyrugu.aliciAdres })
        .from(sema.mesajKuyrugu)
        .where(and(eq(sema.mesajKuyrugu.klinikId, klinikId), eq(sema.mesajKuyrugu.kanal, kanal), eq(sema.mesajKuyrugu.durum, "gonderildi"), eq(sema.mesajKuyrugu.testMi, false), gte(sema.mesajKuyrugu.gonderimZamani, donem.baslangic), lt(sema.mesajKuyrugu.gonderimZamani, donem.bitis)))
        .orderBy(desc(sema.mesajKuyrugu.gonderimZamani), desc(sema.mesajKuyrugu.id))
    )) as KuyrukSatiri[];

    const mesajlar: KrediTakipMesaj[] =
      gorunum === "gunluk"
        ? satirlar.map((s) => {
            const tanim = tetikleyiciGetir(s.tetikleyici_kodu);
            return {
              id: s.id,
              saat: new Date(s.gonderim_zamani).toLocaleTimeString("tr-TR", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Europe/Istanbul",
              }),
              tetikleyiciAdi: tanim?.ad ?? s.tetikleyici_kodu,
              bolum: tanim?.bolum ?? null,
              alici: aliciMaskele(s.alici_adres),
            };
          })
        : [];

    const toplamMap = new Map<string, number>();
    if (gorunum !== "gunluk") {
      for (const s of satirlar) {
        const gun = formatDateForInput(s.gonderim_zamani);
        const anahtar = gorunum === "aylik" ? gun : gun.slice(0, 7);
        toplamMap.set(anahtar, (toplamMap.get(anahtar) ?? 0) + 1);
      }
    }
    const toplamSatirlari = Array.from(toplamMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([anahtar, adet]) => ({
        etiket:
          gorunum === "aylik"
            ? new Date(`${anahtar}T12:00:00Z`).toLocaleDateString("tr-TR", {
                day: "2-digit",
                month: "long",
                weekday: "long",
                timeZone: "Europe/Istanbul",
              })
            : raporAyDonemi(Number(anahtar.slice(0, 4)), Number(anahtar.slice(5, 7))).etiket,
        adet,
      }));

    icerik = (
      <KrediTakip
        gorunum={gorunum}
        nav={{
          etiket: donem.etiket,
          onceki: href(gorunum, onceki),
          sonraki: sonrakiAcik ? href(gorunum, sonrakiAday) : null,
          gorunumHref: { gunluk: href("gunluk", tarih), aylik: href("aylik", tarih), yillik: href("yillik", tarih) },
        }}
        toplam={satirlar.length}
        mesajlar={mesajlar}
        toplamSatirlari={toplamSatirlari}
      />
    );
  } else {
    const [paketSonucu, hareketler] = await Promise.all([
      merkezdenKrediPaketleriCek(kanal),
      withTenant(bag, (tx) =>
        tx
          .select({ id: sema.mesajKrediHareketleri.id, kanal: sema.mesajKrediHareketleri.kanal, tip: sema.mesajKrediHareketleri.tip, miktar: sema.mesajKrediHareketleri.miktar, tutar: sema.mesajKrediHareketleri.tutar, aciklama: sema.mesajKrediHareketleri.aciklama, created_at: sema.mesajKrediHareketleri.createdAt })
          .from(sema.mesajKrediHareketleri)
          .where(and(eq(sema.mesajKrediHareketleri.klinikId, klinikId), eq(sema.mesajKrediHareketleri.kanal, kanal)))
          .orderBy(desc(sema.mesajKrediHareketleri.createdAt))
          .limit(50)
      ),
    ]);

    icerik = (
      <KrediYukleme
        paketler={paketSonucu.ulasildi ? paketSonucu.paketler : null}
        paketHatasi={
          paketSonucu.ulasildi
            ? null
            : paketSonucu.hata === "merkez_yapilandirilmadi"
              ? "Asistan Merkezi bağlantısı henüz kurulmadı — fiyat çizelgesi şu an alınamıyor."
              : "Asistan Merkezi'ne ulaşılamadı, fiyat çizelgesi alınamadı. Lütfen daha sonra tekrar deneyin."
        }
        hareketler={hareketler.map((h) => ({ ...h, tutar: h.tutar === null ? null : Number(h.tutar) })) as MesajKrediHareketi[]}
        action={krediOdemeBaslat.bind(null, kanal)}
      />
    );
  }

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          icon={Wallet}
          title={`${KANAL_ETIKET[kanal]} Kredisi`}
          breadcrumb={
            <Link href="/panel/ayarlar/mesajlasma" className="hover:underline">
              ‹ SMS/Whatsapp/Mail Ayarları
            </Link>
          }
          description="Bakiyenizi takip edin, kredi satın alın."
        />

        <Card>
          <CardContent className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">Güncel Bakiye — {KANAL_ETIKET[kanal]}</p>
            <p className="text-3xl font-semibold tabular-nums">{bakiyeSatiri?.bakiye ?? 0}</p>
            <p className="text-xs text-muted-foreground">
              {bakiyeSatiri?.son_senkron_zamani
                ? `Merkezle son senkron: ${new Date(bakiyeSatiri.son_senkron_zamani).toLocaleString("tr-TR")}${odemeDonusu ? " — ödemeniz işlendiyse bakiye birazdan güncellenir." : ""}`
                : "Henüz merkezle senkronize edilmedi."}
            </p>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button
            variant={sekme === "takip" ? "default" : "outline"}
            nativeButton={false}
            render={<Link href={`${taban}?sekme=takip`}>Kredi Takip</Link>}
            className={cn(sekme === "takip" && "pointer-events-none")}
          />
          <Button
            variant={sekme === "yukle" ? "default" : "outline"}
            nativeButton={false}
            render={<Link href={`${taban}?sekme=yukle`}>Kredi Yükleme</Link>}
            className={cn(sekme === "yukle" && "pointer-events-none")}
          />
        </div>

        {icerik}
      </div>
    </div>
  );
}
