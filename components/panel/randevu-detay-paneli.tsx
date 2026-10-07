"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { PackageOpen, Wallet } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { DURUM_TONU_SINIFLARI } from "@/lib/ui/durum-tonlari";
import { paketYenilemeGerekliMi } from "@/lib/paket/yenileme-esigi";
import { formatDateForInput, formatDateTime, formatTimeForInput } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/client";
import type { RandevuSatir, SecenekSatir } from "@/types/randevu";
import type { KlinikBankaHesabi } from "@/types/klinik";
import { randevuGuncelle, randevuSeansBedeliniCariyeEkle } from "@/app/(app)/panel/randevular/actions";
import { DurumButonlari } from "@/app/(app)/panel/randevular/durum-butonlari";
import { BakiyeHareketiEkleButonu } from "@/app/(app)/panel/hastalar/[id]/bakiye-hareketi-formu";
import { useTedaviEtkinFiyat } from "@/app/(app)/panel/randevular/queries";

const paraFormat = (tutar: number) => tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

function sureDakika(baslangic: string, bitis: string) {
  return Math.round((new Date(bitis).getTime() - new Date(baslangic).getTime()) / 60_000);
}

/**
 * 2026-09-27'den beri (kullanıcı kararı) check-in artık bakiyeye hiç
 * dokunmuyor — paketsiz bir seansın bedeli YALNIZ burada, "Cariye Ekle" ya da
 * "Ödeme Ekle" tıklanınca bakiyeye yazılır (bkz. randevu_seans_bedelini_isle,
 * migration 20260927150000). "Cariye Ekle" bedeli borç olarak yazıp ödemesiz
 * bırakır ("şimdi tahsil etmedim"); "Ödeme Ekle" aynı borcu yazıp üstüne
 * girilen tutarı ödeme olarak da işler ("şimdi tahsil ettim") — ikisi de aynı
 * RPC'yi çağırır (bkz. bakiye-hareketi-formu.tsx'teki randevuId dallanması).
 *
 * Bu randevu için daha önce (bu ekrandan ya da eski check-in akışından) zaten
 * bir borç satırı yazılmışsa kart baştan "İşlem kapanmıştır" gösterir — artık
 * yalnız diyalog state'i değil, randevu.hasta_bakiye_hareket'ten (bkz.
 * randevu-kutusu.tsx'teki aynı sinyal) türeyen KALICI bir durum.
 */
function OdemeVeyaCariKarti({
  randevu,
  bankaHesaplari,
  onSeansBedeliIslendi,
}: {
  randevu: RandevuSatir;
  bankaHesaplari: KlinikBankaHesabi[];
  /**
   * Cariye Ekle/Ödeme Ekle başarıyla tamamlanınca çağrılır — Randevu
   * Çizelgesi'nin (CanliCizelge) elindeki randevu listesini ve o an açık
   * seçili randevuyu, sayfa yenilenmeden ("hasta_bakiye_hareket" değişikliği
   * realtime'da izlenmediği için, bkz. lib/randevu/queries.ts RANDEVU_SELECT
   * notu) optimistik olarak günceller — aksi halde dialog kapanıp yeniden
   * açıldığında ya da kutu renginde işlem "yapılmamış" gibi görünür.
   */
  onSeansBedeliIslendi?: (randevuId: string) => void;
}) {
  const hastaId = randevu.hasta_id ?? "";
  const zatenIslendi = (randevu.hasta_bakiye_hareket ?? []).some((h) => h.tur === "borc");
  const [hesapKapandi, setHesapKapandi] = useState(zatenIslendi);
  const [hata, setHata] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { data: tedaviBedeli } = useTedaviEtkinFiyat(randevu.islem_tanimi?.id ?? "", hastaId);

  // Kart açılınca tek satır; önceden toplu çekilmez.
  const { data: bakiyeVerisi } = useQuery({
    queryKey: ["hasta-guncel-bakiye", hastaId],
    queryFn: async () => {
      const { data } = await createClient()
        .from("v_hasta_ozet")
        .select("bakiye")
        .eq("hasta_id", hastaId)
        .maybeSingle<{ bakiye: number }>();
      return data?.bakiye ?? 0;
    },
    staleTime: 0,
    gcTime: 0,
  });
  const guncelBakiye = bakiyeVerisi ?? null;

  function cariyeEkle() {
    setHata(null);
    startTransition(async () => {
      const sonuc = await randevuSeansBedeliniCariyeEkle(randevu.id);
      if (sonuc?.success) {
        setHesapKapandi(true);
        onSeansBedeliIslendi?.(randevu.id);
      } else {
        setHata(sonuc?.message ?? "İşlem yapılamadı, lütfen tekrar deneyin.");
      }
    });
  }

  if (hesapKapandi) {
    return <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">İşlem kapanmıştır.</p>;
  }

  if (guncelBakiye === null) {
    return <p className="text-sm text-muted-foreground">Bakiye yükleniyor...</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {tedaviBedeli != null && (
        <p className="text-sm text-muted-foreground">Tedavi bedeli: {paraFormat(tedaviBedeli)}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <BakiyeHareketiEkleButonu
          hastaId={hastaId}
          hastaAdSoyad={randevu.hasta?.ad_soyad ?? ""}
          bankaHesaplari={bankaHesaplari}
          guncelBakiye={guncelBakiye}
          randevuId={randevu.id}
          onBasarili={() => {
            setHesapKapandi(true);
            onSeansBedeliIslendi?.(randevu.id);
          }}
        />
        <Button type="button" size="sm" variant="clinical" disabled={isPending} onClick={cariyeEkle}>
          <Wallet />
          {isPending ? "Ekleniyor..." : "Cariye Ekle"}
        </Button>
      </div>
      {hata && (
        <p role="alert" className="text-sm text-destructive">
          {hata}
        </p>
      )}
    </div>
  );
}

type TedaviAdimi = { id: string; ad: string; sure_dakika: number | null; cihaz: { ad: string } | null };

/** Randevudaki tedavinin yapılacak işlem adımları (sırayla) — salt-okunur. */
function TedaviAdimlari({ islemTanimiId }: { islemTanimiId: string }) {
  const { data: adimlar, isLoading } = useQuery({
    queryKey: ["randevu-tedavi-adimlari", islemTanimiId],
    enabled: !!islemTanimiId,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("islem_tanimi_adim")
        .select("id, ad, sure_dakika, cihaz:gerekli_cihaz_id(ad)")
        .eq("islem_tanimi_id", islemTanimiId)
        .order("sira", { ascending: true })
        .returns<TedaviAdimi[]>();
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="mt-1 border-t border-border pt-2">
      <p className="mb-1 font-medium text-muted-foreground">Tedavi Bilgileri</p>
      {isLoading ? (
        <p className="text-muted-foreground">Yükleniyor...</p>
      ) : !adimlar || adimlar.length === 0 ? (
        <p className="text-muted-foreground">Tanımlı işlem adımı yok.</p>
      ) : (
        <ol className="flex list-decimal flex-col gap-0.5 pl-5">
          {adimlar.map((a) => (
            <li key={a.id}>
              {a.ad}
              <span className="tabular text-muted-foreground">
                {a.sure_dakika ? ` · ${a.sure_dakika} dk` : ""}
                {a.cihaz?.ad ? ` · ${a.cihaz.ad}` : ""}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function RandevuDetayPaneli({
  open,
  onOpenChange,
  randevu,
  terapistler,
  odalar,
  tedaviler,
  antrenorler,
  protokoller,
  bankaHesaplari = [],
  rol = null,
  onSeansBedeliIslendi,
}: {
  open: boolean;
  onOpenChange: (acik: boolean) => void;
  randevu: RandevuSatir | null;
  terapistler: SecenekSatir[];
  odalar: SecenekSatir[];
  cihazlar: SecenekSatir[];
  tedaviler: SecenekSatir[];
  antrenorler: SecenekSatir[];
  protokoller: SecenekSatir[];
  /** Tamamlanan seans özetindeki "Ödeme Ekle" kartı için. */
  bankaHesaplari?: KlinikBankaHesabi[];
  /** Ödeme Ekle kartı yalnız klinik_admin/resepsiyon'a gösterilir — Cari & Ödeme'yle aynı yetki. */
  rol?: string | null;
  /** bkz. OdemeVeyaCariKarti'ndeki aynı isimli prop açıklaması. */
  onSeansBedeliIslendi?: (randevuId: string) => void;
}) {
  const guncelleAction = randevuGuncelle.bind(null, randevu?.id ?? "");
  const [durum, formAction, isPending] = useActionState(guncelleAction, null);

  // onOpenChange render SIRASINDA değil, durum gerçekten değiştiğinde (yeni
  // bir submit sonucu) çağrılmalı — render sırasında başka bir bileşenin
  // (CanliCizelge) state'ini güncellemek React'ta izin verilmeyen bir örüntü
  // ("Cannot update a component while rendering a different component") ve
  // prod build'de sessizce diyaloğun hiç kapanmamasına yol açıyordu (dev'de
  // konsol uyarısı üretiyor ama build'de uyarılar elenip davranış bozuk
  // kalıyor).
  useEffect(() => {
    if (durum?.success) {
      onOpenChange(false);
    }
  }, [durum, onOpenChange]);

  if (!randevu) {
    return null;
  }

  // Seans tamamlandıktan sonra Geldi/Gelmedi/Ertele gibi durum seçenekleri ve
  // Tedavi & Anamnez'de zaten yönetilen alanlar (Tanı, Terapist, vb.) burada
  // hiç gösterilmez — kullanıcı kararı, tamamlanmış bir seans için bu ekran
  // salt-okunur bir özet olmalı.
  if (randevu.durum === "tamamlandi") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{randevu.hasta?.ad_soyad ?? "—"}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-muted/30 p-3.5 text-sm">
            <div className="grid grid-cols-[110px_1fr] gap-2">
              <span className="font-medium text-muted-foreground">Seans Bitişi:</span>
              <span>{randevu.tamamlanma_tarihi ? formatDateTime(randevu.tamamlanma_tarihi) : "—"}</span>
            </div>
            <div className="grid grid-cols-[110px_1fr] gap-2">
              <span className="font-medium text-muted-foreground">Bitiren:</span>
              <span>{randevu.tamamlayan_kullanici?.ad_soyad ?? "—"}</span>
            </div>
            <div className="grid grid-cols-[110px_1fr] gap-2">
              <span className="font-medium text-muted-foreground">Not:</span>
              <span>{randevu.tamamlanma_aciklamasi ?? "—"}</span>
            </div>
          </div>

          {randevu.paket_satis_id ? (
            <>
              <p className="text-sm font-medium text-muted-foreground">Paketten düşülmüştür.</p>
              {paketYenilemeGerekliMi(randevu.paket_satis?.kalan_adet) && (
                <div
                  role="status"
                  className={`flex items-start gap-2.5 rounded-xl p-3.5 text-sm ${DURUM_TONU_SINIFLARI.amber}`}
                >
                  <PackageOpen className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <p>
                    <span className="font-semibold">Paket bitmek üzere:</span>{" "}
                    {randevu.paket_satis?.paket?.ad ?? "Paket"} paketinde{" "}
                    <span className="tabular font-semibold">{randevu.paket_satis?.kalan_adet}</span> seans kaldı. Hastaya
                    yeni randevu/paket yenileme önerin.
                  </p>
                </div>
              )}
            </>
          ) : (
            (rol === "klinik_admin" || rol === "resepsiyon") &&
            randevu.hasta_id && (
              <OdemeVeyaCariKarti
                key={randevu.id}
                randevu={randevu}
                bankaHesaplari={bankaHesaplari}
                onSeansBedeliIslendi={onSeansBedeliIslendi}
              />
            )
          )}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{randevu.hasta?.ad_soyad ?? "—"}</DialogTitle>
        </DialogHeader>

        <DurumButonlari randevu={randevu} />

        <form key={randevu.id} action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="hasta_id" value={randevu.hasta_id ?? ""} />

          <div className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="terapist_id" value={randevu.terapist_id} />
            <input type="hidden" name="oda_id" value={randevu.oda_id} />
            <input type="hidden" name="islem_tanimi_id" value={randevu.islem_tanimi?.id ?? ""} />
            <input type="hidden" name="cihaz_id" value={randevu.cihaz_id ?? ""} />

            <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-muted/30 p-3.5 text-sm sm:col-span-2">
              <div className="grid grid-cols-[110px_1fr] gap-2">
                <span className="font-medium text-muted-foreground">Dr / Terapist:</span>
                <span>{terapistler.find((t) => t.id === randevu.terapist_id)?.ad ?? "—"}</span>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-2">
                <span className="font-medium text-muted-foreground">Oda:</span>
                <span>{odalar.find((o) => o.id === randevu.oda_id)?.ad ?? "—"}</span>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-2">
                <span className="font-medium text-muted-foreground">Tedavi:</span>
                <span>{tedaviler.find((t) => t.id === randevu.islem_tanimi?.id)?.ad ?? randevu.islem_tanimi?.ad ?? "—"}</span>
              </div>
              <TedaviAdimlari islemTanimiId={randevu.islem_tanimi?.id ?? ""} />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="detay_tarih">Tarih</Label>
              <Input
                id="detay_tarih"
                name="tarih"
                type="date"
                defaultValue={formatDateForInput(randevu.baslangic)}
                required
                disabled={isPending}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="detay_saat">Saat</Label>
              <Input
                id="detay_saat"
                name="saat"
                type="time"
                defaultValue={formatTimeForInput(randevu.baslangic)}
                required
                disabled={isPending}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="detay_sure_dakika">Süre (dakika)</Label>
              <Input
                id="detay_sure_dakika"
                name="sure_dakika"
                type="number"
                min={5}
                max={480}
                defaultValue={sureDakika(randevu.baslangic, randevu.bitis)}
                required
                disabled={isPending}
              />
            </div>
          </div>

          <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1 sm:col-span-2">
              <Label htmlFor="detay_tani">Tanı (opsiyonel)</Label>
              <Input
                id="detay_tani"
                name="tani"
                defaultValue={randevu.tani ?? ""}
                disabled={isPending}
                placeholder="Örn. Sol omuz problemi"
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="detay_antrenor_id">Antrenör (opsiyonel)</Label>
              <Select
                name="antrenor_id"
                disabled={isPending || antrenorler.length === 0}
                defaultValue={randevu.antrenor_id ?? undefined}
                items={antrenorler.map((a) => ({ value: a.id, label: a.ad }))}
              >
                <SelectTrigger id="detay_antrenor_id" className="w-full">
                  <SelectValue placeholder={antrenorler.length === 0 ? "Kayıtlı personel yok" : "Antrenör seçin"} />
                </SelectTrigger>
                <SelectContent>
                  {antrenorler.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.ad}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="detay_tedavi_protokolu_id">Tedavi Protokolü (opsiyonel)</Label>
              <Select
                name="tedavi_protokolu_id"
                disabled={isPending || protokoller.length === 0}
                defaultValue={randevu.tedavi_protokolu_id ?? undefined}
                items={protokoller.map((p) => ({ value: p.id, label: p.ad }))}
              >
                <SelectTrigger id="detay_tedavi_protokolu_id" className="w-full">
                  <SelectValue placeholder={protokoller.length === 0 ? "Kayıtlı protokol yok" : "Protokol seçin"} />
                </SelectTrigger>
                <SelectContent>
                  {protokoller.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.ad}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {durum && (
            <p role="alert" className={durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>
              {durum.message}
            </p>
          )}

          <Button type="submit" size="sm" disabled={isPending} className="w-fit">
            {isPending ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
