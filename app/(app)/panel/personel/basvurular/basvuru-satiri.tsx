"use client";

import { useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDateTime, formatDate } from "@/lib/datetime";
import { cn, telefonGoster } from "@/lib/utils";
import type { BasvuruDurum, IsBasvurusu } from "@/types/personel";
import { PersonelFormu } from "../personel-formu";
import { basvuruDurumGuncelle } from "./actions";

const DURUM_ETIKET: Record<BasvuruDurum, string> = {
  beklemede: "Beklemede",
  olumlu: "Olumlu",
  olumsuz: "Olumsuz",
};

const DURUM_TON: Record<BasvuruDurum, StatusTone> = {
  beklemede: "amber",
  olumlu: "emerald",
  olumsuz: "rose",
};

const CALISMA_SEKLI_ETIKET: Record<string, string> = {
  tam_zamanli: "Tam Zamanlı",
  yari_zamanli: "Yarı Zamanlı",
};

export function BasvuruSatiri({ basvuru }: { basvuru: IsBasvurusu }) {
  const [pending, startTransition] = useTransition();
  const [yerelDurum, setYerelDurum] = useState<BasvuruDurum>(basvuru.durum);
  const [aktarildi, setAktarildi] = useState(false);
  const [acik, setAcik] = useState(false);
  const [onaylaDialogAcik, setOnaylaDialogAcik] = useState(false);

  function guncelle(durum: "beklemede" | "olumsuz") {
    startTransition(async () => {
      const r = await basvuruDurumGuncelle(basvuru.id, durum);
      if (r?.success) setYerelDurum(durum);
    });
  }

  const detaySatirlari = [
    basvuru.eposta && ["E-posta", basvuru.eposta],
    basvuru.dogum_tarihi && ["Doğum Tarihi", formatDate(basvuru.dogum_tarihi)],
    basvuru.tc_kimlik_no && ["T.C. Kimlik No", basvuru.tc_kimlik_no],
    basvuru.adres && ["Adres", basvuru.adres],
    basvuru.bizi_nereden_duydunuz && ["Bizi Nereden Duydu", basvuru.bizi_nereden_duydunuz],
    basvuru.calismaya_baslama_tarihi && ["Başlayabileceği Tarih", formatDate(basvuru.calismaya_baslama_tarihi)],
    basvuru.calisma_sekli && ["Çalışma Şekli", CALISMA_SEKLI_ETIKET[basvuru.calisma_sekli] ?? basvuru.calisma_sekli],
    basvuru.beklenen_ucret && ["Beklenen Ücret", basvuru.beklenen_ucret],
    basvuru.egitim_okul_bolum && ["Okul / Bölüm", basvuru.egitim_okul_bolum],
    basvuru.egitim_mezuniyet_yili && ["Mezuniyet Yılı", basvuru.egitim_mezuniyet_yili],
    basvuru.egitim_sertifikalar && ["Sertifika / Belgeler", basvuru.egitim_sertifikalar],
  ].filter(Boolean) as [string, string][];

  const deneyimler = basvuru.is_deneyimi.filter((d) => d.sirket || d.gorev || d.sure);
  const referanslar = basvuru.referanslar.filter((r) => r.ad_soyad || r.telefon || r.baglanti);

  return (
    <li className="flex flex-col gap-2 py-3 text-sm">
      {aktarildi ? (
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">{basvuru.ad_soyad}</strong> personele aktarıldı.
        </p>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setAcik((a) => !a)}
            className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
          >
            <div className="flex flex-col">
              <span className="font-medium">{basvuru.ad_soyad}</span>
              <span className="text-muted-foreground">
                {telefonGoster(basvuru.telefon)}
                {basvuru.pozisyon ? ` · ${basvuru.pozisyon}` : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge tone={DURUM_TON[yerelDurum]}>{DURUM_ETIKET[yerelDurum]}</StatusBadge>
              <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", acik && "rotate-180")} />
            </div>
          </button>

          <p className="text-xs text-muted-foreground">{formatDateTime(basvuru.created_at)}</p>

          {acik && (
            <div className="flex flex-col gap-3 rounded-lg bg-muted/40 p-3 text-sm">
              {detaySatirlari.length === 0 && deneyimler.length === 0 && referanslar.length === 0 && (
                <p className="text-xs text-muted-foreground">Ek bilgi girilmemiş.</p>
              )}
              {detaySatirlari.length > 0 && (
                <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
                  {detaySatirlari.map(([etiket, deger]) => (
                    <div key={etiket} className="flex flex-col">
                      <dt className="text-xs text-muted-foreground">{etiket}</dt>
                      <dd>{deger}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {deneyimler.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium text-muted-foreground">İş Deneyimi</p>
                  {deneyimler.map((d, i) => (
                    <p key={i}>{[d.sirket, d.gorev, d.sure].filter(Boolean).join(" · ")}</p>
                  ))}
                </div>
              )}
              {referanslar.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium text-muted-foreground">Referanslar</p>
                  {referanslar.map((r, i) => (
                    <p key={i}>
                      {[r.ad_soyad, r.telefon && telefonGoster(r.telefon), r.baglanti].filter(Boolean).join(" · ")}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
            <Button type="button" size="sm" variant="outline" disabled={pending || yerelDurum === "beklemede"} onClick={() => guncelle("beklemede")}>
              Beklemede
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-emerald-500 text-white hover:bg-emerald-600 dark:hover:bg-emerald-600"
              onClick={() => setOnaylaDialogAcik(true)}
            >
              Olumlu / Onayla
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={pending || yerelDurum === "olumsuz"} onClick={() => guncelle("olumsuz")}>
              Olumsuz
            </Button>
          </div>
        </>
      )}

      <Dialog open={onaylaDialogAcik} onOpenChange={setOnaylaDialogAcik}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Personel Ekle — {basvuru.ad_soyad}</DialogTitle>
          </DialogHeader>
          <PersonelFormu
            mod="olustur"
            basvuru={{
              id: basvuru.id,
              ad_soyad: basvuru.ad_soyad,
              telefon: basvuru.telefon,
              eposta: basvuru.eposta,
              dogum_tarihi: basvuru.dogum_tarihi,
              tc_kimlik_no: basvuru.tc_kimlik_no,
              adres: basvuru.adres,
              pozisyon: basvuru.pozisyon,
            }}
            onBasarili={() => setAktarildi(true)}
          />
        </DialogContent>
      </Dialog>
    </li>
  );
}
