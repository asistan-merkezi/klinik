"use client";

import { useState } from "react";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { CLINIC_TZ } from "@/lib/datetime";
import {
  SIKAYET_DURUM_ETIKETLERI,
  type SikayetDurumu,
  type HastaAnamnezKaydi,
} from "@/types/hasta-detay";
import { useHastaAnamnezKayitlari, useSikayetKaydiEkle, useSikayetDurumGuncelle } from "./queries";

const DURUM_TONLARI: Record<SikayetDurumu, StatusTone> = {
  aktif: "primary",
  cozuldu: "emerald",
};

const TARIH_FORMAT = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: CLINIC_TZ,
});

export function SikayetAnamnezKarti({
  hastaId,
  aktif,
  duzenlenebilir,
}: {
  hastaId: string;
  aktif: boolean;
  duzenlenebilir: boolean;
}) {
  const { data: kayitlar, isLoading } = useHastaAnamnezKayitlari(hastaId, aktif);
  const [seciliId, setSeciliId] = useState<string | null>(null);
  const [formAcik, setFormAcik] = useState(false);
  const ekleMutasyon = useSikayetKaydiEkle(hastaId);
  const durumMutasyon = useSikayetDurumGuncelle(hastaId);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Şikayet & Anamnez</h3>
        {duzenlenebilir && (
          <Button type="button" size="sm" variant="outline" onClick={() => setFormAcik((v) => !v)}>
            {formAcik ? "Vazgeç" : "+ Yeni Şikayet Kaydı"}
          </Button>
        )}
      </div>

      {formAcik && (
        <SikayetFormu
          isPending={ekleMutasyon.isPending}
          hataVar={ekleMutasyon.isError}
          onKaydet={(girdi) => ekleMutasyon.mutate(girdi, { onSuccess: () => setFormAcik(false) })}
          onVazgec={() => setFormAcik(false)}
        />
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Yükleniyor...</p>
      ) : !kayitlar || kayitlar.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Henüz şikayet/anamnez kaydı yok." />
      ) : (
        <ol className="relative flex flex-col gap-3 border-l border-border pl-6">
          {kayitlar.map((kayit) => {
            const secili = kayit.id === seciliId;
            return (
              <li key={kayit.id} className="relative">
                <span
                  className={cn(
                    "absolute -left-[27px] top-4 size-3 rounded-full border-2 border-background",
                    secili ? "bg-primary ring-4 ring-primary/15" : "bg-muted-foreground/40"
                  )}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  onClick={() => setSeciliId(secili ? null : kayit.id)}
                  className={cn(
                    "flex w-full flex-col gap-2 rounded-xl border p-3.5 text-left transition-all",
                    secili
                      ? "border-primary bg-primary/5 shadow-[0_0_0_1px_var(--primary),0_4px_20px_-6px_var(--primary)]"
                      : "border-border hover:bg-muted/40"
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium">{kayit.basvuru_sikayeti}</span>
                    <StatusBadge tone={DURUM_TONLARI[kayit.durum]}>{SIKAYET_DURUM_ETIKETLERI[kayit.durum]}</StatusBadge>
                  </div>
                  <p className="text-xs text-muted-foreground">Başlangıç: {kayit.sikayet_baslangici || "—"}</p>
                </button>

                {secili && (
                  <SikayetDetayKarti
                    kayit={kayit}
                    duzenlenebilir={duzenlenebilir}
                    onDurumDegistir={(durum) => durumMutasyon.mutate({ kayitId: kayit.id, durum })}
                    durumGuncelleniyor={durumMutasyon.isPending}
                  />
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function SatirGoster({ etiket, deger }: { etiket: string; deger: string | null }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs font-medium text-muted-foreground">{etiket}</span>
      <span className="whitespace-pre-wrap">{deger || "—"}</span>
    </div>
  );
}

function SikayetDetayKarti({
  kayit,
  duzenlenebilir,
  onDurumDegistir,
  durumGuncelleniyor,
}: {
  kayit: HastaAnamnezKaydi;
  duzenlenebilir: boolean;
  onDurumDegistir: (durum: SikayetDurumu) => void;
  durumGuncelleniyor: boolean;
}) {
  const kaydeden =
    kayit.son_guncelleyen_tip === "personel" ? (kayit.son_guncelleyen_kullanici?.ad_soyad ?? "—") : "—";
  const karsiDurum: SikayetDurumu = kayit.durum === "aktif" ? "cozuldu" : "aktif";

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-xl border border-border bg-muted/30 p-3.5 text-sm">
      <SatirGoster etiket="Ağrı / Şikayet Öyküsü" deger={kayit.agri_oykusu} />
      <SatirGoster etiket="İlk Değerlendirme Notu" deger={kayit.ilk_degerlendirme_notu} />
      <p className="mt-1 text-xs text-muted-foreground">
        Kaydeden: {kaydeden} · {TARIH_FORMAT.format(new Date(kayit.updated_at))}
      </p>
      {duzenlenebilir && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={durumGuncelleniyor}
          onClick={() => onDurumDegistir(karsiDurum)}
          className="w-fit"
        >
          {durumGuncelleniyor
            ? "Kaydediliyor..."
            : karsiDurum === "cozuldu"
              ? "Çözüldü olarak işaretle"
              : "Aktif olarak işaretle"}
        </Button>
      )}
    </div>
  );
}

type SikayetKaydiGirdi = {
  basvuru_sikayeti: string;
  sikayet_baslangici: string;
  agri_oykusu: string;
  ilk_degerlendirme_notu: string;
  durum: SikayetDurumu;
};

function SikayetFormu({
  isPending,
  hataVar,
  onKaydet,
  onVazgec,
}: {
  isPending: boolean;
  hataVar: boolean;
  onKaydet: (girdi: SikayetKaydiGirdi) => void;
  onVazgec: () => void;
}) {
  const [basvuruSikayeti, setBasvuruSikayeti] = useState("");
  const [sikayetBaslangici, setSikayetBaslangici] = useState("");
  const [agriOykusu, setAgriOykusu] = useState("");
  const [ilkDegerlendirmeNotu, setIlkDegerlendirmeNotu] = useState("");
  const [durum, setDurum] = useState<SikayetDurumu>("aktif");

  function gonder(e: React.FormEvent) {
    e.preventDefault();
    if (!basvuruSikayeti.trim() || isPending) return;
    onKaydet({
      basvuru_sikayeti: basvuruSikayeti.trim(),
      sikayet_baslangici: sikayetBaslangici.trim(),
      agri_oykusu: agriOykusu.trim(),
      ilk_degerlendirme_notu: ilkDegerlendirmeNotu.trim(),
      durum,
    });
  }

  return (
    <form onSubmit={gonder} className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="basvuru_sikayeti">Başvuru Şikayeti</Label>
        <Input
          id="basvuru_sikayeti"
          value={basvuruSikayeti}
          onChange={(e) => setBasvuruSikayeti(e.target.value)}
          required
          disabled={isPending}
          placeholder="Örn: Sağ omuzda hareketle artan ağrı"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sikayet_baslangici">Şikayet Başlangıcı</Label>
          <Input
            id="sikayet_baslangici"
            value={sikayetBaslangici}
            onChange={(e) => setSikayetBaslangici(e.target.value)}
            disabled={isPending}
            placeholder="Örn: 3 hafta önce"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sikayet_durumu">Durum</Label>
          <select
            id="sikayet_durumu"
            value={durum}
            onChange={(e) => setDurum(e.target.value as SikayetDurumu)}
            disabled={isPending}
            className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="aktif">Aktif</option>
            <option value="cozuldu">Çözüldü</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="agri_oykusu">Ağrı / Şikayet Öyküsü</Label>
        <textarea
          id="agri_oykusu"
          value={agriOykusu}
          onChange={(e) => setAgriOykusu(e.target.value)}
          rows={2}
          disabled={isPending}
          placeholder="Travma, geçmiş tedavi, ağrının seyri..."
          className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ilk_degerlendirme_notu">İlk Muayene / Değerlendirme Notu</Label>
        <textarea
          id="ilk_degerlendirme_notu"
          value={ilkDegerlendirmeNotu}
          onChange={(e) => setIlkDegerlendirmeNotu(e.target.value)}
          rows={2}
          disabled={isPending}
          placeholder="Terapistin ilk muayenede gözlemlediği bulgular..."
          className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      {hataVar && <p className="text-sm text-destructive">Kaydedilemedi, lütfen tekrar deneyin.</p>}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending || !basvuruSikayeti.trim()}>
          {isPending ? "Kaydediliyor..." : "Kaydet"}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={onVazgec}>
          Vazgeç
        </Button>
      </div>
    </form>
  );
}
