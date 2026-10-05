"use client";

import { useActionState, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { bugunIstanbulTarihi, formatDateTime } from "@/lib/datetime";
import type { DonemModu } from "@/lib/finans/donem";
import { LedgerView } from "@/components/panel/ledger-view";
import type { KlinikArac, KlinikBankaHesabi } from "@/types/klinik";
import type { LedgerSatiri } from "@/types/nakit-banka-hareketi";
import { GiderFormu } from "../giderler/gider-formu";
import { giderEkle } from "../giderler/actions";
import {
  kasaBaslangicGuncelle,
  kasaDengelemeEkle,
  kasaDengelemeSil,
  kasayaGirenEkle,
  kasadanDigerCikanEkle,
  kasadanBankayaTransferEkle,
  kasaPersonelOdemesiEkle,
  nakitBankaHareketiSil,
} from "./actions";

export type KasaKontrolBilgisi = {
  baslangicTutari: number;
  /** Başlangıç tutarının girildiği an (UTC ISO); eski kayıtlarda null. */
  baslangicZamani: string | null;
  baslangicGiren: string | null;
  /** Oturumdaki kullanıcı — Dengeleme'de "Giren Kişi" (salt okunur). */
  girenKisi: string;
};

function BaslangicTutariFormu({ kasaKontrol }: { kasaKontrol: KasaKontrolBilgisi }) {
  const [durum, formAction, isPending] = useActionState(kasaBaslangicGuncelle, null);

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-2xl border border-border p-3">
      <Label htmlFor="baslangic_tutari">Kasa Başlangıç Tutarı (₺)</Label>
      <div className="flex items-center gap-2">
        <Input
          id="baslangic_tutari"
          name="baslangic_tutari"
          type="number"
          min={0}
          step="0.01"
          defaultValue={kasaKontrol.baslangicTutari}
          required
          disabled={isPending}
          className="w-40"
        />
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Kaydediliyor..." : "Kaydet"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {kasaKontrol.baslangicZamani
          ? `Girildiği tarih: ${formatDateTime(kasaKontrol.baslangicZamani)} · Giren: ${kasaKontrol.baslangicGiren ?? "—"}. Tutar Kasa Hareketleri'ne bu tarihte "Kasa Başlangıç" olarak işlenir; güncellenirse tarih de yenilenir.`
          : "Henüz tarihli bir başlangıç girişi yok; mevcut tutar tüm dönemlerin açılış bakiyesi sayılır. Kaydedince girildiği tarihten itibaren hareketlere işlenir."}
      </p>
      {durum && (
        <p role={durum.success ? "status" : "alert"} className={cn("text-sm", durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
          {durum.message}
        </p>
      )}
    </form>
  );
}

function DengelemeFormu({ girenKisi, basariliOlunca }: { girenKisi: string; basariliOlunca: () => void }) {
  const [durum, formAction, isPending] = useActionState(kasaDengelemeEkle, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) basariliOlunca();
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-2xl border border-border p-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="dengeleme_tutar">Kasa Dengeleme Bedeli (₺)</Label>
        <Input id="dengeleme_tutar" name="tutar" type="number" step="0.01" required disabled={isPending} />
        <p className="text-xs text-muted-foreground">Artı (+) tutar kasaya ekler, eksi (−) tutar kasadan düşer.</p>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="dengeleme_aciklama">Açıklama</Label>
        <Input id="dengeleme_aciklama" name="aciklama" disabled={isPending} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="dengeleme_giren">Giren Kişi</Label>
        <Input id="dengeleme_giren" value={girenKisi} readOnly disabled />
      </div>
      {durum && !durum.success && (
        <p role="alert" className="text-sm text-destructive">
          {durum.message}
        </p>
      )}
      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? "Kaydediliyor..." : "Dengelemeyi Kaydet"}
      </Button>
    </form>
  );
}

function KasaKontrolDialog({ kasaKontrol }: { kasaKontrol: KasaKontrolBilgisi }) {
  const [acik, setAcik] = useState(false);
  // Butona tıklama anı (İstanbul); render içinde Date.now() çağırmamak için açılışta yakalanır.
  const [tiklamaZamani, setTiklamaZamani] = useState("");

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          setTiklamaZamani(formatDateTime(new Date().toISOString()));
          setAcik(true);
        }}
      >
        <ClipboardCheck />
        Kasa Kontrol
      </Button>
      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kasa Kontrol</DialogTitle>
            <p className="text-sm text-muted-foreground">{tiklamaZamani}</p>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <BaslangicTutariFormu kasaKontrol={kasaKontrol} />
            <DengelemeFormu girenKisi={kasaKontrol.girenKisi} basariliOlunca={() => setAcik(false)} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function KasayaGirenDialog() {
  const [acik, setAcik] = useState(false);
  const [durum, formAction, isPending] = useActionState(kasayaGirenEkle, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) setAcik(false);
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setAcik(true)}>
        <ArrowDownToLine />
        Kasaya Giren
      </Button>
      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kasaya Giren</DialogTitle>
          </DialogHeader>
          <form action={formAction} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="karsi_taraf_adi">Gönderen</Label>
              <Input id="karsi_taraf_adi" name="karsi_taraf_adi" required disabled={isPending} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="giren_tutar">Tutar (₺)</Label>
              <Input id="giren_tutar" name="tutar" type="number" min={0} step="0.01" required disabled={isPending} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="giren_tarih">Tarih</Label>
              <Input
                id="giren_tarih"
                name="tarih"
                type="date"
                defaultValue={bugunIstanbulTarihi()}
                required
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="giren_aciklama">Açıklama (opsiyonel)</Label>
              <Input id="giren_aciklama" name="aciklama" disabled={isPending} />
            </div>
            {durum && !durum.success && (
              <p role="alert" className="text-sm text-destructive">
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

type CikanAdimi = "tedarikci" | "personel" | "hesaplar_arasi" | "diger" | null;

function PersonelOdemeFormu({
  personelListesi,
  basariliOlunca,
}: {
  personelListesi: { id: string; ad_soyad: string }[];
  basariliOlunca: () => void;
}) {
  const [durum, formAction, isPending] = useActionState(kasaPersonelOdemesiEkle, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) basariliOlunca();
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="personel_id">Personel</Label>
        <Select
          name="personel_id"
          required
          disabled={isPending}
          items={personelListesi.map((p) => ({ value: p.id, label: p.ad_soyad }))}
        >
          <SelectTrigger id="personel_id" className="w-full">
            <SelectValue placeholder="Seçiniz..." />
          </SelectTrigger>
          <SelectContent>
            {personelListesi.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.ad_soyad}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="personel_tur">Tür</Label>
        <Select name="tur" required disabled={isPending} defaultValue="odeme" items={[{ value: "odeme", label: "Ödeme" }, { value: "avans", label: "Avans" }]}>
          <SelectTrigger id="personel_tur" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="odeme">Ödeme</SelectItem>
            <SelectItem value="avans">Avans</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="personel_tutar">Tutar (₺)</Label>
        <Input id="personel_tutar" name="tutar" type="number" min={0} step="0.01" required disabled={isPending} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="personel_tarih">Tarih</Label>
        <Input
          id="personel_tarih"
          name="tarih"
          type="date"
          defaultValue={bugunIstanbulTarihi()}
          required
          disabled={isPending}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="personel_aciklama">Açıklama (opsiyonel)</Label>
        <Input id="personel_aciklama" name="aciklama" disabled={isPending} />
      </div>
      {durum && !durum.success && (
        <p role="alert" className="text-sm text-destructive">
          {durum.message}
        </p>
      )}
      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? "Kaydediliyor..." : "Ekle"}
      </Button>
    </form>
  );
}

function HesaplarArasiFormu({
  bankaHesaplari,
  basariliOlunca,
}: {
  bankaHesaplari: KlinikBankaHesabi[];
  basariliOlunca: () => void;
}) {
  const [durum, formAction, isPending] = useActionState(kasadanBankayaTransferEkle, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) basariliOlunca();
  }

  if (bankaHesaplari.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Kayıtlı banka hesabı yok — Finans &gt; Banka&apos;dan hesap ekleyin.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="hedef_banka_hesap_id">Hedef Hesap</Label>
        <Select
          name="hedef_banka_hesap_id"
          required
          disabled={isPending}
          items={bankaHesaplari.map((b) => ({ value: b.id, label: b.sube ? `${b.banka_adi} — ${b.sube}` : b.banka_adi }))}
        >
          <SelectTrigger id="hedef_banka_hesap_id" className="w-full">
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
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="transfer_tutar">Tutar (₺)</Label>
        <Input id="transfer_tutar" name="tutar" type="number" min={0} step="0.01" required disabled={isPending} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="transfer_tarih">Tarih</Label>
        <Input
          id="transfer_tarih"
          name="tarih"
          type="date"
          defaultValue={bugunIstanbulTarihi()}
          required
          disabled={isPending}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="transfer_aciklama">Açıklama (opsiyonel)</Label>
        <Input id="transfer_aciklama" name="aciklama" disabled={isPending} />
      </div>
      {durum && !durum.success && (
        <p role="alert" className="text-sm text-destructive">
          {durum.message}
        </p>
      )}
      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? "Kaydediliyor..." : "Transfer Et"}
      </Button>
    </form>
  );
}

function DigerCikanFormu({ basariliOlunca }: { basariliOlunca: () => void }) {
  const [durum, formAction, isPending] = useActionState(kasadanDigerCikanEkle, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) basariliOlunca();
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="diger_karsi_taraf_adi">Alıcı</Label>
        <Input id="diger_karsi_taraf_adi" name="karsi_taraf_adi" required disabled={isPending} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="diger_tutar">Tutar (₺)</Label>
        <Input id="diger_tutar" name="tutar" type="number" min={0} step="0.01" required disabled={isPending} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="diger_tarih">Tarih</Label>
        <Input
          id="diger_tarih"
          name="tarih"
          type="date"
          defaultValue={bugunIstanbulTarihi()}
          required
          disabled={isPending}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="diger_aciklama">Açıklama (opsiyonel)</Label>
        <Input id="diger_aciklama" name="aciklama" disabled={isPending} />
      </div>
      {durum && !durum.success && (
        <p role="alert" className="text-sm text-destructive">
          {durum.message}
        </p>
      )}
      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? "Kaydediliyor..." : "Ekle"}
      </Button>
    </form>
  );
}

const CIKAN_ADIM_ETIKET: Record<Exclude<CikanAdimi, null>, string> = {
  tedarikci: "Tedarikçi",
  personel: "Personel",
  hesaplar_arasi: "Hesaplar Arası Transfer",
  diger: "Diğer",
};

function KasadanCikanDialog({
  bankaHesaplari,
  personelListesi,
  araclar,
}: {
  bankaHesaplari: KlinikBankaHesabi[];
  personelListesi: { id: string; ad_soyad: string }[];
  araclar: KlinikArac[];
}) {
  const [acik, setAcik] = useState(false);
  const [adim, setAdim] = useState<CikanAdimi>(null);

  function kapat() {
    setAcik(false);
    setAdim(null);
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setAcik(true)}>
        <ArrowUpFromLine />
        Kasadan Çıkan
      </Button>
      <Dialog
        open={acik}
        onOpenChange={(v) => {
          setAcik(v);
          if (!v) setAdim(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{adim ? CIKAN_ADIM_ETIKET[adim] : "Kasadan Çıkan"}</DialogTitle>
          </DialogHeader>

          {adim === null && (
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(CIKAN_ADIM_ETIKET) as Exclude<CikanAdimi, null>[]).map((a) => (
                <Button key={a} type="button" variant="outline" onClick={() => setAdim(a)}>
                  {CIKAN_ADIM_ETIKET[a]}
                </Button>
              ))}
            </div>
          )}

          {adim === "tedarikci" && (
            <GiderFormu
              action={giderEkle}
              gonderButonEtiketi="Ekle"
              araclar={araclar}
              bankaHesaplari={[]}
              sabitOdemeTipi="nakit"
              basariliOlunca={kapat}
            />
          )}
          {adim === "personel" && <PersonelOdemeFormu personelListesi={personelListesi} basariliOlunca={kapat} />}
          {adim === "hesaplar_arasi" && (
            <HesaplarArasiFormu bankaHesaplari={bankaHesaplari} basariliOlunca={kapat} />
          )}
          {adim === "diger" && <DigerCikanFormu basariliOlunca={kapat} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function KasaClient({
  kasaKontrol,
  donemBaslangicBakiyesi,
  mod,
  yil,
  ay,
  gelenRows,
  gidenRows,
  bankaHesaplari,
  personelListesi,
  araclar,
  duzenlenebilir,
}: {
  kasaKontrol: KasaKontrolBilgisi;
  donemBaslangicBakiyesi: number;
  mod: DonemModu;
  yil: number;
  ay: number;
  gelenRows: LedgerSatiri[];
  gidenRows: LedgerSatiri[];
  bankaHesaplari: KlinikBankaHesabi[];
  personelListesi: { id: string; ad_soyad: string }[];
  araclar: KlinikArac[];
  duzenlenebilir: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      {duzenlenebilir && (
        <div className="flex flex-wrap gap-2">
          <KasaKontrolDialog kasaKontrol={kasaKontrol} />
          <KasayaGirenDialog />
          <KasadanCikanDialog bankaHesaplari={bankaHesaplari} personelListesi={personelListesi} araclar={araclar} />
        </div>
      )}

      <LedgerView
        gelenRows={gelenRows}
        gidenRows={gidenRows}
        openingBalance={donemBaslangicBakiyesi}
        mod={mod}
        yil={yil}
        ay={ay}
        yol="/panel/finans/kasa"
        onEk="Nakit"
        onSil={
          duzenlenebilir
            ? (sil) => (sil.hedef === "kasa_dengeleme" ? kasaDengelemeSil(sil.id) : nakitBankaHareketiSil(sil.id))
            : undefined
        }
      />
    </div>
  );
}
