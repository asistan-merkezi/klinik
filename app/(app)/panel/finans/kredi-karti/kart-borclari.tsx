"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronRight, CirclePlus, CreditCard, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { KrediKartiOdemeFormu } from "@/components/panel/kredi-karti-odeme-formu";
import type { KlinikBankaHesabi, KlinikKrediKarti } from "@/types/klinik";
import { krediKartiOdemeSil } from "./actions";
import { tlFark, tlTopla } from "@/lib/para";

export type KartHareketi = {
  kaynak: "gider" | "cari_odeme" | "kart_odemesi";
  id: string;
  kredi_karti_id: string | null;
  tarih: string;
  tip: "harcama" | "odeme";
  tutar: number;
  ad: string | null;
  detay: string | null;
  yontem: string | null;
  banka_hesap_id: string | null;
};

export type KartOzeti = { kredi_karti_id: string | null; harcama: number; odeme: number };

const paraFormat = (tutar: number) => tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });
const tarihFormat = (tarih: string) => new Date(tarih).toLocaleDateString("tr-TR");

const KAYNAK_ETIKET: Record<KartHareketi["kaynak"], string> = {
  gider: "Gider",
  cari_odeme: "Cari ödemesi",
  kart_odemesi: "Kart ödemesi",
};

/**
 * Şirket kredi kartı BORCU: harcama (kartla yapılan gider + kartla yapılan cari ödemesi) − karta yapılan ödeme.
 * Borç tüm zamanlar üzerinden SQL'den (`kredi_karti_borc_ozetleri`) gelir; hareket listesi son 12 aydır.
 */
export function KartBorclari({
  kartlar,
  ozetler,
  hareketler,
  bankaHesaplari,
  duzenlenebilir,
  tumZamanlar,
}: {
  kartlar: KlinikKrediKarti[];
  ozetler: KartOzeti[];
  hareketler: KartHareketi[];
  bankaHesaplari: KlinikBankaHesabi[];
  duzenlenebilir: boolean;
  tumZamanlar: boolean;
}) {
  const ozetMap = new Map(ozetler.map((o) => [o.kredi_karti_id, o]));
  const kartsiz = ozetMap.get(null);
  const toplamBorc = tlTopla(ozetler.map((o) => tlFark(o.harcama, o.odeme)));

  if (kartlar.length === 0 && !kartsiz) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Kart Borçları</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={CreditCard}
            title="Kayıtlı kredi kartı yok."
            description="Ayarlar > Şirket Bilgileri > Kredi Kartları'ndan kart ekleyin; giderlerde Kredi Kartı seçip kartı belirtince harcama burada borç olarak görünür."
            compact
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kart Borçları</CardTitle>
        <p className="text-sm text-muted-foreground">
          Toplam kart borcu:{" "}
          <span className={cn("tabular font-semibold", toplamBorc > 0 && "text-rose-700 dark:text-rose-400")}>
            {paraFormat(toplamBorc)}
          </span>{" "}
          · Kart borcu = kartla yapılan harcamalar − karta yapılan ödemeler
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {kartlar.map((k) => (
          <KartSatiri
            key={k.id}
            baslik={`${k.kart_adi} — ${k.banka_adi}${k.son_dort_hane ? ` •••• ${k.son_dort_hane}` : ""}`}
            kart={k}
            ozet={ozetMap.get(k.id)}
            hareketler={hareketler.filter((h) => h.kredi_karti_id === k.id)}
            kartlar={kartlar}
            bankaHesaplari={bankaHesaplari}
            duzenlenebilir={duzenlenebilir}
          />
        ))}
        {kartsiz && (
          <KartSatiri
            baslik="Kart seçilmedi"
            kart={null}
            ozet={kartsiz}
            hareketler={hareketler.filter((h) => h.kredi_karti_id === null)}
            kartlar={kartlar}
            bankaHesaplari={bankaHesaplari}
            duzenlenebilir={duzenlenebilir}
          />
        )}
        <p className="text-xs text-muted-foreground">
          {tumZamanlar ? (
            <>
              Tüm hareketler gösteriliyor.{" "}
              <a href="?" className="underline">
                Son 12 aya dön
              </a>
            </>
          ) : (
            <>
              Hareket listesi son 12 ay; borç her zaman tüm zamanlar üzerinden.{" "}
              <a href="?tum=1" className="underline">
                Tümünü göster
              </a>
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}

function KartSatiri({
  baslik,
  kart,
  ozet,
  hareketler,
  kartlar,
  bankaHesaplari,
  duzenlenebilir,
}: {
  baslik: string;
  kart: KlinikKrediKarti | null;
  ozet: KartOzeti | undefined;
  hareketler: KartHareketi[];
  kartlar: KlinikKrediKarti[];
  bankaHesaplari: KlinikBankaHesabi[];
  duzenlenebilir: boolean;
}) {
  const [acik, setAcik] = useState(false);
  const [odemeFormu, setOdemeFormu] = useState(false);
  const harcama = ozet?.harcama ?? 0;
  const odeme = ozet?.odeme ?? 0;
  const borc = tlFark(harcama, odeme);
  const bankaMap = new Map(bankaHesaplari.map((b) => [b.id, b]));

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={() => setAcik((a) => !a)}
          aria-expanded={acik}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left font-medium"
        >
          {acik ? <ChevronDown className="size-4 shrink-0" aria-hidden /> : <ChevronRight className="size-4 shrink-0" aria-hidden />}
          <span className="truncate">{baslik}</span>
          {kart?.kart_tipi === "sahis" && <StatusBadge tone="slate">Şahıs kartı</StatusBadge>}
        </button>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="text-muted-foreground">
            Harcama <span className="tabular text-foreground">{paraFormat(harcama)}</span>
          </span>
          <span className="text-muted-foreground">
            Ödenen <span className="tabular text-foreground">{paraFormat(odeme)}</span>
          </span>
          <span className="text-muted-foreground">
            Borç{" "}
            <span className={cn("tabular font-semibold", borc > 0 ? "text-rose-700 dark:text-rose-400" : "text-foreground")}>
              {paraFormat(borc)}
            </span>
          </span>
        </div>
        {duzenlenebilir && kart && (
          <Button type="button" size="sm" variant="outline" onClick={() => setOdemeFormu((a) => !a)}>
            <CirclePlus />
            Ödeme Ekle
          </Button>
        )}
      </div>

      {odemeFormu && kart && (
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <KrediKartiOdemeFormu
            kartlar={kartlar}
            bankaHesaplari={bankaHesaplari}
            sabitKartId={kart.id}
            basariliOlunca={() => setOdemeFormu(false)}
          />
        </div>
      )}

      {acik &&
        (hareketler.length === 0 ? (
          <p className="text-sm text-muted-foreground">Bu dönemde hareket yok.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {hareketler.map((h) => (
              <HareketSatiri key={`${h.kaynak}-${h.id}`} h={h} bankaMap={bankaMap} duzenlenebilir={duzenlenebilir} />
            ))}
          </ul>
        ))}
    </div>
  );
}

function HareketSatiri({
  h,
  bankaMap,
  duzenlenebilir,
}: {
  h: KartHareketi;
  bankaMap: Map<string, KlinikBankaHesabi>;
  duzenlenebilir: boolean;
}) {
  const [silinecek, setSilinecek] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [bekliyor, startTransition] = useTransition();
  const banka = h.banka_hesap_id ? bankaMap.get(h.banka_hesap_id) : undefined;
  const aciklama = [
    h.ad,
    h.detay,
    h.kaynak === "kart_odemesi" ? (h.yontem === "havale" ? `Banka${banka ? ` (${banka.banka_adi})` : ""}` : "Kasa") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex flex-col gap-1 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="w-24 shrink-0 text-muted-foreground">{tarihFormat(h.tarih)}</span>
        <StatusBadge tone={h.tip === "odeme" ? "emerald" : "slate"}>{KAYNAK_ETIKET[h.kaynak]}</StatusBadge>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{aciklama || "—"}</span>
        <span className="tabular w-28 text-right">{h.tip === "harcama" ? paraFormat(h.tutar) : "—"}</span>
        <span className="tabular w-28 text-right">{h.tip === "odeme" ? paraFormat(h.tutar) : "—"}</span>
        {duzenlenebilir && h.kaynak === "kart_odemesi" && !silinecek && (
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Kart ödemesini sil" onClick={() => setSilinecek(true)}>
            <Trash2 />
          </Button>
        )}
        {duzenlenebilir && h.kaynak === "kart_odemesi" && silinecek && (
          <span className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Silinsin mi?</span>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={bekliyor}
              onClick={() =>
                startTransition(async () => {
                  const sonuc = await krediKartiOdemeSil(h.id);
                  setHata(sonuc?.success ? null : (sonuc?.message ?? "Silinemedi."));
                  setSilinecek(false);
                })
              }
            >
              Sil
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={bekliyor} onClick={() => setSilinecek(false)}>
              Vazgeç
            </Button>
          </span>
        )}
      </div>
      {hata && (
        <p role="alert" className="text-xs text-destructive">
          {hata}
        </p>
      )}
    </li>
  );
}
