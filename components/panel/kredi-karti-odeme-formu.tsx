"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { bugunIstanbulTarihi } from "@/lib/datetime";
import type { KlinikBankaHesabi, KlinikKrediKarti } from "@/types/klinik";
import { krediKartiOdemeEkle } from "@/app/(app)/panel/finans/kredi-karti/actions";
import { useBasariOlunca } from "@/lib/use-basari-olunca";

const SELECT_SINIF =
  "h-9 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Şirket kredi kartına ödeme formu. Üç kullanım:
 *  - Kasa > Kasadan Çıkan: `sabitYontem="nakit"` (kart seçtirilir)
 *  - Banka > Bankadan Çıkan: `sabitYontem="havale"` + `sabitBankaHesapId` (seçili hesap)
 *  - Kredi Kartı sayfası kart satırı: `sabitKartId` (yöntem + hesap seçtirilir)
 */
export function KrediKartiOdemeFormu({
  kartlar,
  bankaHesaplari,
  sabitKartId,
  sabitYontem,
  sabitBankaHesapId,
  basariliOlunca,
}: {
  kartlar: KlinikKrediKarti[];
  bankaHesaplari: KlinikBankaHesabi[];
  sabitKartId?: string;
  sabitYontem?: "nakit" | "havale";
  sabitBankaHesapId?: string;
  basariliOlunca?: () => void;
}) {
  const [sonuc, formAction, isPending] = useActionState(krediKartiOdemeEkle, null);
  const [yontem, setYontem] = useState<"nakit" | "havale" | "">(sabitYontem ?? "");

  useBasariOlunca(sonuc, () => basariliOlunca?.());

  if (kartlar.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Kayıtlı kredi kartı yok — Ayarlar &gt; Şirket Bilgileri &gt; Kredi Kartları&apos;ndan kart ekleyin.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="odeme_tipi" value={yontem} />
      {sabitKartId && <input type="hidden" name="kredi_karti_id" value={sabitKartId} />}
      {sabitBankaHesapId && yontem === "havale" && (
        <input type="hidden" name="banka_hesap_id" value={sabitBankaHesapId} />
      )}

      {!sabitKartId && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="kart-odeme-kart">Kredi Kartı</Label>
          <select
            id="kart-odeme-kart"
            name="kredi_karti_id"
            defaultValue=""
            required
            disabled={isPending}
            className={SELECT_SINIF}
          >
            <option value="" disabled>
              Kart seçin
            </option>
            {kartlar.map((k) => (
              <option key={k.id} value={k.id}>
                {k.kart_adi} — {k.banka_adi}
                {k.son_dort_hane ? ` •••• ${k.son_dort_hane}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="kart-odeme-tutar">Tutar (₺)</Label>
          <Input id="kart-odeme-tutar" name="tutar" type="number" min={0.01} step="0.01" required disabled={isPending} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="kart-odeme-tarih">Tarih</Label>
          <Input
            id="kart-odeme-tarih"
            name="tarih"
            type="date"
            defaultValue={bugunIstanbulTarihi()}
            required
            disabled={isPending}
          />
        </div>
      </div>

      {!sabitYontem && (
        <div className="flex flex-col gap-1.5">
          <Label>Ödeme Yeri</Label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { value: "nakit", label: "Kasa (nakit)" },
                { value: "havale", label: "Banka (havale)" },
              ] as const
            ).map((s) => (
              <button
                key={s.value}
                type="button"
                disabled={isPending}
                aria-pressed={yontem === s.value}
                onClick={() => setYontem(s.value)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                  yontem === s.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:bg-muted"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {yontem === "havale" && !sabitBankaHesapId && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="kart-odeme-banka">Banka Hesabı</Label>
          <select
            id="kart-odeme-banka"
            name="banka_hesap_id"
            defaultValue=""
            required
            disabled={isPending}
            className={SELECT_SINIF}
          >
            <option value="" disabled>
              Hesap seçin
            </option>
            {bankaHesaplari.map((b) => (
              <option key={b.id} value={b.id}>
                {b.banka_adi}
                {b.sube ? ` — ${b.sube}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="kart-odeme-aciklama">Not (opsiyonel)</Label>
        <Input id="kart-odeme-aciklama" name="aciklama" disabled={isPending} />
      </div>

      <p className="text-xs text-muted-foreground">
        Kart ödemesi Kasa/Banka&apos;dan çıkış olur ve kart borcunu düşürür; Raporlar&apos;da gider sayılmaz (harcama
        kartla yapıldığında zaten sayıldı).
      </p>

      {sonuc && !sonuc.success && (
        <p role="alert" className="text-sm text-destructive">
          {sonuc.message}
        </p>
      )}

      <Button type="submit" disabled={isPending || !yontem} className="w-fit">
        {isPending ? "Kaydediliyor..." : "Ödemeyi Kaydet"}
      </Button>
    </form>
  );
}
