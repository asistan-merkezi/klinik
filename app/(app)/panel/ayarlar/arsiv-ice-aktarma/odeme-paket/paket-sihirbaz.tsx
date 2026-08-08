"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { telefonGoster } from "@/lib/utils";
import { AdimBasliklari } from "@/components/panel/ice-aktarma/adim-basliklari";
import { DosyaSec } from "@/components/panel/ice-aktarma/dosya-sec";
import { BeklenenSutunlar } from "@/components/panel/ice-aktarma/beklenen-sutunlar";
import { SablonIndir } from "@/components/panel/ice-aktarma/sablon-indir";
import { SutunEsleme, otomatikEslemeOner, esitlemeyleSatirlariCevir, type HedefAlan } from "@/components/panel/ice-aktarma/sutun-esleme";
import { OnizlemeTablosu, SonucRaporu, type ArsivSonucSatiri } from "@/components/panel/ice-aktarma/onizleme-tablosu";
import type { OkunmusDosya } from "@/lib/ice-aktarma/dosya-oku";
import { hastaTelefonlariniEslestir } from "@/lib/ice-aktarma/hasta-eslestirme.actions";
import { paketSatislariniArsivdenIceAktar } from "./actions";

type PaketSecenegi = { id: string; ad: string };

const HEDEF_ALANLAR: HedefAlan[] = [
  { key: "hasta_telefon", label: "Hasta Telefonu", zorunlu: true },
  { key: "kalan_adet", label: "Kalan Seans Adedi", zorunlu: true },
  { key: "gecerlilik_bitis_tarihi", label: "Geçerlilik Bitiş Tarihi", zorunlu: true },
  { key: "satis_tarihi", label: "Satış Tarihi" },
];

const ADIM_BASLIKLARI = ["Paket Seç ve Dosya Yükle", "Sütun Eşleştir", "Hasta Eşleştir & İçe Aktar"];
const PARCA_BOYUTU = 200;

function benzersizDegerler(satirlar: Record<string, string>[], alan: string): string[] {
  const set = new Set<string>();
  for (const satir of satirlar) {
    const deger = satir[alan]?.trim();
    if (deger) set.add(deger);
  }
  return Array.from(set).sort();
}

export function PaketSihirbazi({ paketler }: { paketler: PaketSecenegi[] }) {
  const [adim, setAdim] = useState(1);
  const [paketId, setPaketId] = useState("");
  const [dosya, setDosya] = useState<OkunmusDosya | null>(null);
  const [dosyaAdi, setDosyaAdi] = useState("");
  const [esleme, setEsleme] = useState<Record<string, string>>({});

  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [ilerleme, setIlerleme] = useState<{ islenen: number; toplam: number } | null>(null);
  const [sonuclar, setSonuclar] = useState<ArsivSonucSatiri[] | null>(null);
  const [genelHata, setGenelHata] = useState<string | null>(null);

  const eslenmisSatirlar = useMemo(() => {
    if (!dosya) return [];
    return esitlemeyleSatirlariCevir(dosya.satirlar, esleme);
  }, [dosya, esleme]);

  const zorunluAlanlarTamam = HEDEF_ALANLAR.filter((a) => a.zorunlu).every((a) => esleme[a.key]);
  const benzersizTelefonlar = useMemo(() => benzersizDegerler(eslenmisSatirlar, "hasta_telefon"), [eslenmisSatirlar]);

  const telefonSorgusu = useQuery({
    queryKey: ["arsiv-ice-aktarma-telefon-eslestirme", benzersizTelefonlar],
    queryFn: () => hastaTelefonlariniEslestir(benzersizTelefonlar),
    enabled: adim === 3 && benzersizTelefonlar.length > 0,
    staleTime: Infinity,
  });
  const telefonEslemeleri = telefonSorgusu.data ?? {};

  function dosyaOkundu(okunan: OkunmusDosya, ad: string) {
    setDosya(okunan);
    setDosyaAdi(ad);
    setEsleme(otomatikEslemeOner(okunan.basliklar, HEDEF_ALANLAR));
    setSonuclar(null);
    setGenelHata(null);
    setAdim(2);
  }

  async function iceAktar() {
    if (!paketId) return;
    setGonderiliyor(true);
    setGenelHata(null);
    setSonuclar(null);

    const cozumlenmisSatirlar = eslenmisSatirlar.map((satir) => {
      const telefonSonucu = telefonEslemeleri[satir.hasta_telefon?.trim() ?? ""];
      return {
        hasta_id: telefonSonucu?.durum === "bulundu" ? telefonSonucu.hasta_id : "",
        kalan_adet: satir.kalan_adet ?? "",
        gecerlilik_bitis_tarihi: satir.gecerlilik_bitis_tarihi ?? "",
        satis_tarihi: satir.satis_tarihi ?? "",
      };
    });

    const birikenSonuclar: ArsivSonucSatiri[] = [];
    setIlerleme({ islenen: 0, toplam: cozumlenmisSatirlar.length });

    for (let i = 0; i < cozumlenmisSatirlar.length; i += PARCA_BOYUTU) {
      const parca = cozumlenmisSatirlar.slice(i, i + PARCA_BOYUTU);
      const sonuc = await paketSatislariniArsivdenIceAktar(paketId, parca, i + 1);

      if (!sonuc.success) {
        setGenelHata(sonuc.message);
        break;
      }

      birikenSonuclar.push(...(sonuc.sonuclar ?? []));
      setIlerleme({ islenen: Math.min(i + PARCA_BOYUTU, cozumlenmisSatirlar.length), toplam: cozumlenmisSatirlar.length });
      setSonuclar([...birikenSonuclar]);
    }

    setGonderiliyor(false);
  }

  return (
    <div className="flex flex-col gap-5">
      <AdimBasliklari basliklar={ADIM_BASLIKLARI} aktifAdim={adim} />

      {adim === 1 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="paket-secim">Bu dosyadaki tüm satırlar hangi pakete ait?</Label>
            <select
              id="paket-secim"
              className="h-8 w-full max-w-sm rounded-lg border border-input bg-input-bg px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={paketId}
              onChange={(e) => setPaketId(e.target.value)}
            >
              <option value="">— Paket seçin —</option>
              {paketler.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.ad}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Eski programın kendi paket kataloğu bu sistemdeki paketlerle otomatik eşleşmez — farklı paket
              türleri için bu sihirbazı ayrı dosyalarla birden fazla kez çalıştırın.
            </p>
          </div>
          {paketId && (
            <div className="flex flex-col gap-4">
              <BeklenenSutunlar hedefAlanlar={HEDEF_ALANLAR} />
              <div>
                <SablonIndir hedefAlanlar={HEDEF_ALANLAR} dosyaAdi="paket-hakki-sablon.csv" />
              </div>
              <DosyaSec onOkundu={dosyaOkundu} />
            </div>
          )}
        </div>
      )}

      {adim === 2 && dosya && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            <strong>{dosyaAdi}</strong> — {dosya.satirlar.length} satır bulundu.
          </p>
          <SutunEsleme
            kaynakBasliklar={dosya.basliklar}
            hedefAlanlar={HEDEF_ALANLAR}
            esleme={esleme}
            onDegistir={(key, deger) => setEsleme((e) => ({ ...e, [key]: deger }))}
          />
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="outline" onClick={() => setAdim(1)}>
              ‹ Geri
            </Button>
            <Button type="button" disabled={!zorunluAlanlarTamam} onClick={() => setAdim(3)}>
              Devam Et ›
            </Button>
          </div>
          {!zorunluAlanlarTamam && (
            <p className="text-right text-xs text-destructive">
              Telefon, Kalan Seans Adedi ve Geçerlilik Bitiş Tarihi alanları zorunludur.
            </p>
          )}
        </div>
      )}

      {adim === 3 && dosya && (
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-sm font-medium">Hasta Eşleştirmesi (telefon ile otomatik)</p>
            {telefonSorgusu.isLoading ? (
              <p className="text-sm text-muted-foreground">Eşleştiriliyor...</p>
            ) : (
              <OnizlemeTablosu
                satirlar={benzersizTelefonlar}
                kolonlar={[
                  { baslik: "Telefon", render: (t: string) => telefonGoster(t) || t },
                  {
                    baslik: "Eşleşme",
                    render: (t: string) => {
                      const sonuc = telefonEslemeleri[t];
                      if (!sonuc) return "—";
                      if (sonuc.durum === "bulundu") return sonuc.ad_soyad;
                      if (sonuc.durum === "birden_fazla") return "Birden fazla hasta eşleşti (satır atlanacak)";
                      return "Bulunamadı (satır atlanacak)";
                    },
                    className: "text-muted-foreground",
                  },
                ]}
              />
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button type="button" onClick={iceAktar} disabled={gonderiliyor || telefonSorgusu.isLoading}>
              {gonderiliyor ? "İçe aktarılıyor..." : "İçe Aktar"}
            </Button>
            {ilerleme && (
              <span className="text-sm text-muted-foreground">
                {ilerleme.islenen}/{ilerleme.toplam} satır işlendi
              </span>
            )}
          </div>

          {genelHata && <p className="text-sm text-destructive">{genelHata}</p>}
          {sonuclar && <SonucRaporu sonuclar={sonuclar} />}

          <div>
            <Button type="button" variant="outline" onClick={() => setAdim(2)} disabled={gonderiliyor}>
              ‹ Geri
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
