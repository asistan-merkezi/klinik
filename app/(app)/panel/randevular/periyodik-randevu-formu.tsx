"use client";

import { useActionState, useState } from "react";
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
import type { SecenekSatir, TedaviSecenekSatir, TerapistSecenekSatir } from "@/types/randevu";
import { HAFTANIN_GUNLERI } from "@/types/periyodik-randevu";
import { periyodikRandevuOlustur } from "./actions";
import { HastaArama } from "./hasta-arama";
import { formatDateForInput } from "@/lib/datetime";
import { useMesgulAraliklar } from "./queries";
import { gelecekteMi, gunEkleStr, saatAdaylari, saatMusaitMi } from "@/lib/randevu/musait-saatler";
import { KayitliPaketler } from "./kayitli-paketler";

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
};

type GunSaat = { gun: string; saat: string };

const GUN_SAYISI_SECENEKLERI = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
  value: String(n),
  label: n === 1 ? "Haftada 1 gün" : `Haftada ${n} gün`,
}));

export function PeriyodikRandevuFormu({
  hastalar,
  terapistler,
  odalar,
  tedaviler,
  onBasarili,
  sabitHasta,
}: Props) {
  const [durum, formAction, isPending] = useActionState(periyodikRandevuOlustur, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);
  const [hastaId, setHastaId] = useState(sabitHasta?.id ?? "");
  const [islemTanimiId, setIslemTanimiId] = useState("");
  const [terapistId, setTerapistId] = useState("");
  const [odaId, setOdaId] = useState("");
  const [gunler, setGunler] = useState<GunSaat[]>([{ gun: "1", saat: "" }]);

  const seciliTedavi = tedaviler.find((t) => t.id === islemTanimiId);
  const pozisyonaUygunTerapistler =
    seciliTedavi && seciliTedavi.pozisyon_idleri.length > 0
      ? terapistler.filter((t) => t.pozisyon_id && seciliTedavi.pozisyon_idleri.includes(t.pozisyon_id))
      : terapistler;

  // Toplam süre tedavi tanımından gelir (bkz. randevu-formu.tsx); kullanıcıdan alınmaz.
  const adimToplami = (seciliTedavi?.adimlar ?? []).reduce((t, a) => t + (a.sure_dakika ?? 0), 0);
  const toplamSure = seciliTedavi?.sure_dakika ?? (adimToplami > 0 ? adimToplami : 30);

  // Sıra: Gün(ler) → Terapist → Oda → her gün için müsait saat (Tek Randevu ile
  // aynı akış). Müsaitlik her günün İLK gerçekleşecek tarihine göre hesaplanır:
  // o haftanın günü bugünse ve saat geçmişse seri gelecek haftadan başlar
  // (action geçmiş adayları atlar), o tarihe bakılır. Sonraki dolu haftalar
  // action'da zaten atlanıp WhatsApp linkiyle raporlanır.
  const gunlerHazir = Boolean(islemTanimiId);
  const efektifTerapistId = pozisyonaUygunTerapistler.some((t) => t.id === terapistId) ? terapistId : "";
  const efektifOdaId = odalar.some((o) => o.id === odaId) ? odaId : "";
  const saatlerHazir = Boolean(gunlerHazir && efektifTerapistId && efektifOdaId);
  const adimlar = seciliTedavi?.adimlar ?? [];
  const ilkTarihler = gunler.map((g) => sonrakiTarih(Number(g.gun)));
  const aralikBas = [...ilkTarihler].sort()[0] ?? "";
  const aralikBit = aralikBas ? gunEkleStr([...ilkTarihler].sort().at(-1)!, 7) : "";
  const { data: mesgul, isLoading: musaitlikYukleniyor } = useMesgulAraliklar(
    saatlerHazir ? aralikBas : "",
    saatlerHazir ? aralikBit : "",
    efektifTerapistId,
    efektifOdaId,
    adimlar.flatMap((a) => (a.cihaz_id ? [a.cihaz_id] : []))
  );
  const satirMusaitSaatleri = gunler.map((g, i) => {
    if (!saatlerHazir || !mesgul) return [];
    const ilk = ilkTarihler[i];
    // Aynı gün başka satırda seçilmiş saat tekrar seçilemez (action da reddeder).
    const digerSecimler = new Set(gunler.filter((d, j) => j !== i && d.gun === g.gun).map((d) => d.saat));
    return saatAdaylari().filter((s) => {
      if (digerSecimler.has(s)) return false;
      const tarih = gelecekteMi(ilk, s) ? ilk : gunEkleStr(ilk, 7);
      return saatMusaitMi(tarih, s, toplamSure, adimlar, mesgul);
    });
  });
  // Seçili saat, terapist/oda/gün değişince dolu hâle gelirse sessizce sıfırlanır.
  const efektifGunler = gunler.map((g, i) => ({
    gun: g.gun,
    saat: satirMusaitSaatleri[i].includes(g.saat) ? g.saat : "",
  }));
  const tumSaatlerSecili = efektifGunler.every((g) => g.saat !== "");

  function tedaviSec(id: string) {
    setIslemTanimiId(id);
  }

  function gunSayisiDegisti(deger: string) {
    const n = Number(deger);
    setGunler((mevcut) => {
      if (n <= mevcut.length) return mevcut.slice(0, n);
      const eklenecek = Array.from({ length: n - mevcut.length }, () => ({ gun: "1", saat: "" }));
      return [...mevcut, ...eklenecek];
    });
  }

  function gunSatiriGuncelle(index: number, degisiklik: Partial<GunSaat>) {
    setGunler((mevcut) => mevcut.map((g, i) => (i === index ? { ...g, ...degisiklik } : g)));
  }

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      onBasarili?.();
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Seçilen gün(ler) + saat(ler)de ileriye dönük 5 aylık randevular tek seferde oluşturulur (haftada
        birden fazla gün seçilirse her gün için ayrı bir seri açılır, Hasta Detay&apos;da ayrı ayrı yönetilebilir).
        Bir günün saati doluysa o hafta atlanır ve hastaya WhatsApp&apos;tan saat değişikliği için mesaj linki
        hazırlanır. Süre bitimine 2 hafta kala Hasta Detay sayfasında uyarı çıkar; oradan uzatılabilir,
        gün/saati değiştirilebilir veya iptal edilebilir.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="periyodik_hasta_arama">Hasta</Label>
          {sabitHasta ? (
            <>
              <Input value={sabitHasta.ad} disabled readOnly />
              <input type="hidden" name="hasta_id" value={sabitHasta.id} />
            </>
          ) : (
            <HastaArama
              id="periyodik_hasta_arama"
              hastalar={hastalar}
              required
              disabled={isPending}
              onSecim={(h) => setHastaId(h.id)}
              onTemizle={() => setHastaId("")}
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
          <Label htmlFor="periyodik_islem_tanimi_id">Tedavi</Label>
          <Select
            name="islem_tanimi_id"
            required
            disabled={isPending}
            value={islemTanimiId}
            onValueChange={(v) => tedaviSec(v as string)}
            items={tedaviler.map((t) => ({ value: t.id, label: t.ad }))}
          >
            <SelectTrigger id="periyodik_islem_tanimi_id" className="w-full">
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
          <Label htmlFor="periyodik_gun_sayisi">Haftada Kaç Gün</Label>
          <Select
            required
            disabled={isPending}
            value={String(gunler.length)}
            onValueChange={(v) => gunSayisiDegisti(v as string)}
            items={GUN_SAYISI_SECENEKLERI}
          >
            <SelectTrigger id="periyodik_gun_sayisi" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GUN_SAYISI_SECENEKLERI.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label>Günler</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {gunler.map((g, i) => (
              <Select
                key={i}
                required
                disabled={isPending}
                value={g.gun}
                onValueChange={(v) => gunSatiriGuncelle(i, { gun: v as string })}
                items={HAFTANIN_GUNLERI}
              >
                <SelectTrigger className="w-full" aria-label={`${i + 1}. gün`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HAFTANIN_GUNLERI.map((gg) => (
                    <SelectItem key={gg.value} value={gg.value}>
                      {gg.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ))}
          </div>
          <input type="hidden" name="gunler_json" value={JSON.stringify(efektifGunler)} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="periyodik_terapist_id">Dr / Terapist</Label>
          <Select
            name="terapist_id"
            required
            disabled={isPending || !gunlerHazir || pozisyonaUygunTerapistler.length === 0}
            value={efektifTerapistId}
            onValueChange={(v) => setTerapistId(v as string)}
            items={pozisyonaUygunTerapistler.map((t) => ({ value: t.id, label: t.ad }))}
          >
            <SelectTrigger id="periyodik_terapist_id" className="w-full">
              <SelectValue
                placeholder={
                  !islemTanimiId
                    ? "Önce tedavi seçin"
                    : pozisyonaUygunTerapistler.length === 0
                      ? "Uygun personel yok"
                      : "Dr / Terapist seçin"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {pozisyonaUygunTerapistler.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.ad}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="periyodik_oda_id">Oda</Label>
          <Select
            name="oda_id"
            required
            disabled={isPending || !efektifTerapistId || odalar.length === 0}
            value={efektifOdaId}
            onValueChange={(v) => setOdaId(v as string)}
            items={odalar.map((o) => ({ value: o.id, label: o.ad }))}
          >
            <SelectTrigger id="periyodik_oda_id" className="w-full">
              <SelectValue placeholder={!efektifTerapistId ? "Önce terapist seçin" : "Oda seçin"} />
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

        <div className="flex flex-col gap-3 sm:col-span-2">
          <Label>Saatler</Label>
          {!saatlerHazir ? (
            <p className="text-sm text-muted-foreground">Müsait saatleri görmek için gün, terapist ve oda seçin.</p>
          ) : musaitlikYukleniyor ? (
            <p className="text-sm text-muted-foreground">Müsait saatler kontrol ediliyor…</p>
          ) : (
            gunler.map((g, i) => {
              const gunAdi = HAFTANIN_GUNLERI.find((gg) => gg.value === g.gun)?.label ?? "";
              const saatler = satirMusaitSaatleri[i];
              return (
                <div key={i} className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">{gunAdi}</span>
                  {saatler.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Bu gün için müsait saat yok.</p>
                  ) : (
                    <div role="radiogroup" aria-label={`${gunAdi} müsait saatler`} className="flex flex-wrap gap-2">
                      {saatler.map((s) => (
                        <Button
                          key={s}
                          type="button"
                          role="radio"
                          aria-checked={efektifGunler[i].saat === s}
                          variant={efektifGunler[i].saat === s ? "default" : "outline"}
                          size="sm"
                          disabled={isPending}
                          onClick={() => gunSatiriGuncelle(i, { saat: s })}
                          className="tabular"
                        >
                          {s}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <input type="hidden" name="sure_dakika" value={toplamSure} />
      </div>

      {durum && (
        <div className="flex flex-col gap-2">
          <p
            role="alert"
            className={`text-sm ${durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}
          >
            {durum.message}
          </p>
          {durum.cakismalar && durum.cakismalar.length > 0 && (
            <ul className="flex flex-col gap-1.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950">
              {durum.cakismalar.map((c) => (
                <li key={c.tarihEtiketi} className="flex items-center justify-between gap-2">
                  <span>{c.tarihEtiketi}</span>
                  <a
                    href={c.whatsappLink}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-emerald-700 underline dark:text-emerald-400"
                  >
                    WhatsApp&apos;tan Gönder
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Button type="submit" disabled={isPending || !tumSaatlerSecili} className="w-fit">
        {isPending ? "Oluşturuluyor..." : "Periyodik randevu oluştur"}
      </Button>
    </form>
  );
}

/** Bugünden (İstanbul) itibaren verilen haftanın gününe (0=Pazar) denk gelen ilk tarih, "yyyy-MM-dd". */
function sonrakiTarih(haftaninGunu: number): string {
  const bugun = formatDateForInput(new Date().toISOString());
  const d = new Date(`${bugun}T00:00:00Z`);
  const fark = (haftaninGunu - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + fark);
  return d.toISOString().slice(0, 10);
}
