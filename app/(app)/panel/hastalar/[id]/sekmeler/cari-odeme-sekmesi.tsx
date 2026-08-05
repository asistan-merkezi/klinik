import { Wallet, Package, Receipt } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { SatilabilirUrun, PaketSatisSatir, OdemeGecmisSatir } from "@/types/odeme";
import { YONTEM_ETIKETLERI } from "@/types/odeme";
import { BAKIYE_HAREKET_ETIKETLERI, type HastaBakiyeHareket } from "@/types/hasta-detay";
import type { HastaKategori } from "@/types/hasta";
import { OdemeFormu } from "../odeme-formu";
import { FaturaDurum } from "../fatura-durum";

const KATEGORI_ETIKETLERI: Record<HastaKategori, string> = {
  vita: "Vita",
  plus: "Plus",
  elit: "Elit",
  prime: "Prime",
};

export function CariOdemeSekmesi({
  hastaId,
  hastaKategori,
  duzenlenebilir,
  aktifPaketler,
  satilabilirUrunler,
  odemeGecmisi,
  bakiyeHareketleri,
}: {
  hastaId: string;
  hastaKategori: HastaKategori;
  duzenlenebilir: boolean;
  aktifPaketler: PaketSatisSatir[];
  satilabilirUrunler: SatilabilirUrun[];
  odemeGecmisi: OdemeGecmisSatir[];
  bakiyeHareketleri: HastaBakiyeHareket[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Bakiye Hareketleri</CardTitle>
        </CardHeader>
        <CardContent>
          {bakiyeHareketleri.length === 0 ? (
            <EmptyState icon={Wallet} title="Hareket yok." />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {bakiyeHareketleri.map((h) => (
                <li key={h.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div className="flex flex-col">
                    <span className="font-medium">{BAKIYE_HAREKET_ETIKETLERI[h.tur]}</span>
                    <span className="text-xs text-muted-foreground">{h.aciklama ?? "—"}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span>{h.tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(h.created_at).toLocaleDateString("tr-TR")}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
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

      {duzenlenebilir && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Ödeme Al
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                Kategori: {KATEGORI_ETIKETLERI[hastaKategori]}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <OdemeFormu hastaId={hastaId} urunler={satilabilirUrunler} />
            <p className="mt-3 text-xs text-muted-foreground">Taksitli ödeme takibi henüz eklenmedi.</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Ödeme Geçmişi</CardTitle>
        </CardHeader>
        <CardContent>
          {odemeGecmisi.length === 0 ? (
            <EmptyState icon={Receipt} title="Henüz ödeme yok." />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {odemeGecmisi.map((odeme) => {
                const kalemAdlari = odeme.odeme_kalemi
                  .map((k) => k.islem_tanimi?.ad ?? k.paket_satis?.paket?.ad ?? "—")
                  .join(", ");
                const toplam = odeme.odeme_satiri.reduce((acc, s) => acc + s.tutar, 0);
                const yontemler = odeme.odeme_satiri
                  .map((s) => YONTEM_ETIKETLERI[s.yontem] ?? s.yontem)
                  .join(" + ");

                return (
                  <li key={odeme.id} className="flex flex-col gap-1 py-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{kalemAdlari}</span>
                      <span>{toplam.toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(odeme.created_at).toLocaleString("tr-TR")} · {yontemler || "—"} ·{" "}
                      {odeme.faturali ? "Faturalı" : "Faturasız"}
                      {odeme.iskonto_tutari > 0 &&
                        ` · İskonto ${odeme.iskonto_tutari.toLocaleString("tr-TR", {
                          style: "currency",
                          currency: "TRY",
                        })}`}
                    </span>
                    {odeme.fatura.length > 0 && <FaturaDurum fatura={odeme.fatura[0]} />}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
