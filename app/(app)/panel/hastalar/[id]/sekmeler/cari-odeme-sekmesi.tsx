import { Wallet, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PdfIndirButonu } from "@/components/panel/pdf-indir-butonu";
import type { HastaBakiyeHareket } from "@/types/hasta-detay";
import type { PaketSatisSatir } from "@/types/odeme";
import type { HastaKategori } from "@/types/hasta";
import type { IskontoOranlariYuzde } from "@/lib/fiyat/etkin-fiyat-hesapla";
import type { FaturaBilgisiKontrol } from "@/lib/fatura/eksik-bilgi";
import { hareketleriGorunumeCevir } from "@/lib/hasta/bakiye-hareket-gorunum";
import { BakiyeHareketiEkleButonu } from "../bakiye-hareketi-formu";
import { BakiyeHareketSatiri } from "../bakiye-hareket-satiri";

const KATEGORI_ETIKETLERI: Record<HastaKategori, string> = {
  vita: "Vita",
  plus: "Plus",
  elit: "Elit",
  prime: "Prime",
};

function kategoriYuzdesi(kategori: HastaKategori, oranlar: IskontoOranlariYuzde | null): number {
  if (kategori === "vita") return 0;
  if (kategori === "plus") return oranlar?.plus_pct ?? 0;
  if (kategori === "elit") return oranlar?.elit_pct ?? 0;
  return oranlar?.prime_pct ?? 0;
}

function dosyaAdiGuvenliYap(metin: string): string {
  return metin
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function CariOdemeSekmesi({
  hastaId,
  hastaAdSoyad,
  hastaKategori,
  iskontoOranlari,
  guncelBakiye,
  duzenlenebilir,
  aktifPaketler,
  bakiyeHareketleri,
  faturaBilgisi,
}: {
  hastaId: string;
  hastaAdSoyad: string;
  hastaKategori: HastaKategori;
  iskontoOranlari: IskontoOranlariYuzde | null;
  guncelBakiye: number;
  duzenlenebilir: boolean;
  aktifPaketler: PaketSatisSatir[];
  bakiyeHareketleri: HastaBakiyeHareket[];
  faturaBilgisi: FaturaBilgisiKontrol;
}) {
  const kategoriPct = kategoriYuzdesi(hastaKategori, iskontoOranlari);
  const hareketGorunumleri = hareketleriGorunumeCevir(bakiyeHareketleri, guncelBakiye);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Bakiye Hareketleri</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {duzenlenebilir && <BakiyeHareketiEkleButonu hastaId={hastaId} />}
            <PdfIndirButonu
              endpoint={`/api/hasta-cari-hareketler/pdf?hastaId=${hastaId}`}
              dosyaAdi={`cari-hareketler-${dosyaAdiGuvenliYap(hastaAdSoyad)}.pdf`}
              etiket="PDF İndir"
              variant="outline"
              size="sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          {hareketGorunumleri.length === 0 ? (
            <EmptyState icon={Wallet} title="Hareket yok." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Tarih</th>
                    <th className="px-3 py-2 text-left font-medium">Saat</th>
                    <th className="px-3 py-2 text-left font-medium">İşlem Türü</th>
                    <th className="px-3 py-2 text-left font-medium">Terapist</th>
                    <th className="px-3 py-2 text-right font-medium">Tutar</th>
                    <th className="px-3 py-2 text-right font-medium">Kategori İskonto</th>
                    <th className="px-3 py-2 text-right font-medium">İskonto</th>
                    <th className="px-3 py-2 text-right font-medium">Bakiye</th>
                  </tr>
                </thead>
                <tbody>
                  {hareketGorunumleri.map((satir) => (
                    <BakiyeHareketSatiri
                      key={satir.hareket.id}
                      hastaId={hastaId}
                      satir={satir}
                      kategoriEtiketi={KATEGORI_ETIKETLERI[hastaKategori]}
                      kategoriPct={kategoriPct}
                      duzenlenebilir={duzenlenebilir}
                      faturaBilgisi={faturaBilgisi}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Aktif Paketler</CardTitle>
        </CardHeader>
        <CardContent>
          {aktifPaketler.length === 0 ? (
            <EmptyState icon={Package} title="Aktif paketi yok." />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {aktifPaketler.map((ps) => (
                <li key={ps.id} className="flex items-center justify-between py-3 text-sm">
                  <span className="font-medium">{ps.paket?.ad ?? "—"}</span>
                  <span className="text-muted-foreground">
                    {ps.kalan_adet}/{ps.paket?.seans_sayisi ?? "?"} hak kaldı · son kullanım{" "}
                    {new Date(ps.gecerlilik_bitis_tarihi).toLocaleDateString("tr-TR")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
