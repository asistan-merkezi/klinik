"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X, Trash2, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { LedgerView } from "@/components/panel/ledger-view";
import type { KlinikArac, KlinikBankaHesabi } from "@/types/klinik";
import type { LedgerSatiri } from "@/types/nakit-banka-hareketi";
import { GiderFormu } from "../giderler/gider-formu";
import { giderEkle } from "../giderler/actions";
import {
  kasaBaslangicGuncelle,
  kasayaGirenEkle,
  kasadanDigerCikanEkle,
  kasadanBankayaTransferEkle,
  kasaPersonelOdemesiEkle,
  nakitBankaHareketiSil,
} from "./actions";

const paraFormat = (tutar: number) => tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });
const tarihFormat = (tarih: string) => {
  const [yil, ay, gun] = tarih.split("-");
  return `${gun}.${ay}.${yil}`;
};

type NakitBankaSatiri = {
  id: string;
  tip: string;
  kaynak_kasa: boolean;
  hedef_kasa: boolean;
  tutar: number;
  tarih: string;
  aciklama: string | null;
  karsi_taraf_adi: string | null;
};

function BaslangicTutariKarti({
  baslangicTutari,
  duzenlenebilir,
}: {
  baslangicTutari: number;
  duzenlenebilir: boolean;
}) {
  const [duzenleniyor, setDuzenleniyor] = useState(false);
  const [durum, formAction, isPending] = useActionState(kasaBaslangicGuncelle, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) setDuzenleniyor(false);
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Kasa Başlangıç Tutarı</p>
          {!duzenleniyor && <p className="text-xl font-semibold tabular-nums">{paraFormat(baslangicTutari)}</p>}
        </div>
        {duzenlenebilir &&
          (duzenleniyor ? (
            <form action={formAction} className="flex items-center gap-2">
              <Input
                name="baslangic_tutari"
                type="number"
                min={0}
                step="0.01"
                defaultValue={baslangicTutari}
                required
                disabled={isPending}
                className="w-32"
              />
              <Button type="submit" size="icon-sm" disabled={isPending} aria-label="Kaydet">
                <Check />
              </Button>
              <Button type="button" variant="outline" size="icon-sm" onClick={() => setDuzenleniyor(false)} aria-label="Vazgeç">
                <X />
              </Button>
            </form>
          ) : (
            <Button type="button" variant="outline" size="icon-sm" onClick={() => setDuzenleniyor(true)} aria-label="Düzenle">
              <Pencil />
            </Button>
          ))}
      </CardContent>
    </Card>
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
                defaultValue={new Date().toISOString().slice(0, 10)}
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
          defaultValue={new Date().toISOString().slice(0, 10)}
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
          defaultValue={new Date().toISOString().slice(0, 10)}
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
          defaultValue={new Date().toISOString().slice(0, 10)}
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

function KasaHareketleriTablosu({
  hareketler,
  duzenlenebilir,
}: {
  hareketler: NakitBankaSatiri[];
  duzenlenebilir: boolean;
}) {
  const [silinecekId, setSilinecekId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (hareketler.length === 0) {
    return <EmptyState icon={ArrowDownToLine} title="Manuel kasa hareketi yok." compact />;
  }

  return (
    <Table className="min-w-[640px]">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Tarih</TableHead>
          <TableHead>Tür</TableHead>
          <TableHead>Açıklama</TableHead>
          <TableHead className="text-right">Tutar</TableHead>
          {duzenlenebilir && <TableHead />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {hareketler.map((h) => (
          <TableRow key={h.id}>
            <TableCell className="text-muted-foreground">{tarihFormat(h.tarih)}</TableCell>
            <TableCell>{h.hedef_kasa ? "Giren" : "Çıkan"}</TableCell>
            <TableCell className="text-muted-foreground">{h.karsi_taraf_adi ?? h.aciklama ?? "—"}</TableCell>
            <TableCell className="text-right tabular-nums">{paraFormat(h.tutar)}</TableCell>
            {duzenlenebilir && (
              <TableCell className="text-right">
                {silinecekId === h.id ? (
                  <div className="flex items-center justify-end gap-1.5 text-xs">
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={isPending}
                      onClick={() => startTransition(async () => {
                        await nakitBankaHareketiSil(h.id);
                        setSilinecekId(null);
                      })}
                    >
                      Sil
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => setSilinecekId(null)}>
                      Vazgeç
                    </Button>
                  </div>
                ) : (
                  <Button type="button" size="icon-sm" variant="ghost" aria-label="Sil" onClick={() => setSilinecekId(h.id)}>
                    <Trash2 />
                  </Button>
                )}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function KasaClient({
  baslangicTutari,
  donemBaslangicBakiyesi,
  yil,
  gelenRows,
  gidenRows,
  bankaHesaplari,
  nakitBankaHareketleri,
  personelListesi,
  araclar,
  duzenlenebilir,
}: {
  baslangicTutari: number;
  donemBaslangicBakiyesi: number;
  yil: number;
  gelenRows: LedgerSatiri[];
  gidenRows: LedgerSatiri[];
  bankaHesaplari: KlinikBankaHesabi[];
  nakitBankaHareketleri: NakitBankaSatiri[];
  personelListesi: { id: string; ad_soyad: string }[];
  araclar: KlinikArac[];
  duzenlenebilir: boolean;
}) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-6">
      <BaslangicTutariKarti baslangicTutari={baslangicTutari} duzenlenebilir={duzenlenebilir} />

      {duzenlenebilir && (
        <div className="flex flex-wrap gap-2">
          <KasayaGirenDialog />
          <KasadanCikanDialog bankaHesaplari={bankaHesaplari} personelListesi={personelListesi} araclar={araclar} />
        </div>
      )}

      <LedgerView
        gelenRows={gelenRows}
        gidenRows={gidenRows}
        openingBalance={donemBaslangicBakiyesi}
        yil={yil}
        onYilDegistir={(yeniYil) => router.push(`/panel/finans/kasa?yil=${yeniYil}`)}
      />

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-muted-foreground">Kasa Hareketleri</h3>
        <KasaHareketleriTablosu hareketler={nakitBankaHareketleri} duzenlenebilir={duzenlenebilir} />
      </div>
    </div>
  );
}
