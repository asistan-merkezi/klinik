"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OdemeYontemi } from "@/types/odeme";
import type { KlinikBankaHesabi } from "@/types/klinik";
import { OdemeTipiSecici, ODEME_TIPI_ETIKETLERI, ODEME_TIPI_SECILI_SINIFI } from "./odeme-tipi-secici";
import { bakiyeHareketiEkle } from "./actions";
import { randevuSeansOdemesiEkle } from "@/app/(app)/panel/randevular/actions";

const paraFormat = (tutar: number) => tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

export function BakiyeHareketiEkleButonu({
  hastaId,
  hastaAdSoyad,
  bankaHesaplari,
  guncelBakiye,
  onBasarili,
  randevuId,
}: {
  hastaId: string;
  hastaAdSoyad: string;
  bankaHesaplari: KlinikBankaHesabi[];
  guncelBakiye: number;
  /** Ödeme başarıyla kaydedildiğinde çağrılır (örn. randevu tamamlama özetinde "İşlem kapanmıştır" göstermek için). */
  onBasarili?: () => void;
  /**
   * Doluysa (Randevu Çizelgesi'nde tamamlanan bir seansın "Ödeme Ekle" kartı)
   * bu, hasta seviyesinde bağımsız bir ödeme EKLEMEZ — o randevunun seans
   * bedelini (henüz hiç yazılmamışsa) borç olarak oluşturup üstüne bu ödemeyi
   * işler, ikisi tek RPC'de (randevu_seans_bedelini_isle, bkz. randevuSeansOdemesiEkle).
   * Boşsa (Cari & Ödeme sekmesindeki genel kullanım) eskisi gibi bağımsız bir
   * 'odeme' satırı ekler (bakiyeHareketiEkle) — hiçbir borç yazmaz.
   */
  randevuId?: string;
}) {
  const idOnEki = useId();
  const [acik, setAcik] = useState(false);
  const [odemeTipi, setOdemeTipi] = useState<OdemeYontemi>("nakit");
  const [aciklamaMetni, setAciklamaMetni] = useState("");
  const [bankaHesapId, setBankaHesapId] = useState<string | undefined>(undefined);
  const eklemeAction = randevuId ? randevuSeansOdemesiEkle.bind(null, randevuId) : bakiyeHareketiEkle.bind(null, hastaId);
  const [durum, formAction, isPending] = useActionState(eklemeAction, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      setAcik(false);
      setOdemeTipi("nakit");
      setAciklamaMetni("");
      setBankaHesapId(undefined);
    }
  }

  // onBasarili başka bir bileşenin (ör. bu dialogun açıldığı
  // OdemeVeyaCariKarti/CanliCizelge, optimistik liste güncellemesi için)
  // state'ini günceller — render SIRASINDA değil, commit sonrası bir efektte
  // çağrılmalı, aksi halde "Cannot update a component while rendering a
  // different component" örüntüsüne düşer ve prod build'de sessizce
  // uygulanmayabilir (bkz. randevu-detay-paneli.tsx'teki aynı düzeltme).
  useEffect(() => {
    if (durum?.success) {
      onBasarili?.();
    }
  }, [durum, onBasarili]);

  // Ödeme yöntemi (nakit/kredi kartı/havale) hem yapılandırılmış odeme_yontemi
  // kolonuna hem (geriye dönük görünürlük için) açıklama metnine etiket
  // olarak ekleniyor (bkz. supabase/migrations/20260916091000).
  const birlesikAciklama = aciklamaMetni.trim()
    ? `${ODEME_TIPI_ETIKETLERI[odemeTipi]} — ${aciklamaMetni.trim()}`
    : ODEME_TIPI_ETIKETLERI[odemeTipi];

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={ODEME_TIPI_SECILI_SINIFI}
        onClick={() => setAcik(true)}
      >
        <Plus />
        Ödeme Ekle
      </Button>
      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ödeme Ekle</DialogTitle>
          </DialogHeader>
          <p className="text-sm font-medium">{hastaAdSoyad}</p>
          <p
            className={`text-sm font-medium tabular-nums ${
              guncelBakiye < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            Güncel Bakiye: {paraFormat(guncelBakiye)}
          </p>
          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="tur" value="odeme" />
            <input type="hidden" name="aciklama" value={birlesikAciklama} />
            <input type="hidden" name="odeme_yontemi" value={odemeTipi} />
            <input
              type="hidden"
              name="banka_hesap_id"
              value={odemeTipi === "banka_havalesi" ? (bankaHesapId ?? "") : ""}
            />

            <div className="flex flex-col gap-1">
              <Label>Ödeme Tipi</Label>
              <OdemeTipiSecici
                value={odemeTipi}
                onChange={(deger) => {
                  setOdemeTipi(deger);
                  if (deger !== "banka_havalesi") setBankaHesapId(undefined);
                }}
                disabled={isPending}
              />
            </div>

            {odemeTipi === "banka_havalesi" && (
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${idOnEki}-banka_hesap_id`}>Banka Hesabı</Label>
                {bankaHesaplari.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Kayıtlı banka hesabı yok — Finans &gt; Banka&apos;dan hesap ekleyin.
                  </p>
                ) : (
                  <Select
                    disabled={isPending}
                    value={bankaHesapId}
                    onValueChange={(v) => setBankaHesapId(v ?? undefined)}
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
            )}

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${idOnEki}-tutar`}>Tutar (₺)</Label>
              <Input
                id={`${idOnEki}-tutar`}
                name="tutar"
                type="number"
                min={0}
                step="0.01"
                required
                disabled={isPending}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${idOnEki}-tarih`}>Tarih</Label>
              <Input
                id={`${idOnEki}-tarih`}
                name="tarih"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                required
                disabled={isPending}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${idOnEki}-aciklama`}>Açıklama (opsiyonel)</Label>
              <Input
                id={`${idOnEki}-aciklama`}
                value={aciklamaMetni}
                onChange={(e) => setAciklamaMetni(e.target.value)}
                disabled={isPending}
              />
            </div>

            {durum && (
              <p
                role="alert"
                className={`text-sm ${durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}
              >
                {durum.message}
              </p>
            )}

            <Button type="submit" disabled={isPending} className="w-fit">
              {isPending ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
