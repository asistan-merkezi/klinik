"use client";

import { useActionState, useState } from "react";
import { Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
  HEDEF_DURUM_ETIKETLERI,
  HEDEF_TIPI_ETIKETLERI,
  type HedefTipi,
  type HastaHedef,
} from "@/types/hasta-detay";
import { useHastaHedefler } from "./queries";
import { hastaHedefEkle } from "./actions";

const HEDEF_TIPI_SECENEKLERI = Object.entries(HEDEF_TIPI_ETIKETLERI).map(([value, label]) => ({ value, label }));

const HEDEF_DURUM_TONLARI: Record<HastaHedef["durum"], StatusTone> = {
  aktif: "primary",
  ulasildi: "emerald",
  basarisiz: "rose",
  iptal: "slate",
};

function ilerlemeOrani(hedef: HastaHedef, sonVasSkoru: number | null): number | null {
  if (hedef.baslangic_deger == null || hedef.hedef_deger == null) return null;
  if (hedef.hedef_tipi === "vas" && sonVasSkoru != null) {
    const toplamMesafe = hedef.baslangic_deger - hedef.hedef_deger;
    if (toplamMesafe === 0) return 100;
    const katEdilen = hedef.baslangic_deger - sonVasSkoru;
    return Math.max(0, Math.min(100, Math.round((katEdilen / toplamMesafe) * 100)));
  }
  return null;
}

export function HedefListesi({
  hastaId,
  sonVasSkoru,
  aktif,
  duzenlenebilir,
}: {
  hastaId: string;
  sonVasSkoru: number | null;
  aktif: boolean;
  duzenlenebilir: boolean;
}) {
  const { data: hedefler, isLoading } = useHastaHedefler(hastaId, aktif);
  const [formAcik, setFormAcik] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Tedavi Hedefleri</h3>
        {duzenlenebilir && (
          <Button type="button" size="sm" variant="outline" onClick={() => setFormAcik((v) => !v)}>
            {formAcik ? "Vazgeç" : "+ Hedef Ekle"}
          </Button>
        )}
      </div>

      {formAcik && <HedefFormu hastaId={hastaId} onKapat={() => setFormAcik(false)} />}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Yükleniyor...</p>
      ) : !hedefler || hedefler.length === 0 ? (
        <EmptyState icon={Target} title="Henüz hedef tanımlanmadı." />
      ) : (
        <ul className="flex flex-col gap-3">
          {hedefler.map((h) => {
            const oran = ilerlemeOrani(h, sonVasSkoru);
            return (
              <li key={h.id} className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{h.hedef_metrik}</span>
                  <StatusBadge tone={HEDEF_DURUM_TONLARI[h.durum]}>{HEDEF_DURUM_ETIKETLERI[h.durum]}</StatusBadge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {HEDEF_TIPI_ETIKETLERI[h.hedef_tipi]}
                  {h.baslangic_deger != null && h.hedef_deger != null && (
                    <> · {h.baslangic_deger} → {h.hedef_deger}</>
                  )}
                  {h.hedef_tarihi && <> · Hedef tarih: {new Date(h.hedef_tarihi).toLocaleDateString("tr-TR")}</>}
                </span>
                {oran != null ? (
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#00F2FE] to-[#4FACFE]" style={{ width: `${oran}%` }} />
                  </div>
                ) : (
                  h.baslangic_deger != null &&
                  h.hedef_deger != null && (
                    <p className="text-xs text-muted-foreground">
                      İlerleme bu hedef tipi için otomatik hesaplanamıyor (yalnızca VAS hedeflerinde son ölçüme göre hesaplanır).
                    </p>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function HedefFormu({ hastaId, onKapat }: { hastaId: string; onKapat: () => void }) {
  const ekleAction = hastaHedefEkle.bind(null, hastaId);
  const [durum, formAction, isPending] = useActionState(ekleAction, null);
  const [tip, setTip] = useState<HedefTipi>("vas");

  if (durum?.success) {
    onKapat();
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hedef_tipi">Hedef Tipi</Label>
          <Select
            name="hedef_tipi"
            value={tip}
            onValueChange={(v) => setTip(v as HedefTipi)}
            disabled={isPending}
            items={HEDEF_TIPI_SECENEKLERI}
          >
            <SelectTrigger id="hedef_tipi" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HEDEF_TIPI_SECENEKLERI.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hedef_tarihi">Hedef Tarihi</Label>
          <Input id="hedef_tarihi" name="hedef_tarihi" type="date" disabled={isPending} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hedef_metrik">Hedef Açıklaması</Label>
        <Input
          id="hedef_metrik"
          name="hedef_metrik"
          required
          disabled={isPending}
          placeholder={tip === "vas" ? "Örn: 4 hafta sonunda VAS ≤ 3" : "Örn: Omuz fleksiyonu ≥ 150 derece"}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="baslangic_deger">Başlangıç Değeri</Label>
          <Input id="baslangic_deger" name="baslangic_deger" type="number" step="0.1" disabled={isPending} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hedef_deger">Hedef Değer</Label>
          <Input id="hedef_deger" name="hedef_deger" type="number" step="0.1" disabled={isPending} />
        </div>
      </div>
      {durum && !durum.success && <p className="text-sm text-destructive">{durum.message}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Ekleniyor..." : "Kaydet"}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={onKapat}>
          Vazgeç
        </Button>
      </div>
    </form>
  );
}
