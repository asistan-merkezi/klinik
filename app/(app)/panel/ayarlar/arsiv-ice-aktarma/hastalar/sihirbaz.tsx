"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { AdimBasliklari } from "@/components/panel/ice-aktarma/adim-basliklari";
import { DosyaSec } from "@/components/panel/ice-aktarma/dosya-sec";
import { SutunEsleme, otomatikEslemeOner, esitlemeyleSatirlariCevir, type HedefAlan } from "@/components/panel/ice-aktarma/sutun-esleme";
import { OnizlemeTablosu, SonucRaporu, type ArsivSonucSatiri } from "@/components/panel/ice-aktarma/onizleme-tablosu";
import type { OkunmusDosya } from "@/lib/ice-aktarma/dosya-oku";
import { hastalariArsivdenIceAktar } from "./actions";

const HEDEF_ALANLAR: HedefAlan[] = [
  { key: "ad_soyad", label: "Ad Soyad", zorunlu: true },
  { key: "telefon", label: "Telefon", zorunlu: true },
  { key: "dogum_tarihi", label: "Doğum Tarihi" },
  { key: "cinsiyet", label: "Cinsiyet" },
  { key: "eposta", label: "E-posta" },
  { key: "referans_kanali", label: "Referans Kanalı" },
  { key: "whatsapp_izin_durumu", label: "WhatsApp İzni (Evet/Hayır)" },
  { key: "kimlik_no", label: "TC Kimlik / Pasaport No" },
  { key: "kimlik_no_tipi", label: "Kimlik Türü (tc/pasaport)" },
  { key: "adres", label: "Adres (sokak/no/daire)" },
  { key: "il", label: "İl" },
  { key: "ilce", label: "İlçe" },
  { key: "mahalle", label: "Mahalle" },
  { key: "acil_durum_ad_soyad", label: "Acil Durum Kişisi Ad Soyad" },
  { key: "acil_durum_yakinlik", label: "Acil Durum Kişisi Yakınlığı" },
  { key: "acil_durum_telefon", label: "Acil Durum Kişisi Telefonu" },
  { key: "kronik_hastaliklar", label: "Kronik Hastalıklar" },
  { key: "surekli_ilaclar", label: "Sürekli Kullanılan İlaçlar" },
  { key: "alerjiler", label: "Alerjiler" },
  { key: "gecirilmis_ameliyatlar", label: "Geçirilmiş Ameliyatlar" },
  { key: "gelis_sebebi", label: "Geliş Sebebi" },
];

const ADIM_BASLIKLARI = ["Dosya Yükle", "Sütun Eşleştir", "İçe Aktar & Sonuç"];
const PARCA_BOYUTU = 200;

export function HastalarSihirbazi() {
  const [adim, setAdim] = useState(1);
  const [dosya, setDosya] = useState<OkunmusDosya | null>(null);
  const [dosyaAdi, setDosyaAdi] = useState("");
  const [esleme, setEsleme] = useState<Record<string, string>>({});
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [ilerleme, setIlerleme] = useState<{ islenen: number; toplam: number } | null>(null);
  const [sonuclar, setSonuclar] = useState<ArsivSonucSatiri[] | null>(null);
  const [genelHata, setGenelHata] = useState<string | null>(null);

  const eslenmisOnizleme = useMemo(() => {
    if (!dosya) return [];
    return esitlemeyleSatirlariCevir(dosya.satirlar.slice(0, 5), esleme);
  }, [dosya, esleme]);

  const zorunluAlanlarTamam = HEDEF_ALANLAR.filter((a) => a.zorunlu).every((a) => esleme[a.key]);

  function dosyaOkundu(okunan: OkunmusDosya, ad: string) {
    setDosya(okunan);
    setDosyaAdi(ad);
    setEsleme(otomatikEslemeOner(okunan.basliklar, HEDEF_ALANLAR));
    setSonuclar(null);
    setGenelHata(null);
    setAdim(2);
  }

  async function iceAktar() {
    if (!dosya) return;
    setGonderiliyor(true);
    setGenelHata(null);
    setSonuclar(null);

    const tumSatirlar = esitlemeyleSatirlariCevir(dosya.satirlar, esleme);
    const birikenSonuclar: ArsivSonucSatiri[] = [];
    setIlerleme({ islenen: 0, toplam: tumSatirlar.length });

    for (let i = 0; i < tumSatirlar.length; i += PARCA_BOYUTU) {
      const parca = tumSatirlar.slice(i, i + PARCA_BOYUTU);
      const sonuc = await hastalariArsivdenIceAktar(parca, i + 1);

      if (!sonuc.success) {
        setGenelHata(sonuc.message);
        break;
      }

      birikenSonuclar.push(...(sonuc.sonuclar ?? []));
      setIlerleme({ islenen: Math.min(i + PARCA_BOYUTU, tumSatirlar.length), toplam: tumSatirlar.length });
      setSonuclar([...birikenSonuclar]);
    }

    setGonderiliyor(false);
  }

  return (
    <div className="flex flex-col gap-5">
      <AdimBasliklari basliklar={ADIM_BASLIKLARI} aktifAdim={adim} />

      {adim === 1 && <DosyaSec onOkundu={dosyaOkundu} />}

      {adim === 2 && dosya && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            <strong>{dosyaAdi}</strong> — {dosya.satirlar.length} satır bulundu. Her hedef alan için kaynak dosyadaki
            karşılık gelen sütunu seçin (zorunlu olmayanları boş bırakabilirsiniz).
          </p>
          <SutunEsleme
            kaynakBasliklar={dosya.basliklar}
            hedefAlanlar={HEDEF_ALANLAR}
            esleme={esleme}
            onDegistir={(key, deger) => setEsleme((e) => ({ ...e, [key]: deger }))}
          />

          <div>
            <p className="mb-2 text-sm font-medium">Önizleme (ilk 5 satır)</p>
            <OnizlemeTablosu
              satirlar={eslenmisOnizleme}
              kolonlar={HEDEF_ALANLAR.filter((a) => esleme[a.key]).map((a) => ({
                baslik: a.label,
                render: (satir: Record<string, string>) => satir[a.key] || "—",
              }))}
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="outline" onClick={() => setAdim(1)}>
              ‹ Geri
            </Button>
            <Button type="button" disabled={!zorunluAlanlarTamam} onClick={() => setAdim(3)}>
              Devam Et ›
            </Button>
          </div>
          {!zorunluAlanlarTamam && (
            <p className="text-right text-xs text-destructive">Ad Soyad ve Telefon alanları zorunludur.</p>
          )}
        </div>
      )}

      {adim === 3 && dosya && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {dosya.satirlar.length} satır içe aktarılacak. Zaten kayıtlı (aynı kimlik numaralı) hastalar otomatik
            atlanır — bu dosyayı güvenle tekrar yükleyebilirsiniz.
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
            <Button type="button" variant="outline" onClick={() => setAdim(2)} disabled={gonderiliyor}>
              ‹ Geri
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
