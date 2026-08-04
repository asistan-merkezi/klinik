"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AdimBasliklari } from "@/components/panel/ice-aktarma/adim-basliklari";
import { DosyaSec } from "@/components/panel/ice-aktarma/dosya-sec";
import { BeklenenSutunlar } from "@/components/panel/ice-aktarma/beklenen-sutunlar";
import { SablonIndir } from "@/components/panel/ice-aktarma/sablon-indir";
import {
  SutunEsleme,
  otomatikEslemeOner,
  esitlemeyleSatirlariCevir,
  metniNormallestir,
  type HedefAlan,
} from "@/components/panel/ice-aktarma/sutun-esleme";
import { OnizlemeTablosu, SonucRaporu, type ArsivSonucSatiri } from "@/components/panel/ice-aktarma/onizleme-tablosu";
import type { OkunmusDosya } from "@/lib/ice-aktarma/dosya-oku";
import { hastaTelefonlariniEslestir } from "@/lib/ice-aktarma/hasta-eslestirme.actions";
import { randevulariArsivdenIceAktar } from "./actions";

type SecenekListesi = { id: string; ad: string }[];

const HEDEF_ALANLAR: HedefAlan[] = [
  { key: "hasta_telefon", label: "Hasta Telefonu", zorunlu: true },
  { key: "terapist_adi", label: "Terapist Adı", zorunlu: true },
  { key: "oda_adi", label: "Oda Adı", zorunlu: true },
  { key: "islem_tanimi_adi", label: "Tedavi / İşlem Adı" },
  { key: "baslangic", label: "Başlangıç Tarih ve Saati", zorunlu: true },
  { key: "bitis", label: "Bitiş Tarih ve Saati", zorunlu: true },
  { key: "tani", label: "Tanı" },
];

const ADIM_BASLIKLARI = ["Dosya Yükle", "Sütun Eşleştir", "Eşleştirme", "İçe Aktar & Sonuç"];
const PARCA_BOYUTU = 200;

function benzerSecenegiBul(deger: string, secenekler: SecenekListesi): string {
  const hedef = metniNormallestir(deger);
  const bulunan = secenekler.find((s) => {
    const secenekNorm = metniNormallestir(s.ad);
    return secenekNorm === hedef || secenekNorm.includes(hedef) || hedef.includes(secenekNorm);
  });
  return bulunan?.id ?? "";
}

function benzersizDegerler(satirlar: Record<string, string>[], alan: string): string[] {
  const set = new Set<string>();
  for (const satir of satirlar) {
    const deger = satir[alan]?.trim();
    if (deger) set.add(deger);
  }
  return Array.from(set).sort();
}

function EslestirmeSecici({
  secenekler,
  secili,
  onDegistir,
  bosEtiket,
}: {
  secenekler: SecenekListesi;
  secili: string;
  onDegistir: (deger: string) => void;
  bosEtiket: string;
}) {
  return (
    <select
      className="h-8 w-full rounded-lg border border-input bg-input-bg px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      value={secili}
      onChange={(e) => onDegistir(e.target.value)}
    >
      <option value="">{bosEtiket}</option>
      {secenekler.map((s) => (
        <option key={s.id} value={s.id}>
          {s.ad}
        </option>
      ))}
    </select>
  );
}

export function RandevularSihirbazi({
  terapistler,
  odalar,
  islemler,
}: {
  terapistler: SecenekListesi;
  odalar: SecenekListesi;
  islemler: SecenekListesi;
}) {
  const [adim, setAdim] = useState(1);
  const [dosya, setDosya] = useState<OkunmusDosya | null>(null);
  const [dosyaAdi, setDosyaAdi] = useState("");
  const [esleme, setEsleme] = useState<Record<string, string>>({});

  const [terapistOverride, setTerapistOverride] = useState<Record<string, string>>({});
  const [odaOverride, setOdaOverride] = useState<Record<string, string>>({});
  const [islemOverride, setIslemOverride] = useState<Record<string, string>>({});

  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [ilerleme, setIlerleme] = useState<{ islenen: number; toplam: number } | null>(null);
  const [sonuclar, setSonuclar] = useState<ArsivSonucSatiri[] | null>(null);
  const [genelHata, setGenelHata] = useState<string | null>(null);

  const eslenmisSatirlar = useMemo(() => {
    if (!dosya) return [];
    return esitlemeyleSatirlariCevir(dosya.satirlar, esleme);
  }, [dosya, esleme]);

  const zorunluAlanlarTamam = HEDEF_ALANLAR.filter((a) => a.zorunlu).every((a) => esleme[a.key]);

  const benzersizTerapistler = useMemo(() => benzersizDegerler(eslenmisSatirlar, "terapist_adi"), [eslenmisSatirlar]);
  const benzersizOdalar = useMemo(() => benzersizDegerler(eslenmisSatirlar, "oda_adi"), [eslenmisSatirlar]);
  const benzersizIslemler = useMemo(
    () => (esleme.islem_tanimi_adi ? benzersizDegerler(eslenmisSatirlar, "islem_tanimi_adi") : []),
    [eslenmisSatirlar, esleme.islem_tanimi_adi]
  );
  const benzersizTelefonlar = useMemo(() => benzersizDegerler(eslenmisSatirlar, "hasta_telefon"), [eslenmisSatirlar]);

  const terapistOnerileri = useMemo(
    () => Object.fromEntries(benzersizTerapistler.map((d) => [d, benzerSecenegiBul(d, terapistler)])),
    [benzersizTerapistler, terapistler]
  );
  const odaOnerileri = useMemo(
    () => Object.fromEntries(benzersizOdalar.map((d) => [d, benzerSecenegiBul(d, odalar)])),
    [benzersizOdalar, odalar]
  );
  const islemOnerileri = useMemo(
    () => Object.fromEntries(benzersizIslemler.map((d) => [d, benzerSecenegiBul(d, islemler)])),
    [benzersizIslemler, islemler]
  );

  const terapistEslemesi = useMemo(
    () => Object.fromEntries(benzersizTerapistler.map((d) => [d, terapistOverride[d] ?? terapistOnerileri[d] ?? ""])),
    [benzersizTerapistler, terapistOverride, terapistOnerileri]
  );
  const odaEslemesi = useMemo(
    () => Object.fromEntries(benzersizOdalar.map((d) => [d, odaOverride[d] ?? odaOnerileri[d] ?? ""])),
    [benzersizOdalar, odaOverride, odaOnerileri]
  );
  const islemEslemesi = useMemo(
    () => Object.fromEntries(benzersizIslemler.map((d) => [d, islemOverride[d] ?? islemOnerileri[d] ?? ""])),
    [benzersizIslemler, islemOverride, islemOnerileri]
  );

  const telefonSorgusu = useQuery({
    queryKey: ["arsiv-ice-aktarma-telefon-eslestirme", benzersizTelefonlar],
    queryFn: () => hastaTelefonlariniEslestir(benzersizTelefonlar),
    enabled: adim === 3 && benzersizTelefonlar.length > 0,
    staleTime: Infinity,
  });
  const telefonEslemeleri = telefonSorgusu.data ?? {};

  const tumTerapistlerEslendi = benzersizTerapistler.every((d) => terapistEslemesi[d]);
  const tumOdalarEslendi = benzersizOdalar.every((d) => odaEslemesi[d]);
  const eslestirmeAdimiTamam = tumTerapistlerEslendi && tumOdalarEslendi && telefonSorgusu.isSuccess;

  function dosyaOkundu(okunan: OkunmusDosya, ad: string) {
    setDosya(okunan);
    setDosyaAdi(ad);
    setEsleme(otomatikEslemeOner(okunan.basliklar, HEDEF_ALANLAR));
    setTerapistOverride({});
    setOdaOverride({});
    setIslemOverride({});
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
        terapist_id: terapistEslemesi[satir.terapist_adi?.trim() ?? ""] ?? "",
        oda_id: odaEslemesi[satir.oda_adi?.trim() ?? ""] ?? "",
        islem_tanimi_id: islemEslemesi[satir.islem_tanimi_adi?.trim() ?? ""] ?? "",
        baslangic: satir.baslangic ?? "",
        bitis: satir.bitis ?? "",
        tani: satir.tani ?? "",
      };
    });

    const birikenSonuclar: ArsivSonucSatiri[] = [];
    setIlerleme({ islenen: 0, toplam: cozumlenmisSatirlar.length });

    for (let i = 0; i < cozumlenmisSatirlar.length; i += PARCA_BOYUTU) {
      const parca = cozumlenmisSatirlar.slice(i, i + PARCA_BOYUTU);
      const sonuc = await randevulariArsivdenIceAktar(parca, i + 1);

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
            <SablonIndir hedefAlanlar={HEDEF_ALANLAR} dosyaAdi="randevu-gecmisi-sablon.csv" />
          </div>
          <DosyaSec onOkundu={dosyaOkundu} />
        </div>
      )}

      {adim === 2 && dosya && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            <strong>{dosyaAdi}</strong> — {dosya.satirlar.length} satır bulundu. Başlangıç ve bitiş için tek bir
            tarih-saat sütunu seçin (örn. 15.03.2024 14:30); dosyanızda süre ayrı bir sütundaysa yüklemeden önce
            Excel&rsquo;de tek sütuna birleştirin.
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
              Hasta Telefonu, Terapist Adı, Oda Adı, Başlangıç ve Bitiş alanları zorunludur.
            </p>
          )}
        </div>
      )}

      {adim === 3 && (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">
            Dosyadaki her farklı terapist/oda değeri için sistemdeki karşılığını seçin (dosya başına bir kez —
            satır satır değil). Hasta eşleştirmesi telefon numarasına göre otomatik yapıldı.
          </p>

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

          <div>
            <p className="mb-2 text-sm font-medium">Terapist Eşleştirmesi</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {benzersizTerapistler.map((deger) => (
                <div key={deger} className="flex flex-col gap-1.5">
                  <Label>{deger}</Label>
                  <EslestirmeSecici
                    secenekler={terapistler}
                    secili={terapistEslemesi[deger] ?? ""}
                    onDegistir={(v) => setTerapistOverride((s) => ({ ...s, [deger]: v }))}
                    bosEtiket="— Seçin —"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Oda Eşleştirmesi</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {benzersizOdalar.map((deger) => (
                <div key={deger} className="flex flex-col gap-1.5">
                  <Label>{deger}</Label>
                  <EslestirmeSecici
                    secenekler={odalar}
                    secili={odaEslemesi[deger] ?? ""}
                    onDegistir={(v) => setOdaOverride((s) => ({ ...s, [deger]: v }))}
                    bosEtiket="— Seçin —"
                  />
                </div>
              ))}
            </div>
          </div>

          {benzersizIslemler.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">Tedavi / İşlem Eşleştirmesi (opsiyonel)</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {benzersizIslemler.map((deger) => (
                  <div key={deger} className="flex flex-col gap-1.5">
                    <Label>{deger}</Label>
                    <EslestirmeSecici
                      secenekler={islemler}
                      secili={islemEslemesi[deger] ?? ""}
                      onDegistir={(v) => setIslemOverride((s) => ({ ...s, [deger]: v }))}
                      bosEtiket="— Eşleştirilmedi —"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="outline" onClick={() => setAdim(2)}>
              ‹ Geri
            </Button>
            <Button type="button" disabled={!eslestirmeAdimiTamam} onClick={() => setAdim(4)}>
              Devam Et ›
            </Button>
          </div>
          {!eslestirmeAdimiTamam && !telefonSorgusu.isLoading && (
            <p className="text-right text-xs text-destructive">Tüm terapist ve oda değerlerini eşleştirin.</p>
          )}
        </div>
      )}

      {adim === 4 && dosya && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {dosya.satirlar.length} satır içe aktarılacak. Hasta/terapist/oda bulunamayan veya aynı terapist/odada
            zaman çakışan satırlar atlanır ve aşağıda listelenir — diğer satırlar etkilenmez.
          </p>

          <div className="flex items-center gap-3">
            <Button type="button" onClick={iceAktar} disabled={gonderiliyor}>
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
            <Button type="button" variant="outline" onClick={() => setAdim(3)} disabled={gonderiliyor}>
              ‹ Geri
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
