"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { PaketSatir } from "@/types/paket";
import { paketKatilimcilariGetir } from "./actions";
import { PaketSatisDialog } from "./paket-satis-dialog";

const DURUM_ETIKETLERI: Record<string, string> = {
  aktif: "Aktif",
  bitti: "Bitti",
  dondu: "Donduruldu",
  iptal: "İptal",
};

export function PaketKatilimcilarDialog({ paket, className }: { paket: PaketSatir; className?: string }) {
  const [acik, setAcik] = useState(false);
  const sorgu = useQuery({
    queryKey: ["paket-katilimcilar", paket.id],
    queryFn: () => paketKatilimcilariGetir(paket.id),
    enabled: acik,
  });

  const katilimcilar = sorgu.data ?? [];
  const aktifKatilimciSayisi = new Set(
    katilimcilar.filter((k) => k.durum === "aktif").map((k) => k.hasta_id)
  ).size;

  return (
    <>
      <Button type="button" size="sm" variant="outline" className={cn(className)} onClick={() => setAcik(true)}>
        <Users />
        Katılımcılar
      </Button>

      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Katılımcılar: {paket.ad}
              {paket.kisi_kotasi != null && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({aktifKatilimciSayisi}/{paket.kisi_kotasi})
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {sorgu.isLoading && <p className="text-sm text-muted-foreground">Yükleniyor...</p>}
          {!sorgu.isLoading && katilimcilar.length === 0 && (
            <p className="text-sm text-muted-foreground">Bu paketi satın alan hasta yok.</p>
          )}
          {katilimcilar.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-1.5 pr-2 font-medium">Ad Soyad</th>
                    <th className="py-1.5 pr-2 font-medium">Paket Sayısı</th>
                    <th className="py-1.5 pr-2 font-medium">Kalan Paket</th>
                    <th className="py-1.5 pr-2 font-medium">Durum</th>
                    <th className="py-1.5 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {katilimcilar.map((k) => (
                    <tr key={k.paket_satis_id}>
                      <td className="py-1.5 pr-2">{k.ad_soyad}</td>
                      <td className="py-1.5 pr-2 tabular-nums">{paket.seans_sayisi}</td>
                      <td className="py-1.5 pr-2 tabular-nums">{k.kalan_adet}</td>
                      <td className="py-1.5 pr-2 text-muted-foreground">
                        {DURUM_ETIKETLERI[k.durum] ?? k.durum}
                      </td>
                      <td className="py-1.5 text-right">
                        <PaketSatisDialog
                          paket={paket}
                          varsayilanHasta={{ id: k.hasta_id, ad: k.ad_soyad, kategori: k.kategori }}
                          mod="yenile"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
