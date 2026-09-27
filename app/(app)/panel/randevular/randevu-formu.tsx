"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateForInput } from "@/lib/datetime";
import type { SecenekSatir, TedaviSecenekSatir, TerapistSecenekSatir } from "@/types/randevu";
import { randevuOlustur } from "./actions";
import { HastaArama } from "./hasta-arama";
import { KayitliPaketler } from "./kayitli-paketler";
import { useTedaviEtkinFiyat } from "./queries";

const paraFormat = (tutar: number) => tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

type Props = {
  hastalar: SecenekSatir[];
  terapistler: TerapistSecenekSatir[];
  odalar: SecenekSatir[];
  cihazlar: SecenekSatir[];
  tedaviler: TedaviSecenekSatir[];
  /** Randevu başarıyla oluşturulunca çağrılır (örn. dialog'u kapatmak için) */
  onBasarili?: () => void;
  /** Hasta Detay sayfasından açılınca hasta sabit gelir, arama alanı yerine salt-okunur gösterilir */
  sabitHasta?: { id: string; ad: string };
  /**
   * Bekleyen Randevu Talepleri'nden "Randevu Oluştur" ile açılınca dolar —
   * hasta/tedavi/tarih/saat hastanın talebiyle önceden doldurulur, gizli bir
   * talep_id input'u eklenir (randevuOlustur başarılı olunca ilgili
   * randevu_talebi satırını da onaylanmış olarak işaretler).
   */
  talep?: { id: string; hastaId: string; hastaAd: string; islemTanimiId: string; tarih: string; saat?: string };
};

export function RandevuFormu({
  hastalar,
  terapistler,
  odalar,
  cihazlar,
  tedaviler,
  onBasarili,
  sabitHasta,
  talep,
}: Props) {
  const efektifSabitHasta = sabitHasta ?? (talep ? { id: talep.hastaId, ad: talep.hastaAd } : undefined);
  const [durum, formAction, isPending] = useActionState(randevuOlustur, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);
  const [hastaId, setHastaId] = useState(efektifSabitHasta?.id ?? "");
  const [islemTanimiId, setIslemTanimiId] = useState(talep?.islemTanimiId ?? "");
  const [terapistId, setTerapistId] = useState("");
  const [sureDakika, setSureDakika] = useState(
    tedaviler.find((t) => t.id === talep?.islemTanimiId)?.sure_dakika ?? 30
  );
  const [iskontoTutari, setIskontoTutari] = useState("");

  // Hasta + tedavi ikisi de seçilince sunucuda hesaplanan tedavi bedeli (bkz.
  // islem_tanimi_etkin_fiyat RPC'si) formun en alt satırında İskonto alanının
  // yanında gösterilir — resepsiyon check-in'de oluşacak borç satırı için
  // önceden bir iskonto planlayabilsin diye (bkz. randevu_gelis_isaretle).
  const { data: tedaviBedeli, isLoading: tedaviBedeliYukleniyor } = useTedaviEtkinFiyat(islemTanimiId, hastaId);

  // Seçili tedavinin adımlarında tanımlı "uygulayıcı" pozisyonu varsa Dr /
  // Terapist listesi o pozisyondaki personelle sınırlanır (bkz.
  // types/randevu.ts > TedaviSecenekSatir.pozisyon_idleri); hiçbir adımda
  // pozisyon tanımlı değilse tüm terapistler seçilebilir kalır.
  const seciliTedavi = tedaviler.find((t) => t.id === islemTanimiId);
  const uygunTerapistler =
    seciliTedavi && seciliTedavi.pozisyon_idleri.length > 0
      ? terapistler.filter((t) => t.pozisyon_id && seciliTedavi.pozisyon_idleri.includes(t.pozisyon_id))
      : terapistler;

  // Tedavi seçilince (Tedavi seçiciden veya Kayıtlı Paketler'den) o tedavinin
  // Yönetim > Tedavi Tanımları'nda ayarlanmış uygulama süresi varsa Süre alanına
  // otomatik yansır; süre tanımlı değilse elle girilen/varsayılan değer korunur.
  // Önceden seçili terapist yeni tedavinin gerektirdiği pozisyona uymuyorsa
  // seçim sıfırlanır — Terapist alanı Tedavi'den SONRA doldurulur.
  function tedaviSec(id: string) {
    setIslemTanimiId(id);
    const tedavi = tedaviler.find((t) => t.id === id);
    if (tedavi?.sure_dakika) {
      setSureDakika(tedavi.sure_dakika);
    }
    const yeniUygunlar =
      tedavi && tedavi.pozisyon_idleri.length > 0
        ? terapistler.filter((t) => t.pozisyon_id && tedavi.pozisyon_idleri.includes(t.pozisyon_id))
        : terapistler;
    if (!yeniUygunlar.some((t) => t.id === terapistId)) {
      setTerapistId("");
    }
    setIskontoTutari("");
  }

  // React 19'da form action'ı başarıyla tamamlanınca native alanlar otomatik
  // sıfırlanıyor (HastaArama'nın kendi state'i bundan habersiz kalıp
  // görünüm/gizli-input uyumsuzluğu yaratıyor) — kafa karıştırıcı yarı-sıfırlanmış
  // form yerine, randevu detay panelindeki (düzenleme) ile aynı desenle dialog'u kapatıyoruz.
  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      onBasarili?.();
    }
  }

  const searchParams = useSearchParams();
  const bugun = formatDateForInput(new Date().toISOString());
  // Günün Çizelgesi'nde boş alana tıklanınca oda/tarih/saat buradan gelir;
  // talep prop'u varsa (Bekleyen Randevu Talepleri'nden açılan form) hastanın
  // tercihi öncelikli.
  const onOdaId = searchParams.get("oda_id") ?? undefined;
  const onTarih = talep?.tarih ?? searchParams.get("tarih") ?? bugun;
  const onSaat = talep?.saat ?? searchParams.get("saat") ?? undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {talep && <input type="hidden" name="talep_id" value={talep.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="hasta_arama">Hasta</Label>
          {efektifSabitHasta ? (
            <>
              <Input value={efektifSabitHasta.ad} disabled readOnly />
              <input type="hidden" name="hasta_id" value={efektifSabitHasta.id} />
            </>
          ) : (
            <HastaArama
              id="hasta_arama"
              hastalar={hastalar}
              required
              disabled={isPending}
              onSecim={(h) => {
                setHastaId(h.id);
                setIskontoTutari("");
              }}
              onTemizle={() => {
                setHastaId("");
                setIskontoTutari("");
              }}
            />
          )}
        </div>

        <KayitliPaketler
          hastaId={hastaId}
          secili={islemTanimiId}
          onSec={tedaviSec}
          disabled={isPending}
        />

        <div className="flex flex-col gap-2">
          <Label htmlFor="islem_tanimi_id">Tedavi</Label>
          <Select
            name="islem_tanimi_id"
            required
            disabled={isPending}
            value={islemTanimiId}
            onValueChange={(v) => tedaviSec(v as string)}
            items={tedaviler.map((t) => ({ value: t.id, label: t.ad }))}
          >
            <SelectTrigger id="islem_tanimi_id" className="w-full">
              <SelectValue placeholder="Tedavi seçin" />
            </SelectTrigger>
            <SelectContent>
              {tedaviler.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.ad}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="terapist_id">Dr / Terapist</Label>
          <Select
            name="terapist_id"
            required
            disabled={isPending || !islemTanimiId || uygunTerapistler.length === 0}
            value={terapistId}
            onValueChange={(v) => setTerapistId(v as string)}
            items={uygunTerapistler.map((t) => ({ value: t.id, label: t.ad }))}
          >
            <SelectTrigger id="terapist_id" className="w-full">
              <SelectValue
                placeholder={
                  !islemTanimiId
                    ? "Önce tedavi seçin"
                    : uygunTerapistler.length === 0
                      ? "Bu tedavi için uygun personel yok"
                      : "Dr / Terapist seçin"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {uygunTerapistler.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.ad}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="oda_id">Oda</Label>
          <Select
            name="oda_id"
            required
            disabled={isPending}
            defaultValue={onOdaId}
            items={odalar.map((o) => ({ value: o.id, label: o.ad }))}
          >
            <SelectTrigger id="oda_id" className="w-full">
              <SelectValue placeholder="Oda seçin" />
            </SelectTrigger>
            <SelectContent>
              {odalar.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.ad}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="cihaz_id">Cihaz (opsiyonel)</Label>
          <Select
            name="cihaz_id"
            disabled={isPending || cihazlar.length === 0}
            items={cihazlar.map((c) => ({ value: c.id, label: c.ad }))}
          >
            <SelectTrigger id="cihaz_id" className="w-full">
              <SelectValue
                placeholder={cihazlar.length === 0 ? "Kayıtlı cihaz yok" : "Cihaz seçin"}
              />
            </SelectTrigger>
            <SelectContent>
              {cihazlar.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.ad}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="tarih">Tarih</Label>
          <Input
            id="tarih"
            name="tarih"
            type="date"
            defaultValue={onTarih}
            required
            disabled={isPending}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="saat">Saat</Label>
          <Input id="saat" name="saat" type="time" defaultValue={onSaat} required disabled={isPending} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="sure_dakika">Süre (dakika)</Label>
          <Input
            id="sure_dakika"
            name="sure_dakika"
            type="number"
            min={5}
            max={480}
            value={sureDakika}
            onChange={(e) => setSureDakika(Number(e.target.value))}
            required
            disabled={isPending}
          />
        </div>

        {islemTanimiId && hastaId && (
          <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-border bg-muted/40 px-3 py-2.5 sm:col-span-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Tedavi Bedeli</span>
              <span className="tabular-nums font-medium">
                {tedaviBedeliYukleniyor ? "Hesaplanıyor…" : tedaviBedeli != null ? paraFormat(tedaviBedeli) : "—"}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="planlanan_iskonto_tutari" className="text-xs text-muted-foreground">
                İskonto (₺)
              </Label>
              <Input
                id="planlanan_iskonto_tutari"
                name="planlanan_iskonto_tutari"
                type="number"
                min={0}
                max={tedaviBedeli ?? undefined}
                step="0.01"
                placeholder="0"
                value={iskontoTutari}
                onChange={(e) => setIskontoTutari(e.target.value)}
                disabled={isPending || tedaviBedeli == null}
                className="w-28"
              />
            </div>

            {tedaviBedeli != null && (
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-xs text-muted-foreground">Net Tutar</span>
                <span className="tabular-nums font-semibold">
                  {paraFormat(Math.max(tedaviBedeli - (Number(iskontoTutari) || 0), 0))}
                </span>
              </div>
            )}
          </div>
        )}
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
        {isPending ? "Kaydediliyor..." : "Randevu oluştur"}
      </Button>
    </form>
  );
}
