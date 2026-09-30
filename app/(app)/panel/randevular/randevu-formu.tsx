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
import { useDoluKaynaklar, useTedaviEtkinFiyat } from "./queries";

const paraFormat = (tutar: number) => tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

type Props = {
  hastalar: SecenekSatir[];
  terapistler: TerapistSecenekSatir[];
  odalar: SecenekSatir[];
  cihazlar?: SecenekSatir[];
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
  const [odaId, setOdaId] = useState("");
  const [iskontoTutari, setIskontoTutari] = useState("");

  const searchParams = useSearchParams();
  const bugun = formatDateForInput(new Date().toISOString());
  // Günün Çizelgesi'nde boş alana tıklanınca oda/tarih/saat buradan gelir;
  // talep prop'u varsa (Bekleyen Randevu Talepleri'nden açılan form) hastanın
  // tercihi öncelikli.
  const onOdaId = searchParams.get("oda_id") ?? "";
  const [tarih, setTarih] = useState(talep?.tarih ?? searchParams.get("tarih") ?? bugun);
  const [saat, setSaat] = useState(talep?.saat ?? searchParams.get("saat") ?? "");
  // Çizelgeden gelen oda önseçimi — müsaitlik kontrolünden geçemezse aşağıda temizlenir.
  const [onOdaKullanildi, setOnOdaKullanildi] = useState(false);
  if (!onOdaKullanildi && onOdaId) {
    setOnOdaKullanildi(true);
    setOdaId(onOdaId);
  }

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
  const pozisyonaUygunTerapistler =
    seciliTedavi && seciliTedavi.pozisyon_idleri.length > 0
      ? terapistler.filter((t) => t.pozisyon_id && seciliTedavi.pozisyon_idleri.includes(t.pozisyon_id))
      : terapistler;

  // Toplam süre TEDAVİ TANIMINDAN gelir (adımların toplamı = islem_tanimi.sure_dakika,
  // bkz. islem_tanimi_adim trigger'ı); süre kullanıcıdan alınmaz. Tanımda süre
  // yoksa 30 dk varsayılanı — eski form varsayılanıyla aynı.
  const adimToplami = (seciliTedavi?.adimlar ?? []).reduce((t, a) => t + (a.sure_dakika ?? 0), 0);
  const toplamSure = seciliTedavi?.sure_dakika ?? (adimToplami > 0 ? adimToplami : 30);

  // Tarih + saat + tedavi belli olunca o zaman dilimindeki dolu terapist/oda
  // çekilir; listeler yalnız müsait olanları gösterir.
  const zamanHazir = Boolean(islemTanimiId && tarih && saat);
  const { data: dolu, isLoading: musaitlikYukleniyor } = useDoluKaynaklar(
    zamanHazir ? tarih : "",
    zamanHazir ? saat : "",
    toplamSure
  );
  const uygunTerapistler = dolu
    ? pozisyonaUygunTerapistler.filter((t) => !dolu.terapistler.has(t.id))
    : pozisyonaUygunTerapistler;
  const musaitOdalar = dolu ? odalar.filter((o) => !dolu.odalar.has(o.id)) : odalar;
  // Seçim, zaman değişince dolu hâle gelirse sessizce sıfırlanır (render sırasında
  // türetilen değer; state'e dokunmadan gönderilen değer buna göre boşalır).
  const efektifTerapistId = uygunTerapistler.some((t) => t.id === terapistId) ? terapistId : "";
  const efektifOdaId = musaitOdalar.some((o) => o.id === odaId) ? odaId : "";

  // Tedavi seçilince (Tedavi seçiciden veya Kayıtlı Paketler'den) iskonto sıfırlanır;
  // terapist/oda seçimi müsaitlik listesinden efektif olarak yeniden doğrulanır.
  function tedaviSec(id: string) {
    setIslemTanimiId(id);
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

        {seciliTedavi && (
          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-muted/40 px-3 py-2.5 sm:col-span-2">
            <span className="text-xs font-medium text-muted-foreground">Yapılacak İşlemler</span>
            {seciliTedavi.adimlar.length > 0 ? (
              <ul className="flex flex-col divide-y divide-border text-sm">
                {seciliTedavi.adimlar.map((a, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 py-1.5">
                    <span className="font-medium">{a.ad}</span>
                    <span className="tabular flex items-center gap-4 text-muted-foreground">
                      <span>{a.cihaz_ad ?? "Cihaz yok"}</span>
                      <span>{a.sure_dakika ? `${a.sure_dakika} dk` : "—"}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Bu tedavi için işlem adımı tanımlı değil.</p>
            )}
            <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
              <span className="font-medium">Toplam Süre</span>
              <span className="tabular font-semibold">{toplamSure} dk</span>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="tarih">Tarih</Label>
          <Input
            id="tarih"
            name="tarih"
            type="date"
            value={tarih}
            onChange={(e) => setTarih(e.target.value)}
            required
            disabled={isPending}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="saat">Saat</Label>
          <Input
            id="saat"
            name="saat"
            type="time"
            value={saat}
            onChange={(e) => setSaat(e.target.value)}
            required
            disabled={isPending}
          />
        </div>

        <input type="hidden" name="sure_dakika" value={toplamSure} />

        <div className="flex flex-col gap-2">
          <Label htmlFor="terapist_id">Dr / Terapist</Label>
          <Select
            name="terapist_id"
            required
            disabled={isPending || !zamanHazir || uygunTerapistler.length === 0}
            value={efektifTerapistId}
            onValueChange={(v) => setTerapistId(v as string)}
            items={uygunTerapistler.map((t) => ({ value: t.id, label: t.ad }))}
          >
            <SelectTrigger id="terapist_id" className="w-full">
              <SelectValue
                placeholder={
                  !islemTanimiId
                    ? "Önce tedavi seçin"
                    : !zamanHazir
                      ? "Önce tarih ve saat seçin"
                      : musaitlikYukleniyor
                        ? "Müsaitlik kontrol ediliyor…"
                        : uygunTerapistler.length === 0
                          ? "Bu saatte müsait personel yok"
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
            disabled={isPending || !zamanHazir || musaitOdalar.length === 0}
            value={efektifOdaId}
            onValueChange={(v) => setOdaId(v as string)}
            items={musaitOdalar.map((o) => ({ value: o.id, label: o.ad }))}
          >
            <SelectTrigger id="oda_id" className="w-full">
              <SelectValue
                placeholder={
                  !zamanHazir
                    ? "Önce tarih ve saat seçin"
                    : musaitlikYukleniyor
                      ? "Müsaitlik kontrol ediliyor…"
                      : musaitOdalar.length === 0
                        ? "Bu saatte müsait oda yok"
                        : "Oda seçin"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {musaitOdalar.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.ad}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
