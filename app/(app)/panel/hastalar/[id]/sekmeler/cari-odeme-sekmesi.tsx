import { Wallet, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { BAKIYE_HAREKET_ETIKETLERI, type HastaBakiyeHareket } from "@/types/hasta-detay";
import type { PaketSatisSatir } from "@/types/odeme";
import type { HastaKategori } from "@/types/hasta";
import type { IskontoOranlariYuzde } from "@/lib/fiyat/etkin-fiyat-hesapla";
import type { FaturaBilgisiKontrol } from "@/lib/fatura/eksik-bilgi";
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

type HareketGorunum = {
  hareket: HastaBakiyeHareket;
  islemAdi: string;
  terapistAdi: string | null;
  kategoriIskontoTutari: number;
  manuelIskontoTutari: number;
  bakiyeSonrasi: number;
};

// hareketler created_at DESC (en yeni ilk) sırayla geliyor — kümülatif bakiye
// güncelBakiye'den (o anki gerçek toplam) geriye doğru hesaplanıyor, ki sadece
// son 30 hareket çekilse bile (limit) rakamlar doğru kalsın. Bakiye etkisi
// v_hasta_ozet ile aynı kural: kredi +, borç −, ödeme/iade bakiyeyi değiştirmez
// (ödeme zaten tahsilatın audit-trail kaydı, borç/kredi cari hesabı oluşturur).
function hareketleriGorunumeCevir(
  hareketler: HastaBakiyeHareket[],
  guncelBakiye: number
): HareketGorunum[] {
  let bakiye = guncelBakiye;
  const sonuc: HareketGorunum[] = [];

  for (const h of hareketler) {
    const bakiyeSonrasi = bakiye;
    const etki = h.tur === "kredi" ? h.tutar : h.tur === "borc" ? -h.tutar : 0;
    bakiye -= etki;

    let islemAdi = BAKIYE_HAREKET_ETIKETLERI[h.tur];
    let terapistAdi: string | null = null;
    let kategoriIskontoTutari = 0;
    let manuelIskontoTutari = 0;

    if (h.randevu) {
      islemAdi = h.randevu.islem_tanimi?.ad ?? islemAdi;
      terapistAdi = h.randevu.terapist?.personel?.ad_soyad ?? null;
      if (h.randevu.islem_tanimi) {
        kategoriIskontoTutari = Math.max(0, h.randevu.islem_tanimi.vita_fiyat - h.tutar);
      }
    } else if (h.odeme) {
      const adlar = h.odeme.odeme_kalemi.map((k) => k.islem_tanimi?.ad ?? k.paket_satis?.paket?.ad ?? "—");
      if (adlar.length > 0) islemAdi = adlar.join(", ");
      kategoriIskontoTutari = h.odeme.odeme_kalemi.reduce((acc, k) => {
        if (!k.islem_tanimi) return acc;
        return acc + Math.max(0, (k.islem_tanimi.vita_fiyat - k.birim_fiyat) * k.miktar);
      }, 0);
      manuelIskontoTutari = h.odeme.iskonto_tutari;
    }

    sonuc.push({ hareket: h, islemAdi, terapistAdi, kategoriIskontoTutari, manuelIskontoTutari, bakiyeSonrasi });
  }

  return sonuc;
}

export function CariOdemeSekmesi({
  hastaId,
  hastaKategori,
  iskontoOranlari,
  guncelBakiye,
  duzenlenebilir,
  aktifPaketler,
  bakiyeHareketleri,
  faturaBilgisi,
}: {
  hastaId: string;
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
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Bakiye Hareketleri</CardTitle>
          {duzenlenebilir && <BakiyeHareketiEkleButonu hastaId={hastaId} />}
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
                  {hareketGorunumleri.map(
                    ({ hareket, islemAdi, terapistAdi, kategoriIskontoTutari, manuelIskontoTutari, bakiyeSonrasi }) => (
                      <BakiyeHareketSatiri
                        key={hareket.id}
                        hastaId={hastaId}
                        hareket={hareket}
                        islemAdi={islemAdi}
                        terapistAdi={terapistAdi}
                        kategoriIskontoTutari={kategoriIskontoTutari}
                        manuelIskontoTutari={manuelIskontoTutari}
                        bakiyeSonrasi={bakiyeSonrasi}
                        kategoriEtiketi={KATEGORI_ETIKETLERI[hastaKategori]}
                        kategoriPct={kategoriPct}
                        duzenlenebilir={duzenlenebilir}
                        faturaBilgisi={faturaBilgisi}
                      />
                    )
                  )}
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
