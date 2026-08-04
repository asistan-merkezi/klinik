"use client";

import { useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { bolgeBul } from "@/lib/vucut-bolgeleri";
import {
  RANDEVU_DURUM_ETIKETLERI,
  RANDEVU_DURUM_TONLARI,
  type RandevuDurumu,
  type HastaSeansSatir,
} from "@/types/hasta-detay";
import { useHastaSeansGecmisi, useHastaProtokoller, useVucutHaritasi, useSeansTamamla } from "./queries";

const TARIH_SAAT_FORMAT = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "Seansı Tamamla" sadece hastanın gerçekten geldiği bir seans için anlamlı. */
const TAMAMLANABILIR_DURUMLAR: RandevuDurumu[] = ["geldi", "gecikmeli_geldi"];

export function SeansGecmisiZamanCizelgesi({
  hastaId,
  aktif,
  seciliSeansId,
  onSeansSec,
  duzenlenebilir,
}: {
  hastaId: string;
  aktif: boolean;
  seciliSeansId: string | null;
  onSeansSec: (id: string | null) => void;
  /** true ise (klinik_admin/resepsiyon veya kendi randevusundaki terapist) "Seansı Tamamla" gösterilir. */
  duzenlenebilir: boolean;
}) {
  const { data: seanslar, isLoading } = useHastaSeansGecmisi(hastaId, aktif);
  const { data: tumIsaretler } = useVucutHaritasi(hastaId, null, aktif);
  const { data: protokoller } = useHastaProtokoller(hastaId, aktif);

  const isaretlerBySeans = useMemo(() => {
    const harita = new Map<string, string[]>();
    for (const isaret of tumIsaretler ?? []) {
      if (!isaret.randevu_id) continue;
      const bolgeAdi = bolgeBul(isaret.bolge)?.ad ?? isaret.bolge;
      const liste = harita.get(isaret.randevu_id) ?? [];
      liste.push(bolgeAdi);
      harita.set(isaret.randevu_id, liste);
    }
    return harita;
  }, [tumIsaretler]);

  const aktifProtokolEtiketleri = (protokoller ?? [])
    .filter((p) => p.durum === "aktif")
    .map((p) => p.islem_tanimi?.ad)
    .filter((ad): ad is string => Boolean(ad));

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Yükleniyor...</p>;
  }

  if (!seanslar || seanslar.length === 0) {
    return <EmptyState icon={CalendarClock} title="Henüz geçmiş seans yok." />;
  }

  return (
    <ol className="relative flex flex-col gap-3 border-l border-border pl-6">
      {seanslar.map((seans) => {
        const secili = seans.id === seciliSeansId;
        const bolgeEtiketleri = isaretlerBySeans.get(seans.id) ?? [];

        return (
          <li key={seans.id} className="relative">
            <span
              className={cn(
                "absolute -left-[27px] top-4 size-3 rounded-full border-2 border-background",
                secili ? "bg-primary ring-4 ring-primary/15" : "bg-muted-foreground/40"
              )}
              aria-hidden="true"
            />
            <button
              type="button"
              onClick={() => onSeansSec(secili ? null : seans.id)}
              className={cn(
                "flex w-full flex-col gap-2 rounded-xl border p-3.5 text-left transition-all",
                secili
                  ? "border-primary bg-primary/5 shadow-[0_0_0_1px_var(--primary),0_4px_20px_-6px_var(--primary)]"
                  : "border-border hover:bg-muted/40"
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{TARIH_SAAT_FORMAT.format(new Date(seans.baslangic))}</span>
                <StatusBadge tone={RANDEVU_DURUM_TONLARI[seans.durum]}>{RANDEVU_DURUM_ETIKETLERI[seans.durum]}</StatusBadge>
              </div>

              <p className="text-xs text-muted-foreground">
                {seans.terapist?.personel?.ad_soyad ?? "Terapist atanmamış"}
              </p>

              {(aktifProtokolEtiketleri.length > 0 || bolgeEtiketleri.length > 0) && (
                <div className="flex flex-wrap gap-1">
                  {aktifProtokolEtiketleri.map((ad) => (
                    <span key={ad} className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                      {ad}
                    </span>
                  ))}
                  {bolgeEtiketleri.map((ad, i) => (
                    <span key={`${ad}-${i}`} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                      {ad}
                    </span>
                  ))}
                </div>
              )}
            </button>

            {secili && (
              <TedaviBilgisiKarti hastaId={hastaId} seans={seans} duzenlenebilir={duzenlenebilir} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function TedaviBilgisiSatiri({ etiket, deger }: { etiket: string; deger: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 text-sm">
      <span className="font-medium text-muted-foreground">{etiket}:</span>
      <span>{deger || "—"}</span>
    </div>
  );
}

function TedaviBilgisiKarti({
  hastaId,
  seans,
  duzenlenebilir,
}: {
  hastaId: string;
  seans: HastaSeansSatir;
  duzenlenebilir: boolean;
}) {
  const [tamamlaAcik, setTamamlaAcik] = useState(false);
  const tamamlanabilir = TAMAMLANABILIR_DURUMLAR.includes(seans.durum);

  return (
    <div className="mt-2 flex flex-col gap-1.5 rounded-xl border border-border bg-muted/30 p-3.5">
      <h4 className="mb-1 text-sm font-semibold">
        Tedavi ({TARIH_SAAT_FORMAT.format(new Date(seans.baslangic))})
      </h4>
      <TedaviBilgisiSatiri etiket="Fizyoterapist" deger={seans.terapist?.personel?.ad_soyad ?? ""} />
      <TedaviBilgisiSatiri etiket="Antrenör" deger={seans.antrenor?.ad_soyad ?? ""} />
      <TedaviBilgisiSatiri etiket="Tanı" deger={seans.tani ?? ""} />
      <TedaviBilgisiSatiri etiket="Tedavi Türü" deger={seans.islem_tanimi?.ad ?? ""} />
      <TedaviBilgisiSatiri etiket="Tedavi Protokolü" deger={seans.tedavi_protokolu?.ad ?? ""} />

      {seans.durum === "tamamlandi" && (
        <>
          <TedaviBilgisiSatiri etiket="İşlem Açıklaması" deger={seans.tamamlanma_aciklamasi ?? ""} />
          <TedaviBilgisiSatiri
            etiket="Tamamlayan"
            deger={
              seans.tamamlayan_kullanici?.ad_soyad
                ? `${seans.tamamlayan_kullanici.ad_soyad}${
                    seans.tamamlanma_tarihi ? " · " + TARIH_SAAT_FORMAT.format(new Date(seans.tamamlanma_tarihi)) : ""
                  }`
                : ""
            }
          />
        </>
      )}

      {duzenlenebilir && tamamlanabilir && (
        <div className="mt-1">
          {tamamlaAcik ? (
            <SeansiTamamlaFormu
              hastaId={hastaId}
              randevuId={seans.id}
              onTamam={() => setTamamlaAcik(false)}
              onVazgec={() => setTamamlaAcik(false)}
            />
          ) : (
            <Button type="button" size="sm" onClick={() => setTamamlaAcik(true)}>
              Seansı Tamamla
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function SeansiTamamlaFormu({
  hastaId,
  randevuId,
  onTamam,
  onVazgec,
}: {
  hastaId: string;
  randevuId: string;
  onTamam: () => void;
  onVazgec: () => void;
}) {
  const [aciklama, setAciklama] = useState("");
  const mutasyon = useSeansTamamla(hastaId);

  function gonder(e: React.FormEvent) {
    e.preventDefault();
    if (!aciklama.trim() || mutasyon.isPending) return;
    mutasyon.mutate({ randevuId, aciklama: aciklama.trim() }, { onSuccess: onTamam });
  }

  return (
    <form onSubmit={gonder} className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
      <Label htmlFor={`tamamla-aciklama-${randevuId}`}>İşlem Açıklaması</Label>
      <textarea
        id={`tamamla-aciklama-${randevuId}`}
        value={aciklama}
        onChange={(e) => setAciklama(e.target.value)}
        rows={2}
        required
        disabled={mutasyon.isPending}
        placeholder="Bu seansta yapılan işlemi kısaca açıklayın..."
        className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      {mutasyon.isError && <p className="text-sm text-destructive">Tamamlanamadı, lütfen tekrar deneyin.</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={mutasyon.isPending || !aciklama.trim()}>
          {mutasyon.isPending ? "Kaydediliyor..." : "Seansı Tamamla"}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={mutasyon.isPending} onClick={onVazgec}>
          Vazgeç
        </Button>
      </div>
    </form>
  );
}
