import { Lock } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatTime } from "@/lib/datetime";
import {
  aySatirOzetiHesapla,
  dakikaEtiket,
  gunEtiket,
  saatEtiket,
  saatKisalt,
} from "@/lib/puantaj";
import {
  FM_ONAY_DURUM_ETIKETLERI,
  FM_ONAY_DURUM_TONLARI,
  PUANTAJ_DURUM_SECENEKLERI,
  PUANTAJ_DURUM_TONLARI,
  type PersonelPuantajDonem,
  type PuantajGunSatiri,
} from "@/types/puantaj";
import { GunDuzenleDialog } from "./gun-duzenle-dialog";
import { FmOnayButonlari } from "./fm-onay-butonlari";
import { DonemKapatButonu, DonemYenidenAcButonu } from "./donem-kapat-butonu";

const DURUM_ETIKET = Object.fromEntries(PUANTAJ_DURUM_SECENEKLERI.map((s) => [s.value, s.label]));

export function AylikTablo({
  personelId,
  yil,
  ay,
  ayEtiket,
  gunler,
  donem,
  yonetici,
}: {
  personelId: string;
  yil: number;
  ay: number;
  ayEtiket: string;
  gunler: PuantajGunSatiri[];
  donem: PersonelPuantajDonem | null;
  yonetici: boolean;
}) {
  const kapali = donem?.durum === "kapali";
  const ozet = aySatirOzetiHesapla(gunler.map((g) => g.kayit).filter((k): k is NonNullable<typeof k> => k != null));
  const ortalamaGunlukDakika = ozet.calismaGunSayisi > 0 ? Math.round(ozet.netDakika / ozet.calismaGunSayisi) : 0;

  return (
    <div className="flex flex-col gap-4">
      {kapali && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          <span className="flex items-center gap-2 text-muted-foreground">
            <Lock className="size-4" /> Bu dönem kapalı
            {donem?.kapatma_tarihi && ` — ${new Date(donem.kapatma_tarihi).toLocaleDateString("tr-TR")} tarihinde kapatıldı`}
          </span>
          {yonetici && <DonemYenidenAcButonu personelId={personelId} yil={yil} ay={ay} />}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <OzetKutusu etiket="Net Saat" deger={`${saatEtiket(ozet.netDakika / 60)} sa`} />
        <OzetKutusu etiket="Onaylı FM" deger={`${saatEtiket(ozet.onayliFmDakika / 60)} sa`} />
        <OzetKutusu
          etiket="Onay Bekleyen FM"
          deger={`${saatEtiket(ozet.bekleyenFmDakika / 60)} sa`}
          ton={ozet.bekleyenFmDakika > 0 ? "amber" : undefined}
        />
        <OzetKutusu etiket="Eksik Saat" deger={`${saatEtiket(ozet.eksikDakika / 60)} sa`} />
        <OzetKutusu etiket="İzin Günü" deger={String(ozet.izinGun)} />
        <OzetKutusu etiket="Ort. Günlük Süre" deger={dakikaEtiket(ortalamaGunlukDakika)} />
      </div>

      {yonetici && !kapali && (
        <div className="flex justify-end">
          <DonemKapatButonu personelId={personelId} yil={yil} ay={ay} ayEtiket={ayEtiket} ozet={ozet} />
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Tarih</th>
              <th className="px-2 py-2 text-left font-medium">Planlanan</th>
              <th className="px-2 py-2 text-left font-medium">Giriş–Çıkış</th>
              <th className="px-2 py-2 text-right font-medium">Mola</th>
              <th className="px-2 py-2 text-right font-medium">Net</th>
              <th className="px-2 py-2 text-right font-medium">Sapma</th>
              <th className="px-2 py-2 text-left font-medium">Durum</th>
              <th className="px-2 py-2 text-left font-medium">FM Onay</th>
              <th className="px-2 py-2 text-left font-medium">Not</th>
              {yonetici && <th className="px-3 py-2 text-right font-medium">İşlem</th>}
            </tr>
          </thead>
          <tbody>
            {gunler.map((g) => {
              const k = g.kayit;
              const planlanan = k
                ? k.planlanan_baslangic && k.planlanan_bitis
                  ? { baslangic: k.planlanan_baslangic, bitis: k.planlanan_bitis }
                  : null
                : g.sanalPlanlanan;
              const sapma = k?.sapma_dakika ?? null;
              return (
                <tr key={g.tarih} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 whitespace-nowrap">{gunEtiket(g.tarih)}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                    {planlanan ? `${saatKisalt(planlanan.baslangic)}–${saatKisalt(planlanan.bitis)}` : "—"}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {k?.giris_saat ? formatTime(k.giris_saat) : "—"}
                    {" – "}
                    {k?.cikis_saat ? formatTime(k.cikis_saat) : "—"}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{k ? `${k.mola_dakika}dk` : "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{dakikaEtiket(k?.net_calisma_dakika)}</td>
                  <td
                    className={`px-2 py-2 text-right tabular-nums ${
                      sapma != null && sapma > 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : sapma != null && sapma < 0
                          ? "text-rose-600 dark:text-rose-400"
                          : ""
                    }`}
                  >
                    {sapma == null ? "—" : `${sapma > 0 ? "+" : ""}${dakikaEtiket(sapma)}`}
                  </td>
                  <td className="px-2 py-2">
                    {k ? <StatusBadge tone={PUANTAJ_DURUM_TONLARI[k.durum]}>{DURUM_ETIKET[k.durum]}</StatusBadge> : "—"}
                  </td>
                  <td className="px-2 py-2">
                    {k && k.fazla_mesai_dakika != null && k.fazla_mesai_dakika > 0 ? (
                      yonetici && k.fm_onay_durumu === "bekliyor" && !kapali ? (
                        <FmOnayButonlari personelId={personelId} puantajId={k.id} />
                      ) : (
                        <StatusBadge tone={FM_ONAY_DURUM_TONLARI[k.fm_onay_durumu]}>
                          {FM_ONAY_DURUM_ETIKETLERI[k.fm_onay_durumu]} · {dakikaEtiket(k.fazla_mesai_dakika)}
                        </StatusBadge>
                      )
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="max-w-[160px] truncate px-2 py-2 text-muted-foreground" title={k?.not_metni ?? undefined}>
                    {k?.not_metni ?? "—"}
                  </td>
                  {yonetici && (
                    <td className="px-3 py-2 text-right">
                      {!kapali && <GunDuzenleDialog personelId={personelId} tarih={g.tarih} kayit={k} planlanan={planlanan} />}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OzetKutusu({ etiket, deger, ton }: { etiket: string; deger: string; ton?: "amber" }) {
  return (
    <div className="rounded-xl border border-border bg-card/70 p-3">
      <p className="text-xs text-muted-foreground">{etiket}</p>
      <p className={`text-lg font-semibold tabular-nums ${ton === "amber" ? "text-amber-600 dark:text-amber-400" : ""}`}>
        {deger}
      </p>
    </div>
  );
}
