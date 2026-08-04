"use client";

import { useActionState, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { RISK_TIPI_ETIKETLERI, type RiskBayragi, type RiskSeviyesi } from "@/types/hasta-detay";
import { riskBayragiEkle } from "./actions";

const RISK_TIPI_SECENEKLERI = Object.entries(RISK_TIPI_ETIKETLERI).map(([value, label]) => ({
  value,
  label,
}));

const SEVIYE_SECENEKLERI: { value: RiskSeviyesi; label: string }[] = [
  { value: "yuksek", label: "Yüksek" },
  { value: "orta", label: "Orta" },
  { value: "dusuk", label: "Düşük" },
];

const SEVIYE_TONLARI: Record<RiskSeviyesi, StatusTone> = {
  yuksek: "rose",
  orta: "amber",
  dusuk: "slate",
};

const BANT_SINIFLARI: Record<RiskSeviyesi, string> = {
  yuksek: "border-destructive/40 bg-destructive/10",
  orta: "border-amber-500/40 bg-amber-500/10",
  dusuk: "border-border bg-muted",
};

export function RiskBandi({
  hastaId,
  riskBayraklari,
  eklenebilir,
}: {
  hastaId: string;
  riskBayraklari: RiskBayragi[];
  eklenebilir: boolean;
}) {
  const [modalAcik, setModalAcik] = useState(false);
  const [formAcik, setFormAcik] = useState(false);

  /* Boş durumdaki "+ Risk bayrağı ekle" tetikleyicisi artık OzetKart'ın
     başlık kartına taşındı (görsel yeniden tasarım kararı) — o buton bu
     component'in dışa aktarılan RiskDetayModal'ını kullanıyor. Burada bayrak
     yoksa hiçbir şey render edilmiyor. */
  if (riskBayraklari.length === 0) {
    return null;
  }

  const enYuksekSeviye: RiskSeviyesi = riskBayraklari.some((r) => r.seviye === "yuksek")
    ? "yuksek"
    : riskBayraklari.some((r) => r.seviye === "orta")
      ? "orta"
      : "dusuk";

  return (
    <>
      <button
        type="button"
        onClick={() => setModalAcik(true)}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors hover:brightness-110",
          BANT_SINIFLARI[enYuksekSeviye]
        )}
      >
        <AlertTriangle
          className={cn(
            "size-5 shrink-0",
            enYuksekSeviye === "yuksek"
              ? "text-destructive"
              : enYuksekSeviye === "orta"
                ? "text-amber-600 dark:text-amber-400"
                : "text-muted-foreground"
          )}
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {riskBayraklari.map((r, i) => (
            <StatusBadge key={i} tone={SEVIYE_TONLARI[r.seviye]}>
              {RISK_TIPI_ETIKETLERI[r.tip]}
              {r.aciklama ? `: ${r.aciklama}` : ""}
            </StatusBadge>
          ))}
        </div>
      </button>

      <RiskDetayModal
        acik={modalAcik}
        onOpenChange={setModalAcik}
        hastaId={hastaId}
        riskBayraklari={riskBayraklari}
        eklenebilir={eklenebilir}
        formAcik={formAcik}
        setFormAcik={setFormAcik}
      />
    </>
  );
}

export function RiskDetayModal({
  acik,
  onOpenChange,
  hastaId,
  riskBayraklari,
  eklenebilir,
  formAcik,
  setFormAcik,
}: {
  acik: boolean;
  onOpenChange: (acik: boolean) => void;
  hastaId: string;
  riskBayraklari: RiskBayragi[];
  eklenebilir: boolean;
  formAcik: boolean;
  setFormAcik: (acik: boolean) => void;
}) {
  const ekleAction = riskBayragiEkle.bind(null, hastaId);
  const [durum, formAction, isPending] = useActionState(ekleAction, null);

  return (
    <Dialog open={acik} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Risk Bayrakları</DialogTitle>
          <DialogDescription>
            Tedavi/protokol öncesi dikkat edilmesi gereken durumlar.
          </DialogDescription>
        </DialogHeader>

        {riskBayraklari.length === 0 ? (
          <p className="text-sm text-muted-foreground">Henüz risk bayrağı yok.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {riskBayraklari.map((r, i) => (
              <li key={i} className="flex flex-col gap-1 py-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <StatusBadge tone={SEVIYE_TONLARI[r.seviye]}>{RISK_TIPI_ETIKETLERI[r.tip]}</StatusBadge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.eklenme_tarihi).toLocaleDateString("tr-TR")}
                  </span>
                </div>
                <p className="text-foreground">{r.aciklama}</p>
              </li>
            ))}
          </ul>
        )}

        {eklenebilir && (
          <div className="flex flex-col gap-3 border-t border-border pt-3">
            {!formAcik ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setFormAcik(true)} className="w-fit">
                + Risk bayrağı ekle
              </Button>
            ) : (
              <form action={formAction} className="flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="risk_tip">Tip</Label>
                    <Select name="tip" disabled={isPending} defaultValue="diger" items={RISK_TIPI_SECENEKLERI}>
                      <SelectTrigger id="risk_tip" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RISK_TIPI_SECENEKLERI.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="risk_seviye">Seviye</Label>
                    <Select name="seviye" disabled={isPending} defaultValue="orta" items={SEVIYE_SECENEKLERI}>
                      <SelectTrigger id="risk_seviye" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SEVIYE_SECENEKLERI.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="risk_aciklama">Açıklama</Label>
                  <textarea
                    id="risk_aciklama"
                    name="aciklama"
                    rows={2}
                    required
                    disabled={isPending}
                    placeholder="Örn: Lateks alerjisi, ameliyat sonrası dikkat..."
                    className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                </div>
                {durum && (
                  <p role="alert" className={cn("text-sm", durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                    {durum.message}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={isPending}>
                    {isPending ? "Ekleniyor..." : "Ekle"}
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => setFormAcik(false)}>
                    Vazgeç
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
