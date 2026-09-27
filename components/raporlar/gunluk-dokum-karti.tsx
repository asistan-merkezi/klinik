"use client";

import { useState } from "react";
import { CalendarDays, ChevronDown, Receipt, Wallet, Landmark, CalendarClock, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { RANDEVU_DURUM_ETIKETLERI, RANDEVU_DURUM_TONLARI, type RandevuDurumu } from "@/types/hasta-detay";
import type { GunlukIsKalemi, GunlukOzet } from "@/types/raporlar";

const paraFormat = (tutar: number) => tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

/**
 * `tarih` burada her zaman saf "YYYY-MM-DD" (bkz. hesaplaGunlukDokum,
 * formatDateForInput ile İstanbul takvim gününe zaten normalize edilmiş) —
 * ledger-view.tsx'teki aynı sebeple `new Date(tarih)` yerine bileşenlerden
 * yerel Date kuruluyor (weekday adı için), UTC ayrıştırma riskine girilmiyor.
 */
function gunEtiketi(tarih: string): string {
  const [yil, ay, gun] = tarih.split("-").map(Number);
  const tarihNesnesi = new Date(yil, ay - 1, gun);
  const gunAdi = tarihNesnesi.toLocaleDateString("tr-TR", { weekday: "long" });
  return `${String(gun).padStart(2, "0")}.${String(ay).padStart(2, "0")}.${yil} — ${gunAdi}`;
}

const KALEM_IKONU: Record<GunlukIsKalemi["tur"], LucideIcon> = {
  randevu: CalendarClock,
  gelir: Wallet,
  gider: Receipt,
  muhasebe: Landmark,
};

function KalemSatiri({ kalem }: { kalem: GunlukIsKalemi }) {
  const Icon = KALEM_IKONU[kalem.tur];
  return (
    <div className="flex items-center gap-2.5 text-xs">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="w-11 shrink-0 text-muted-foreground tabular-nums">{kalem.saat ?? ""}</span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-foreground">{kalem.baslik}</span>
        {kalem.altBaslik && <span className="truncate text-muted-foreground">{kalem.altBaslik}</span>}
        {kalem.bakiye !== undefined && (
          <span
            className={cn(
              "truncate",
              kalem.bakiye > 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"
            )}
          >
            Bakiye: {paraFormat(kalem.bakiye)}
          </span>
        )}
      </div>
      {kalem.durum && (
        <StatusBadge tone={RANDEVU_DURUM_TONLARI[kalem.durum as RandevuDurumu] ?? "slate"} className="shrink-0">
          {RANDEVU_DURUM_ETIKETLERI[kalem.durum as RandevuDurumu] ?? kalem.durum}
        </StatusBadge>
      )}
      {kalem.yon !== "notr" && (
        <span
          className={cn(
            "shrink-0 tabular-nums",
            kalem.yon === "gelir" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
          )}
        >
          {kalem.yon === "gelir" ? "+" : "−"}
          {paraFormat(kalem.tutar)}
        </span>
      )}
    </div>
  );
}

/** Bir güne ait kalemlerin düz listesi — hem GunlukDokumKarti'nin açılan satırında hem de Günlük görünümün İş Dökümü kartında kullanılır. */
export function KalemListesi({ kalemler }: { kalemler: GunlukIsKalemi[] }) {
  if (kalemler.length === 0) {
    return <EmptyState icon={CalendarDays} title="Bu günde kayıtlı işlem yok." compact />;
  }
  return (
    <div className="flex flex-col gap-2">
      {kalemler.map((kalem) => (
        <KalemSatiri key={kalem.id} kalem={kalem} />
      ))}
    </div>
  );
}

export function GunlukDokumKarti({ gunler }: { gunler: GunlukOzet[] }) {
  const [acikGun, setAcikGun] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Günlük Döküm</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {gunler.length === 0 ? (
          <EmptyState icon={CalendarDays} title="Bu ayda kayıtlı işlem yok." compact />
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {gunler.map((gun) => {
              const acik = acikGun === gun.tarih;
              return (
                <div key={gun.tarih}>
                  <button
                    type="button"
                    onClick={() => setAcikGun(acik ? null : gun.tarih)}
                    className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-muted/40"
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <ChevronDown
                        className={cn("size-4 shrink-0 text-muted-foreground transition-transform", acik && "rotate-180")}
                      />
                      {gunEtiketi(gun.tarih)}
                    </span>
                    <div className="flex items-center gap-4 text-sm tabular-nums">
                      <span className="text-xs text-muted-foreground">{gun.seansSayisi} seans</span>
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {gun.gelir > 0 ? `+${paraFormat(gun.gelir)}` : "—"}
                      </span>
                      <span className="text-rose-600 dark:text-rose-400">
                        {gun.gider > 0 ? `−${paraFormat(gun.gider)}` : "—"}
                      </span>
                    </div>
                  </button>
                  {acik && (
                    <div className="border-t border-border bg-muted/20 px-3 py-2.5 pl-8">
                      <KalemListesi kalemler={gun.kalemler} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="text-xs text-muted-foreground print:hidden">
          Sabit personel maliyeti (maaş) belirli bir güne değil tüm aya ait olduğundan bu listeye
          dağıtılmaz — üstteki Toplam Gider ve Gider Kalemleri kartlarında ayrıca yer alır.
        </p>
      </CardContent>
    </Card>
  );
}
