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
import type { SecenekSatir } from "@/types/randevu";
import { HAFTANIN_GUNLERI } from "@/types/periyodik-randevu";
import { periyodikRandevuOlustur } from "./actions";
import { HastaArama } from "./hasta-arama";
import { KayitliPaketler } from "./kayitli-paketler";

type Props = {
  hastalar: SecenekSatir[];
  terapistler: SecenekSatir[];
  odalar: SecenekSatir[];
  cihazlar: SecenekSatir[];
  tedaviler: SecenekSatir[];
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
  cihazlar,
  tedaviler,
  onBasarili,
  sabitHasta,
}: Props) {
  const [durum, formAction, isPending] = useActionState(periyodikRandevuOlustur, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);
  const [hastaId, setHastaId] = useState(sabitHasta?.id ?? "");
  const [islemTanimiId, setIslemTanimiId] = useState("");
  const [gunler, setGunler] = useState<GunSaat[]>([{ gun: "1", saat: "" }]);

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
          onSec={setIslemTanimiId}
          disabled={isPending}
        />

        <div className="flex flex-col gap-2">
          <Label htmlFor="periyodik_terapist_id">Dr / Terapist</Label>
          <Select
            name="terapist_id"
            required
            disabled={isPending}
            items={terapistler.map((t) => ({ value: t.id, label: t.ad }))}
          >
            <SelectTrigger id="periyodik_terapist_id" className="w-full">
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

        <div className="flex flex-col gap-2">
          <Label htmlFor="periyodik_oda_id">Oda</Label>
          <Select
            name="oda_id"
            required
            disabled={isPending}
            items={odalar.map((o) => ({ value: o.id, label: o.ad }))}
          >
            <SelectTrigger id="periyodik_oda_id" className="w-full">
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
          <Label htmlFor="periyodik_islem_tanimi_id">Tedavi</Label>
          <Select
            name="islem_tanimi_id"
            required
            disabled={isPending}
            value={islemTanimiId}
            onValueChange={(v) => setIslemTanimiId(v as string)}
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

        <div className="flex flex-col gap-2">
          <Label htmlFor="periyodik_cihaz_id">Cihaz (opsiyonel)</Label>
          <Select
            name="cihaz_id"
            disabled={isPending || cihazlar.length === 0}
            items={cihazlar.map((c) => ({ value: c.id, label: c.ad }))}
          >
            <SelectTrigger id="periyodik_cihaz_id" className="w-full">
              <SelectValue placeholder={cihazlar.length === 0 ? "Kayıtlı cihaz yok" : "Cihaz seçin"} />
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
          <Label>Gün ve Saatler</Label>
          <div className="flex flex-col gap-2">
            {gunler.map((g, i) => (
              <div key={i} className="grid grid-cols-2 gap-2">
                <Select
                  required
                  disabled={isPending}
                  value={g.gun}
                  onValueChange={(v) => gunSatiriGuncelle(i, { gun: v as string })}
                  items={HAFTANIN_GUNLERI}
                >
                  <SelectTrigger className="w-full">
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
                <Input
                  type="time"
                  required
                  disabled={isPending}
                  value={g.saat}
                  onChange={(e) => gunSatiriGuncelle(i, { saat: e.target.value })}
                />
              </div>
            ))}
          </div>
          <input type="hidden" name="gunler_json" value={JSON.stringify(gunler)} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="periyodik_sure_dakika">Süre (dakika)</Label>
          <Input
            id="periyodik_sure_dakika"
            name="sure_dakika"
            type="number"
            min={5}
            max={480}
            defaultValue={30}
            required
            disabled={isPending}
          />
        </div>
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

      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? "Oluşturuluyor..." : "Periyodik randevu oluştur"}
      </Button>
    </form>
  );
}
