"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { AdimBasliklari } from "@/components/panel/ice-aktarma/adim-basliklari";
import { DosyaSec } from "@/components/panel/ice-aktarma/dosya-sec";
import { BeklenenSutunlar } from "@/components/panel/ice-aktarma/beklenen-sutunlar";
import { SablonIndir } from "@/components/panel/ice-aktarma/sablon-indir";
import { SutunEsleme, otomatikEslemeOner, esitlemeyleSatirlariCevir, type HedefAlan } from "@/components/panel/ice-aktarma/sutun-esleme";
import { OnizlemeTablosu, SonucRaporu, type ArsivSonucSatiri } from "@/components/panel/ice-aktarma/onizleme-tablosu";
import type { OkunmusDosya } from "@/lib/ice-aktarma/dosya-oku";
import { hastaTelefonlariniEslestir } from "@/lib/ice-aktarma/hasta-eslestirme.actions";
import { bakiyeHareketleriniArsivdenIceAktar } from "./actions";

const HEDEF_ALANLAR: HedefAlan[] = [
  { key: "hasta_telefon", label: "Hasta Telefonu", zorunlu: true },
  { key: "tur", label: "Tür (Ödeme/Kredi/Borç)", zorunlu: true },
  { key: "tutar", label: "Tutar", zorunlu: true },
  { key: "tarih", label: "Tarih", zorunlu: true },
  { key: "aciklama", label: "Açıklama" },
];

const ADIM_BASLIKLARI = ["Dosya Yükle", "Sütun Eşleştir", "Hasta Eşleştir & İçe Aktar"];
const PARCA_BOYUTU = 200;

function benzersizDegerler(satirlar: Record<string, string>[], alan: string): string[] {
  const set = new Set<string>();
  for (const satir of satirlar) {
    const deger = satir[alan]?.trim();
    if (deger) set.add(deger);
  }
  return Array.from(set).sort();
}

export function BakiyeSihirbazi() {
  const [adim, setAdim] = useState(1);
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
    setGonderiliyor(true);
    setGenelHata(null);
    setSonuclar(null);

    const cozumlenmisSatirlar = eslenmisSatirlar.map((satir) => {
      const telefonSonucu = telefonEslemeleri[satir.hasta_telefon?.trim() ?? ""];
      return {
        hasta_id: telefonSonucu?.durum === "bulundu" ? telefonSonucu.hasta_id : "",
        tur: satir.tur ?? "",
        tutar: satir.tutar ?? "",
        tarih: satir.tarih ?? "",
        aciklama: satir.aciklama ?? "",
      };
    });

    const birikenSonuclar: ArsivSonucSatiri[] = [];
    setIlerleme({ islenen: 0, toplam: cozumlenmisSatirlar.length });

    for (let i = 0; i < cozumlenmisSatirlar.length; i += PARCA_BOYUTU) {
      const parca = cozumlenmisSatirlar.slice(i, i + PARCA_BOYUTU);
      const sonuc = await bakiyeHareketleriniArsivdenIceAktar(parca, i + 1);

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
          <BeklenenSutunlar hedefAlanlar={HEDEF_ALANLAR} />
          <div>
            <SablonIndir hedefAlanlar={HEDEF_ALANLAR} dosyaAdi="bakiye-hareketi-sablon.csv" />
          </div>
          <DosyaSec onOkundu={dosyaOkundu} />
        </div>
      )}

      {adim === 2 && dosya && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            <strong>{dosyaAdi}</strong> — {dosya.satirlar.length} satır bulundu. Tür sütunu &quot;Ödeme&quot;,
            &quot;Kredi&quot; veya &quot;Borç&quot; değerlerinden birini içermeli.
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
            <p className="text-right text-xs text-destructive">Telefon, Tür, Tutar ve Tarih alanları zorunludur.</p>
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
                  { baslik: "Telefon", render: (t: string) => t },
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
