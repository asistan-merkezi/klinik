import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { KrediTakip, type KrediTakipGorunum, type KrediTakipMesaj } from "@/components/mesajlasma/KrediTakip";
import { KrediYukleme } from "@/components/mesajlasma/KrediYukleme";
import { KANAL_ETIKET, type MesajKanal, type MesajKrediHareketi } from "@/types/mesajlasma";
import { tetikleyiciGetir } from "@/lib/mesaj/tetikleyiciler";
import { merkezdenBakiyeCek, merkezdenKrediPaketleriCek } from "@/lib/mesaj/merkez-client";
import { tumSayfalariOku } from "@/lib/supabase/sayfali-okuma";
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

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("rol, klinik_id").eq("id", user.id).single();

  if (kullanici?.rol !== "klinik_admin") {
    redirect("/panel/ayarlar/mesajlasma");
  }

  const klinikId = kullanici.klinik_id;
  if (!klinikId) {
    return (
      <div className="flex-1 bg-background p-4 sm:p-8">
        <p className="text-sm text-muted-foreground">Klinik bilgisi bulunamadı.</p>
      </div>
    );
  }

  // Ödeme sayfasından dönüşte merkezdeki güncel bakiyeyi hemen yansıt (saatlik
  // cron'u beklemeden). Versiyon guard'ı RPC'de — eski bir yanıt yeniyi ezmez.
  if (odeme === "donuldu") {
    const merkez = await merkezdenBakiyeCek(klinikId, kanal);
    if (merkez.ulasildi) {
      const { error } = await createAdminClient().rpc("mesaj_kredi_senkronla", {
        p_klinik_id: klinikId,
        p_kanal: kanal,
        p_bakiye: merkez.bakiye,
        p_versiyon: merkez.bakiyeVersiyonu,
      });
      if (error) console.error("Ödeme dönüşü kredi senkronu başarısız:", error.message);
    }
  }

  const sekme: "takip" | "yukle" = sekmeParam === "yukle" ? "yukle" : "takip";
  const taban = `/panel/ayarlar/mesajlasma/kredi/${kanal}`;

  const { data: bakiyeSatiri } = await supabase
    .from("mesaj_kredileri")
    .select("bakiye, son_senkron_zamani")
    .eq("klinik_id", klinikId)
    .eq("kanal", kanal)
    .maybeSingle<{ bakiye: number; son_senkron_zamani: string | null }>();

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

    // 1000 satır sınırında sessiz kesilmesin diye sayfalı okunur (tarih + id sıralı).
    const satirlar = await tumSayfalariOku<KuyrukSatiri>((bas, son) =>
      supabase
        .from("mesaj_kuyrugu")
        .select("id, tetikleyici_kodu, gonderim_zamani, alici_adres")
        .eq("klinik_id", klinikId)
        .eq("kanal", kanal)
        .eq("durum", "gonderildi")
        .eq("test_mi", false)
        .gte("gonderim_zamani", donem.baslangic)
        .lt("gonderim_zamani", donem.bitis)
        .order("gonderim_zamani", { ascending: false })
        .order("id", { ascending: false })
        .range(bas, son)
        .returns<KuyrukSatiri[]>()
    );

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
    const [paketSonucu, hareketSonucu] = await Promise.all([
      merkezdenKrediPaketleriCek(kanal),
      supabase
        .from("mesaj_kredi_hareketleri")
        .select("id, kanal, tip, miktar, tutar, aciklama, created_at")
        .eq("klinik_id", klinikId)
        .eq("kanal", kanal)
        .order("created_at", { ascending: false })
        .limit(50)
        .returns<MesajKrediHareketi[]>(),
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
        hareketler={hareketSonucu.data ?? []}
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
                ? `Merkezle son senkron: ${new Date(bakiyeSatiri.son_senkron_zamani).toLocaleString("tr-TR")}`
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
