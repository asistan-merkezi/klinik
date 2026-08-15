"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate, formatTime } from "@/lib/datetime";
import { RANDEVU_DURUM_ETIKETLERI, RANDEVU_DURUM_TONLARI, type RandevuDurumu } from "@/types/hasta-detay";
import type { PaketSatisSatir } from "@/types/odeme";

type PaketKullanimSatir = {
  id: string;
  baslangic: string;
  durum: RandevuDurumu;
  gecikme_dakika: number | null;
  terapist: { personel: { ad_soyad: string } | null } | null;
};

export function AktifPaketSatiri({ paketSatis }: { paketSatis: PaketSatisSatir }) {
  const [acik, setAcik] = useState(false);
  const toplam = paketSatis.paket?.seans_sayisi ?? 0;
  const kullanilan = Math.max(toplam - paketSatis.kalan_adet, 0);
  const baslamaTarihi = new Date(paketSatis.satis_tarihi).toLocaleDateString("tr-TR");

  return (
    <>
      <li
        className="flex cursor-pointer flex-col gap-1 py-3 text-sm hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
        onClick={() => setAcik(true)}
      >
        <div className="flex flex-col">
          <span className="font-medium">{paketSatis.paket?.ad ?? "—"}</span>
          <span className="text-xs text-muted-foreground">
            Başlama {baslamaTarihi} · {toplam} seans
          </span>
        </div>
        <span className="text-muted-foreground">
          {kullanilan} kullanıldı · {paketSatis.kalan_adet} kaldı
        </span>
      </li>

      <PaketKullanimDialog acik={acik} onOpenChange={setAcik} paketSatis={paketSatis} toplam={toplam} />
    </>
  );
}

// Bir randevu'nun paket_satis_id'si sadece o seans check-in anında (geldi/
// gecikmeli_geldi) doldurulur (bkz. randevu_gelis_isaretle RPC) ve sonradan
// randevu iptal/ertelenmiş olsa bile GERİ ALINMAZ (append-only ledger
// felsefesi) — yani paket_satis_id = X sorgusu, bu paketten fiilen düşülen
// TÜM geliş geçmişini (durumu ne olursa olsun) doğru şekilde verir.
function usePaketKullanimi(paketSatisId: string, aktif: boolean) {
  return useQuery({
    queryKey: ["paket_kullanimi", paketSatisId],
    enabled: aktif,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("randevu")
        .select("id, baslangic, durum, gecikme_dakika, terapist(personel(ad_soyad))")
        .eq("paket_satis_id", paketSatisId)
        .order("baslangic", { ascending: true })
        .returns<PaketKullanimSatir[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

function PaketKullanimDialog({
  acik,
  onOpenChange,
  paketSatis,
  toplam,
}: {
  acik: boolean;
  onOpenChange: (acik: boolean) => void;
  paketSatis: PaketSatisSatir;
  toplam: number;
}) {
  const sorgu = usePaketKullanimi(paketSatis.id, acik);
  const kullanimlar = sorgu.data ?? [];

  return (
    <Dialog open={acik} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{paketSatis.paket?.ad ?? "Paket"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <span className="text-muted-foreground">Paket başlangıç tarihi</span>
            <span className="font-medium">{formatDate(paketSatis.satis_tarihi)}</span>
          </div>

          {sorgu.isLoading && <p className="text-sm text-muted-foreground">Yükleniyor...</p>}
          {!sorgu.isLoading && kullanimlar.length === 0 && (
            <EmptyState icon={Package} title="Bu paketten henüz seans kullanılmadı." compact />
          )}
          {kullanimlar.length > 0 && (
            <div className="max-h-96 overflow-y-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="sticky top-0 border-b border-border bg-card text-xs text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Tarih</th>
                    <th className="px-3 py-2 text-left font-medium">Saat</th>
                    <th className="px-3 py-2 text-left font-medium">Durum</th>
                    <th className="px-3 py-2 text-right font-medium">Kalan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {kullanimlar.map((k, index) => {
                    const kalanSonrasi = Math.max(toplam - (index + 1), 0);
                    return (
                      <tr key={k.id}>
                        <td className="px-3 py-2 whitespace-nowrap">{formatDate(k.baslangic)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{formatTime(k.baslangic)}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-0.5">
                            <StatusBadge tone={RANDEVU_DURUM_TONLARI[k.durum]} className="w-fit">
                              {RANDEVU_DURUM_ETIKETLERI[k.durum]}
                              {k.durum === "gecikmeli_geldi" && k.gecikme_dakika != null
                                ? ` (${k.gecikme_dakika} dk)`
                                : ""}
                            </StatusBadge>
                            {k.terapist?.personel?.ad_soyad && (
                              <span className="text-xs text-muted-foreground">{k.terapist.personel.ad_soyad}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {kalanSonrasi}/{toplam}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
