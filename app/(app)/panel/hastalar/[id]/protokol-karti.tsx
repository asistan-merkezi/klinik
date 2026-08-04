"use client";

import { useState } from "react";
import { ClipboardList } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { RISK_TIPI_ETIKETLERI, type RiskBayragi, type IslemKontrendikasyon, type HastaProtokol } from "@/types/hasta-detay";
import { useIslemTanimlari, useIslemKontrendikasyonlari, useHastaProtokoller } from "./queries";

const DURUM_ETIKETLERI: Record<HastaProtokol["durum"], string> = {
  aktif: "Aktif",
  tamamlandi: "Tamamlandı",
  iptal: "İptal",
};

const DURUM_TONLARI: Record<HastaProtokol["durum"], StatusTone> = {
  aktif: "primary",
  tamamlandi: "emerald",
  iptal: "slate",
};

export function ProtokolKarti({ hastaId, riskBayraklari, aktif }: { hastaId: string; riskBayraklari: RiskBayragi[]; aktif: boolean }) {
  const { data: protokoller, isLoading } = useHastaProtokoller(hastaId, aktif);
  const [ekleAcik, setEkleAcik] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Protokoller</h3>
        <Button type="button" size="sm" variant="outline" onClick={() => setEkleAcik(true)}>
          + Protokol Ekle
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Yükleniyor...</p>
      ) : !protokoller || protokoller.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Henüz protokol atanmadı." />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {protokoller.map((p) => (
            <li
              key={p.id}
              className="flex flex-col gap-1 rounded-lg border border-border/60 bg-card/40 p-3 text-sm backdrop-blur-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{p.islem_tanimi?.ad ?? "—"}</span>
                <StatusBadge tone={DURUM_TONLARI[p.durum]}>{DURUM_ETIKETLERI[p.durum]}</StatusBadge>
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(p.baslangic_tarihi).toLocaleDateString("tr-TR")}
                {p.uyari_onaylandi_mi && " · uyarı onaylandı"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {ekleAcik && (
        <ProtokolEkleModal hastaId={hastaId} riskBayraklari={riskBayraklari} onOpenChange={setEkleAcik} />
      )}
    </div>
  );
}

function ProtokolEkleModal({
  hastaId,
  riskBayraklari,
  onOpenChange,
}: {
  hastaId: string;
  riskBayraklari: RiskBayragi[];
  onOpenChange: (acik: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: islemler } = useIslemTanimlari(true);
  const [islemTanimiId, setIslemTanimiId] = useState<string | null>(null);
  const { data: kontrendikasyonlar } = useIslemKontrendikasyonlari(islemTanimiId);
  const [asama, setAsama] = useState<"secim" | "uyari_onay">("secim");

  const riskTipleri = new Set(riskBayraklari.map((r) => r.tip));
  const eslesenler: IslemKontrendikasyon[] = (kontrendikasyonlar ?? []).filter((k) => riskTipleri.has(k.risk_tipi));
  const blokEden = eslesenler.filter((k) => k.uyari_seviyesi === "blok");
  const uyaranlar = eslesenler.filter((k) => k.uyari_seviyesi === "uyari");

  const ekleMutasyonu = useMutation({
    mutationFn: async (uyariOnaylandiMi: boolean) => {
      const supabase = createClient();
      const { error } = await supabase.from("hasta_protokol").insert({
        hasta_id: hastaId,
        islem_tanimi_id: islemTanimiId,
        uyari_onaylandi_mi: uyariOnaylandiMi,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hasta_protokol", hastaId] });
      onOpenChange(false);
    },
  });

  function devamEt() {
    if (!islemTanimiId) return;
    if (blokEden.length > 0) return;
    if (uyaranlar.length > 0 && asama === "secim") {
      setAsama("uyari_onay");
      return;
    }
    ekleMutasyonu.mutate(uyaranlar.length > 0);
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{asama === "secim" ? "Protokol Ekle" : "Kontrendikasyon Uyarısı"}</DialogTitle>
          <DialogDescription>
            {asama === "secim"
              ? "Hastaya atanacak tedaviyi seçin; risk bayraklarıyla çakışma varsa uyarılırsınız."
              : "Aşağıdaki uyarıları onaylamadan devam edilemez."}
          </DialogDescription>
        </DialogHeader>

        {asama === "secim" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="protokol_islem">Tedavi</Label>
              <Select
                value={islemTanimiId ?? undefined}
                onValueChange={setIslemTanimiId}
                items={(islemler ?? []).map((i) => ({ value: i.id, label: i.ad }))}
              >
                <SelectTrigger id="protokol_islem" className="w-full">
                  <SelectValue placeholder="Seçin" />
                </SelectTrigger>
                <SelectContent>
                  {(islemler ?? []).map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.ad}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {blokEden.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <span className="font-semibold">Bu protokol eklenemez</span>
                {blokEden.map((k) => (
                  <p key={k.id}>
                    {RISK_TIPI_ETIKETLERI[k.risk_tipi]}: {k.mesaj}
                  </p>
                ))}
              </div>
            )}

            {blokEden.length === 0 && uyaranlar.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                <span className="font-semibold">Dikkat</span>
                {uyaranlar.map((k) => (
                  <p key={k.id}>
                    {RISK_TIPI_ETIKETLERI[k.risk_tipi]}: {k.mesaj}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {asama === "uyari_onay" && (
          <div className="flex flex-col gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            {uyaranlar.map((k) => (
              <p key={k.id}>
                {RISK_TIPI_ETIKETLERI[k.risk_tipi]}: {k.mesaj}
              </p>
            ))}
          </div>
        )}

        {ekleMutasyonu.isError && <p className="text-sm text-destructive">Eklenemedi, lütfen tekrar deneyin.</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button
            type="button"
            disabled={!islemTanimiId || blokEden.length > 0 || ekleMutasyonu.isPending}
            onClick={devamEt}
          >
            {ekleMutasyonu.isPending
              ? "Ekleniyor..."
              : asama === "uyari_onay"
                ? "Onaylıyorum, ekle"
                : "Devam Et"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
