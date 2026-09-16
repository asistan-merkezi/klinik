"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { KlinikArac, KlinikBankaHesabi } from "@/types/klinik";
import {
  HARCAMA_KATEGORI_SECENEKLERI,
  ARAC_GOSTERILEN_KATEGORILER,
  ODEME_TIPI_SECENEKLERI,
  type HarcamaKategori,
  type KlinikHarcamaSatir,
  type OdemeTipi,
} from "@/types/klinik-harcama";

type SonucDurumu = { success: boolean; message: string } | null;
type GiderAction = (onceki: SonucDurumu, formData: FormData) => Promise<SonucDurumu>;

// button.tsx'in variant="outline" sınıfları derlenmiş CSS'te bu renklerden
// sonra tanımlanıyor, bu yüzden className override'ı "!" olmadan sessizce
// kaybolur (bkz. odeme-tipi-secici.tsx'teki aynı not / CLAUDE.md Tailwind tuzağı).
const ODEME_TIPI_SECILI_SINIFI =
  "!border-primary !bg-primary !text-primary-foreground hover:!bg-primary/90";

export function GiderFormu({
  action,
  gonderButonEtiketi,
  duzenlenecek,
  araclar,
  bankaHesaplari,
  basariliOlunca,
  sabitOdemeTipi,
  sabitBankaHesapId,
}: {
  action: GiderAction;
  gonderButonEtiketi: string;
  duzenlenecek?: KlinikHarcamaSatir;
  araclar: KlinikArac[];
  bankaHesaplari: KlinikBankaHesabi[];
  basariliOlunca?: () => void;
  /** Kasa/Banka'nın "Tedarikçi" akışından çağrılırken ödeme tipini sabitler — 3'lü toggle gizlenir. */
  sabitOdemeTipi?: OdemeTipi;
  /** sabitOdemeTipi="havale" ile birlikte kullanılır — banka hesabı seçimini de sabitler (Banka sayfasının seçili hesabı). */
  sabitBankaHesapId?: string;
}) {
  const idOnEki = useId();
  const [durum, formAction, isPending] = useActionState(action, null);
  const [gorulenDurum, setGorulenDurum] = useState<SonucDurumu>(null);
  const [kategori, setKategori] = useState<HarcamaKategori | undefined>(duzenlenecek?.kategori);
  const [odemeTipi, setOdemeTipi] = useState<OdemeTipi | null>(
    sabitOdemeTipi ?? duzenlenecek?.odeme_tipi ?? null
  );
  const [faturali, setFaturali] = useState(duzenlenecek?.is_faturali ?? false);
  const aracGosterilir = kategori != null && ARAC_GOSTERILEN_KATEGORILER.includes(kategori);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      basariliOlunca?.();
    }
  }

  const bugun = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="odeme_tipi" value={odemeTipi ?? ""} />

      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idOnEki}-tarih`}>Tarih</Label>
        <Input
          id={`${idOnEki}-tarih`}
          name="tarih"
          type="date"
          defaultValue={duzenlenecek?.tarih ?? bugun}
          required
          disabled={isPending}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idOnEki}-kategori`}>Kategori</Label>
        <Select
          name="kategori"
          required
          disabled={isPending}
          value={kategori}
          onValueChange={(v) => setKategori(v as HarcamaKategori)}
          items={HARCAMA_KATEGORI_SECENEKLERI}
        >
          <SelectTrigger id={`${idOnEki}-kategori`} className="w-full">
            <SelectValue placeholder="Seçiniz..." />
          </SelectTrigger>
          <SelectContent>
            {HARCAMA_KATEGORI_SECENEKLERI.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {aracGosterilir && (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${idOnEki}-arac_id`}>Araç (opsiyonel)</Label>
          {araclar.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Kayıtlı araç yok — Şirket Bilgileri &gt; Araçlar&apos;dan araç ekleyebilirsiniz.
            </p>
          ) : (
            <Select
              name="arac_id"
              disabled={isPending}
              defaultValue={duzenlenecek?.arac_id ?? undefined}
              items={araclar.map((a) => ({ value: a.id, label: `${a.plaka} — ${a.marka} ${a.model}` }))}
            >
              <SelectTrigger id={`${idOnEki}-arac_id`} className="w-full">
                <SelectValue placeholder="İlişkilendirilmedi" />
              </SelectTrigger>
              <SelectContent>
                {araclar.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.plaka} — {a.marka} {a.model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idOnEki}-tedarikci_adi`}>Tedarikçi (opsiyonel)</Label>
        <Input
          id={`${idOnEki}-tedarikci_adi`}
          name="tedarikci_adi"
          placeholder="Tedarikçi/satıcı adı"
          defaultValue={duzenlenecek?.tedarikci_adi ?? ""}
          disabled={isPending}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idOnEki}-tutar`}>Tutar (₺)</Label>
        <Input
          id={`${idOnEki}-tutar`}
          name="tutar"
          type="number"
          min={0}
          step="0.01"
          defaultValue={duzenlenecek?.tutar}
          required
          disabled={isPending}
        />
      </div>

      {/* sabitOdemeTipi verildiğinde toggle gizlenir — değer zaten yukarıdaki
          her zaman render edilen hidden input'tan (satır 76) gönderiliyor,
          odemeTipi state'i sabitOdemeTipi ile başlatıldığı ve kullanıcı
          değiştiremediği için ayrı bir hidden input GEREKMEZ. */}
      {!sabitOdemeTipi && (
        <div className="flex flex-col gap-1">
          <Label>Ödeme Tipi (opsiyonel)</Label>
          <div className="grid grid-cols-3 gap-2">
            {ODEME_TIPI_SECENEKLERI.map((s) => (
              <Button
                key={s.value}
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                className={cn(odemeTipi === s.value && ODEME_TIPI_SECILI_SINIFI)}
                onClick={() => setOdemeTipi((onceki) => (onceki === s.value ? null : s.value))}
              >
                {s.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {odemeTipi === "havale" &&
        (sabitBankaHesapId ? (
          <input type="hidden" name="banka_hesap_id" value={sabitBankaHesapId} />
        ) : (
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${idOnEki}-banka_hesap_id`}>Banka Hesabı</Label>
            {bankaHesaplari.length === 0 ? (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Kayıtlı banka hesabı yok — Finans &gt; Banka&apos;dan hesap ekleyin.
              </p>
            ) : (
              <Select
                name="banka_hesap_id"
                required
                disabled={isPending}
                defaultValue={duzenlenecek?.banka_hesap_id ?? undefined}
                items={bankaHesaplari.map((b) => ({
                  value: b.id,
                  label: b.sube ? `${b.banka_adi} — ${b.sube}` : b.banka_adi,
                }))}
              >
                <SelectTrigger id={`${idOnEki}-banka_hesap_id`} className="w-full">
                  <SelectValue placeholder="Seçiniz..." />
                </SelectTrigger>
                <SelectContent>
                  {bankaHesaplari.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.sube ? `${b.banka_adi} — ${b.sube}` : b.banka_adi}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        ))}

      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idOnEki}-aciklama`}>Açıklama (opsiyonel)</Label>
        <Input
          id={`${idOnEki}-aciklama`}
          name="aciklama"
          placeholder="Opsiyonel açıklama..."
          defaultValue={duzenlenecek?.aciklama ?? ""}
          disabled={isPending}
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id={`${idOnEki}-is_faturali`}
          name="is_faturali"
          type="checkbox"
          checked={faturali}
          onChange={(e) => setFaturali(e.target.checked)}
          disabled={isPending}
          className="h-4 w-4 rounded border-input"
        />
        <Label htmlFor={`${idOnEki}-is_faturali`} className="font-normal">
          Faturalı
        </Label>
      </div>

      {faturali && (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${idOnEki}-fatura_no`}>Fatura No (opsiyonel)</Label>
          <Input
            id={`${idOnEki}-fatura_no`}
            name="fatura_no"
            defaultValue={duzenlenecek?.fatura_no ?? ""}
            disabled={isPending}
          />
        </div>
      )}

      {durum && !durum.success && (
        <p role="alert" className="text-sm text-destructive">
          {durum.message}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? "Kaydediliyor..." : gonderButonEtiketi}
      </Button>
    </form>
  );
}
