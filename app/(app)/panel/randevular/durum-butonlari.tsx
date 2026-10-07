"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateForInput, formatTimeForInput } from "@/lib/datetime";
import { gecIptalMi, GEC_IPTAL_UYARISI } from "@/lib/randevu/gec-iptal";
import type { RandevuDurum, RandevuSatir } from "@/types/randevu";
import {
  randevuGelisIsaretle,
  randevuDurumGuncelle,
  randevuErtele,
  randevuIptalEt,
  randevuSeansiTamamla,
} from "./actions";

type Sonuc = { success: boolean; message: string } | null;

// Çizelgedeki kutucuk renkleriyle aynı (bkz. randevu-kutusu.tsx): geldi/gecikmeli
// yeşil, gelmedi/iptal kırmızı, ertelendi açık mavi.
// "!" (important) önekleri bilinçli — ODEME_TIPI_SECILI_SINIFI'yla aynı kanıtlanmış
// desen (bkz. odeme-tipi-secici.tsx): Button'ın variant="outline" sınıfları (Faz 2'de
// eklenen text-slate-700/hover:bg-background dahil) derlenmiş CSS'te bu renkli
// sınıflardan SONRA tanımlanıyor, "!" olmadan seçili buton renklenmiyordu (Faz 2
// doğrulamasında derlenmiş CSS byte-offset karşılaştırmasıyla gerçek bir risk olarak
// bulundu — CLAUDE.md'nin Ödeme Tipi'nde yaşanan aynı sınıf hatası).
const AKTIF_SINIFI: Partial<Record<RandevuDurum, string>> = {
  geldi: "!border-emerald-500 !bg-emerald-500 !text-white hover:!bg-emerald-600 dark:hover:!bg-emerald-500/90",
  gecikmeli_geldi: "!border-emerald-500 !bg-emerald-500 !text-white hover:!bg-emerald-600 dark:hover:!bg-emerald-500/90",
  gelmedi: "!border-destructive !bg-destructive !text-white hover:!bg-destructive/90",
  iptal: "!border-destructive !bg-destructive !text-white hover:!bg-destructive/90",
  ertelendi: "!border-sky-500 !bg-sky-500 !text-white hover:!bg-sky-600 dark:hover:!bg-sky-500/90",
  tamamlandi: "!border-violet-500 !bg-violet-500 !text-white hover:!bg-violet-600 dark:hover:!bg-violet-500/90",
};

const SECENEKLER: { durum: RandevuDurum; etiket: string }[] = [
  { durum: "geldi", etiket: "Geldi" },
  { durum: "gecikmeli_geldi", etiket: "Gecikmeli Geldi" },
  { durum: "gelmedi", etiket: "Gelmedi" },
  { durum: "ertelendi", etiket: "Ertelendi" },
  { durum: "iptal", etiket: "İptal" },
  { durum: "tamamlandi", etiket: "Seansı Bitir" },
];

const TEXTAREA_SINIFI =
  "rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Randevu sonucu seçenekleri (Geldi/Gecikmeli Geldi/Gelmedi/Ertelendi/İptal/
 * Seansı Bitir) — kullanıcı kararıyla (2026-10-07) bir seçenek tıklanınca
 * İŞLENMEZ, yalnız seçilir; işlem ancak "Kaydet"e basılınca uygulanır (önceden
 * İptal/Gelmedi tıklanır tıklanmaz kaydediliyordu). Randevunun MEVCUT durumu
 * ne olursa olsun hepsi seçilebilir (yanlış işaretlemeler düzeltilsin).
 * Başarıyla uygulanan seçenek çizelge kutucuğuyla aynı renge boyanır.
 *
 * İptal: başlangıca 18 saatten az kala ise "seansınız sayılacaktır" uyarısı,
 * zorunlu açıklama ve ek bir "Emin misiniz?" onayı çıkar (bkz. lib/randevu/gec-iptal.ts;
 * sunucu RPC'si de aynı eşiği ve onayı zorlar).
 */
export function DurumButonlari({ randevu }: { randevu: RandevuSatir }) {
  const [isPending, startTransition] = useTransition();
  const [sonuc, setSonuc] = useState<Sonuc>(null);
  const [secim, setSecim] = useState<RandevuDurum | null>(null);
  const [uygulanan, setUygulanan] = useState<RandevuDurum | null>(null);
  const [gecOnayiBekliyor, setGecOnayiBekliyor] = useState(false);
  const [gecikmeDakika, setGecikmeDakika] = useState("15");
  const [ertelemeTarih, setErtelemeTarih] = useState(() => formatDateForInput(randevu.baslangic));
  const [ertelemeSaat, setErtelemeSaat] = useState(() => formatTimeForInput(randevu.baslangic));
  const [tamamlaAciklama, setTamamlaAciklama] = useState("");
  const [iptalAciklama, setIptalAciklama] = useState("");

  // Panel açıldığı andaki saate göre; "Kaydet"te sunucu zaten yeniden hesaplar.
  const [gecIptal] = useState(() => gecIptalMi(randevu.baslangic));

  function sec(durum: RandevuDurum) {
    setSecim((s) => (s === durum ? null : durum));
    setGecOnayiBekliyor(false);
    setSonuc(null);
  }

  function butonSinifi(durum: RandevuDurum) {
    if (secim === durum) return "ring-2 ring-primary";
    if (uygulanan === durum && secim === null) return AKTIF_SINIFI[durum];
    return undefined;
  }

  function kaydetGecerli(): boolean {
    switch (secim) {
      case "gecikmeli_geldi":
        return Number(gecikmeDakika) > 0;
      case "ertelendi":
        return !!ertelemeTarih && !!ertelemeSaat;
      case "tamamlandi":
        return !!tamamlaAciklama.trim();
      case "iptal":
        return !gecIptal || !!iptalAciklama.trim();
      default:
        return secim !== null;
    }
  }

  function uygula(gecOnay: boolean) {
    if (!secim) return;
    const hedef = secim;
    let eylem: () => Promise<Sonuc>;
    switch (hedef) {
      case "geldi":
        eylem = () => randevuGelisIsaretle(randevu.id, null);
        break;
      case "gecikmeli_geldi":
        eylem = () => randevuGelisIsaretle(randevu.id, Number(gecikmeDakika));
        break;
      case "gelmedi":
        eylem = () => randevuDurumGuncelle(randevu.id, "gelmedi");
        break;
      case "ertelendi":
        eylem = () => {
          const formData = new FormData();
          formData.set("tarih", ertelemeTarih);
          formData.set("saat", ertelemeSaat);
          return randevuErtele(randevu.id, formData);
        };
        break;
      case "iptal":
        eylem = () => randevuIptalEt(randevu.id, iptalAciklama, gecOnay);
        break;
      case "tamamlandi":
        eylem = () => randevuSeansiTamamla(randevu.id, tamamlaAciklama.trim());
        break;
      default:
        return;
    }
    startTransition(async () => {
      const r = await eylem();
      setSonuc(r);
      setGecOnayiBekliyor(false);
      if (r?.success) {
        setUygulanan(hedef);
        setSecim(null);
      }
    });
  }

  function kaydetTiklandi() {
    if (secim === "iptal" && gecIptal) {
      setGecOnayiBekliyor(true);
      return;
    }
    uygula(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {SECENEKLER.map(({ durum, etiket }) => (
          <Button
            key={durum}
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            aria-pressed={secim === durum}
            className={cn(butonSinifi(durum))}
            onClick={() => sec(durum)}
          >
            {etiket}
          </Button>
        ))}
      </div>

      {secim === "gecikmeli_geldi" && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-2.5">
          <div className="flex flex-col gap-1">
            <Label htmlFor="gecikme_dakika">Gecikme (dk)</Label>
            <Input
              id="gecikme_dakika"
              type="number"
              min={1}
              value={gecikmeDakika}
              onChange={(e) => setGecikmeDakika(e.target.value)}
              className="w-24"
              disabled={isPending}
            />
          </div>
        </div>
      )}

      {secim === "ertelendi" && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-2.5">
          <div className="flex flex-col gap-1">
            <Label htmlFor="erteleme_tarih">Yeni tarih</Label>
            <Input
              id="erteleme_tarih"
              type="date"
              value={ertelemeTarih}
              onChange={(e) => setErtelemeTarih(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="erteleme_saat">Yeni saat</Label>
            <Input
              id="erteleme_saat"
              type="time"
              value={ertelemeSaat}
              onChange={(e) => setErtelemeSaat(e.target.value)}
              disabled={isPending}
            />
          </div>
        </div>
      )}

      {secim === "tamamlandi" && (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-2.5">
          <Label htmlFor="tamamla_aciklama">İşlem Açıklaması</Label>
          <textarea
            id="tamamla_aciklama"
            value={tamamlaAciklama}
            onChange={(e) => setTamamlaAciklama(e.target.value)}
            rows={2}
            required
            disabled={isPending}
            placeholder="Bu seansta yapılan işlemi kısaca açıklayın..."
            className={TEXTAREA_SINIFI}
          />
        </div>
      )}

      {secim === "iptal" && (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-2.5">
          {gecIptal && (
            <p role="status" className="rounded-lg bg-amber-500/10 px-2.5 py-2 text-sm text-amber-700 dark:text-amber-400">
              {GEC_IPTAL_UYARISI}
            </p>
          )}
          <Label htmlFor="iptal_aciklama">Açıklama{gecIptal ? "" : " (opsiyonel)"}</Label>
          <textarea
            id="iptal_aciklama"
            value={iptalAciklama}
            onChange={(e) => setIptalAciklama(e.target.value)}
            rows={2}
            disabled={isPending}
            placeholder="İptal sebebini yazın..."
            className={TEXTAREA_SINIFI}
          />
        </div>
      )}

      {secim && !gecOnayiBekliyor && (
        <Button type="button" size="sm" className="w-fit" disabled={isPending || !kaydetGecerli()} onClick={kaydetTiklandi}>
          {isPending ? "Kaydediliyor..." : "Kaydet"}
        </Button>
      )}

      {gecOnayiBekliyor && (
        <div role="alertdialog" className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-2.5 text-sm">
          <p className="font-medium">{GEC_IPTAL_UYARISI} Emin misiniz?</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="destructive" disabled={isPending} onClick={() => uygula(true)}>
              {isPending ? "İptal ediliyor..." : "Evet, iptal et"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => setGecOnayiBekliyor(false)}
            >
              Vazgeç
            </Button>
          </div>
        </div>
      )}

      {sonuc && (
        <p role="alert" className={sonuc.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>
          {sonuc.message}
        </p>
      )}
    </div>
  );
}
