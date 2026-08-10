import { Wallet, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import type { PaketSatisSatir } from "@/types/odeme";
import {
  BAKIYE_HAREKET_ETIKETLERI,
  type BakiyeHareketTuru,
  type HastaBakiyeHareket,
} from "@/types/hasta-detay";
import type { HastaKategori } from "@/types/hasta";
import type { IskontoOranlariYuzde } from "@/lib/fiyat/etkin-fiyat-hesapla";
import { BakiyeHareketiEkleButonu } from "../bakiye-hareketi-formu";

const KATEGORI_ETIKETLERI: Record<HastaKategori, string> = {
  vita: "Vita",
  plus: "Plus",
  elit: "Elit",
  prime: "Prime",
};

const BAKIYE_HAREKET_TONLARI: Record<BakiyeHareketTuru, StatusTone> = {
  odeme: "emerald",
  kredi: "emerald",
  iade: "sky",
  borc: "rose",
};

const paraFormat = (tutar: number) => tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

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
}: {
  hastaId: string;
  hastaKategori: HastaKategori;
  iskontoOranlari: IskontoOranlariYuzde | null;
  guncelBakiye: number;
  duzenlenebilir: boolean;
  aktifPaketler: PaketSatisSatir[];
  bakiyeHareketleri: HastaBakiyeHareket[];
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
                    ({ hareket: h, islemAdi, terapistAdi, kategoriIskontoTutari, manuelIskontoTutari, bakiyeSonrasi }) => {
                      const tarih = new Date(h.created_at);
                      const tonu = BAKIYE_HAREKET_TONLARI[h.tur];
                      const isaret = h.tur === "borc" ? "-" : "+";

                      return (
                        <tr key={h.id} className="border-b border-border last:border-b-0 align-top">
                          <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                            {tarih.toLocaleDateString("tr-TR")}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                            {tarih.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col gap-1">
                              <span className="font-medium">{islemAdi}</span>
                              <StatusBadge tone={tonu} className="w-fit">
                                {BAKIYE_HAREKET_ETIKETLERI[h.tur]}
                              </StatusBadge>
                              {h.aciklama && (
                                <span className="text-xs text-muted-foreground">{h.aciklama}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{terapistAdi ?? "—"}</td>
                          <td
                            className={`px-3 py-2 text-right tabular-nums font-medium ${
                              h.tur === "borc" ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                            }`}
                          >
                            {isaret}
                            {paraFormat(h.tutar)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {kategoriIskontoTutari > 0 ? (
                              <div className="flex flex-col items-end">
                                <span>{paraFormat(kategoriIskontoTutari)}</span>
                                <span className="text-xs text-muted-foreground">
                                  {KATEGORI_ETIKETLERI[hastaKategori]} %{kategoriPct}
                                </span>
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {manuelIskontoTutari > 0 ? paraFormat(manuelIskontoTutari) : "—"}
                          </td>
                          <td
                            className={`px-3 py-2 text-right tabular-nums font-medium ${
                              bakiyeSonrasi < 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"
                            }`}
                          >
                            {paraFormat(bakiyeSonrasi)}
                          </td>
                        </tr>
                      );
                    }
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
