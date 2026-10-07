"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PackageOpen, Pencil, Wallet } from "lucide-react";
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

/**
 * Seans bilgisi: tedavi/cihaz sabit (randevu o bilgilerle oluştu), ama anlık
 * terapist ya da oda değişimi olabilir — düzenle ikonuyla yalnız bu ikisi açılır.
 */
function SeansBilgisiKutusu({
  randevu,
  terapistler,
  odalar,
  tedaviler,
  disabled,
}: {
  randevu: RandevuSatir;
  terapistler: SecenekSatir[];
  odalar: SecenekSatir[];
  tedaviler: SecenekSatir[];
  disabled: boolean;
}) {
  const [duzenle, setDuzenle] = useState(false);

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-muted/30 p-3.5 text-sm sm:col-span-2">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Seans Bilgisi</p>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={duzenle ? "Düzenlemeyi kapat" : "Terapist/oda düzenle"}
          aria-pressed={duzenle}
          onClick={() => setDuzenle((d) => !d)}
        >
          <Pencil />
        </Button>
      </div>

      {duzenle ? (
        <>
          <div className="flex flex-col gap-1">
            <Label htmlFor="detay_terapist_id">Dr / Terapist</Label>
            <Select
              name="terapist_id"
              required
              disabled={disabled}
              defaultValue={randevu.terapist_id}
              items={terapistler.map((t) => ({ value: t.id, label: t.ad }))}
            >
              <SelectTrigger id="detay_terapist_id" className="w-full">
                <SelectValue placeholder="Dr / Terapist seçin" />
              </SelectTrigger>
              <SelectContent>
                {terapistler.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.ad}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="detay_oda_id">Oda</Label>
            <Select
              name="oda_id"
              required
              disabled={disabled}
              defaultValue={randevu.oda_id}
              items={odalar.map((o) => ({ value: o.id, label: o.ad }))}
            >
              <SelectTrigger id="detay_oda_id" className="w-full">
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
        </>
      ) : (
        <>
          <input type="hidden" name="terapist_id" value={randevu.terapist_id} />
          <input type="hidden" name="oda_id" value={randevu.oda_id} />
          <div className="grid grid-cols-[110px_1fr] gap-2">
            <span className="font-medium text-muted-foreground">Dr / Terapist:</span>
            <span>{terapistler.find((t) => t.id === randevu.terapist_id)?.ad ?? "—"}</span>
          </div>
          <div className="grid grid-cols-[110px_1fr] gap-2">
            <span className="font-medium text-muted-foreground">Oda:</span>
            <span>{odalar.find((o) => o.id === randevu.oda_id)?.ad ?? "—"}</span>
          </div>
        </>
      )}

      <div className="grid grid-cols-[110px_1fr] gap-2">
        <span className="font-medium text-muted-foreground">Tarih / Saat:</span>
        <span className="tabular">
          {formatDateForInput(randevu.baslangic).split("-").reverse().join(".")} · {formatTimeForInput(randevu.baslangic)}
        </span>
      </div>
      <div className="grid grid-cols-[110px_1fr] gap-2">
        <span className="font-medium text-muted-foreground">Tedavi:</span>
        <span>{tedaviler.find((t) => t.id === randevu.islem_tanimi?.id)?.ad ?? randevu.islem_tanimi?.ad ?? "—"}</span>
      </div>
      <TedaviAdimlari islemTanimiId={randevu.islem_tanimi?.id ?? ""} />
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
            <input type="hidden" name="islem_tanimi_id" value={randevu.islem_tanimi?.id ?? ""} />
            <input type="hidden" name="cihaz_id" value={randevu.cihaz_id ?? ""} />
            <SeansBilgisiKutusu randevu={randevu} terapistler={terapistler} odalar={odalar} tedaviler={tedaviler} disabled={isPending} />

            <input type="hidden" name="tarih" value={formatDateForInput(randevu.baslangic)} />
            <input type="hidden" name="saat" value={formatTimeForInput(randevu.baslangic)} />
            <input type="hidden" name="sure_dakika" value={sureDakika(randevu.baslangic, randevu.bitis)} />
          </div>

          {/* Tanı/antrenör/protokol başka ekranlarda yönetiliyor; kayıtta değerler korunur. */}
          <input type="hidden" name="tani" value={randevu.tani ?? ""} />
          <input type="hidden" name="antrenor_id" value={randevu.antrenor_id ?? ""} />
          <input type="hidden" name="tedavi_protokolu_id" value={randevu.tedavi_protokolu_id ?? ""} />

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
