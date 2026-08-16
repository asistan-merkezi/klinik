"use client";

import { useState, useTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { IZIN_DURUM_ETIKETLERI, IZIN_DURUM_TONLARI, IZIN_TIP_ETIKETLERI, type IzinCakisan, type IzinTalebiAdminSatir } from "@/types/izin";
import { izinTalebiOnayla, izinTalebiReddet, izinTalebiYoneticiIptalEt } from "./actions";

function useCakisanlar(talepId: string, etkin: boolean) {
  return useQuery({
    queryKey: ["izin_cakisanlari", talepId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("personel_izin_cakisanlari_getir", { p_talep_id: talepId });
      if (error) throw error;
      return (data ?? []) as IzinCakisan[];
    },
    enabled: etkin,
    staleTime: 30_000,
  });
}

export function TalepSatiri({ talep }: { talep: IzinTalebiAdminSatir }) {
  const [isPending, startTransition] = useTransition();
  const [hata, setHata] = useState<string | null>(null);
  const [redDialogAcik, setRedDialogAcik] = useState(false);
  const [redGerekce, setRedGerekce] = useState("");

  const beklemede = talep.durum === "beklemede";
  const gelecekOnaylandi = talep.durum === "onaylandi" && talep.baslangic_tarih > new Date().toISOString().slice(0, 10);
  const { data: cakisanlar } = useCakisanlar(talep.id, beklemede);

  function onayla() {
    setHata(null);
    startTransition(async () => {
      const sonuc = await izinTalebiOnayla(talep.id);
      if (sonuc && !sonuc.success) setHata(sonuc.message);
    });
  }

  function reddet() {
    setHata(null);
    startTransition(async () => {
      const sonuc = await izinTalebiReddet(talep.id, redGerekce);
      if (sonuc && !sonuc.success) {
        setHata(sonuc.message);
      } else {
        setRedDialogAcik(false);
        setRedGerekce("");
      }
    });
  }

  function yoneticiIptal() {
    setHata(null);
    startTransition(async () => {
      const sonuc = await izinTalebiYoneticiIptalEt(talep.id);
      if (sonuc && !sonuc.success) setHata(sonuc.message);
    });
  }

  return (
    <li>
      <Card className="flex-col gap-1.5 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium">
            {talep.personel?.ad_soyad ?? "—"} <span className="font-normal text-muted-foreground">· {talep.personel?.gorev}</span>
          </span>
          <StatusBadge tone={IZIN_DURUM_TONLARI[talep.durum]}>{IZIN_DURUM_ETIKETLERI[talep.durum]}</StatusBadge>
        </div>
        <span className="text-sm text-muted-foreground">
          {IZIN_TIP_ETIKETLERI[talep.tip]} · {formatDate(talep.baslangic_tarih)} – {formatDate(talep.bitis_tarih)} · {talep.gun_sayisi} gün
        </span>
        {talep.gerekce && <span className="text-sm">{talep.gerekce}</span>}
        {talep.belge_url && <span className="text-xs text-muted-foreground">Belge yüklendi</span>}
        {talep.durum === "reddedildi" && talep.red_gerekce && (
          <span className="text-sm text-rose-600 dark:text-rose-400">Red gerekçesi: {talep.red_gerekce}</span>
        )}
        {talep.durum !== "beklemede" && talep.degerlendirme_tarihi && (
          <span className="text-xs text-muted-foreground">Değerlendirme: {formatDateTime(talep.degerlendirme_tarihi)}</span>
        )}

        {beklemede && cakisanlar && cakisanlar.length > 0 && (
          <div className="flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              Aynı tarihlerde izinli: {cakisanlar.map((c) => `${c.ad_soyad} (${formatDate(c.baslangic_tarih)}–${formatDate(c.bitis_tarih)})`).join(", ")}
            </span>
          </div>
        )}

        {beklemede && (
          <div className="mt-1 flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isPending}
              className="bg-emerald-500 text-white hover:bg-emerald-600 dark:hover:bg-emerald-600"
              onClick={onayla}
            >
              Onayla
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => setRedDialogAcik(true)}>
              Reddet
            </Button>
          </div>
        )}

        {gelecekOnaylandi && (
          <div className="mt-1">
            <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={yoneticiIptal}>
              {isPending ? "İptal ediliyor..." : "İzni İptal Et"}
            </Button>
          </div>
        )}

        {hata && (
          <p role="alert" className="text-sm text-destructive">
            {hata}
          </p>
        )}
      </Card>

      <Dialog open={redDialogAcik} onOpenChange={setRedDialogAcik}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Talebi Reddet</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <textarea
              value={redGerekce}
              onChange={(e) => setRedGerekce(e.target.value)}
              rows={3}
              placeholder="Red gerekçesi (zorunlu)"
              disabled={isPending}
              className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            {hata && (
              <p role="alert" className="text-sm text-destructive">
                {hata}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => setRedDialogAcik(false)}>
                Vazgeç
              </Button>
              <Button type="button" size="sm" variant="destructive" disabled={isPending || !redGerekce.trim()} onClick={reddet}>
                {isPending ? "Reddediliyor..." : "Reddet"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </li>
  );
}
