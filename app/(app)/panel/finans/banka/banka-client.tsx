"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { Trash2, ArrowDownToLine, ArrowUpFromLine, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { LedgerView } from "@/components/panel/ledger-view";
import type { KlinikArac, KlinikBankaHesabi } from "@/types/klinik";
import type { LedgerSatiri } from "@/types/nakit-banka-hareketi";
import { GiderFormu } from "../giderler/gider-formu";
import { giderEkle } from "../giderler/actions";
import { OdemeFormu } from "../kamusal-giderler/odeme-formu";
import { kamusalOdemeEkle } from "../kamusal-giderler/actions";
import {
  bankayaGirenEkle,
  bankadanDigerCikanEkle,
  bankadanTransferEkle,
  bankaPersonelOdemesiEkle,
  nakitBankaHareketiSil,
} from "./actions";

const paraFormat = (tutar: number) => tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });
const tarihFormat = (tarih: string) => {
  const [yil, ay, gun] = tarih.split("-");
  return `${gun}.${ay}.${yil}`;
};

function formatIban(iban: string): string {
  return iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

type HastaOdemeSatiri = { id: string; created_at: string; tutar: number; banka_hesap_id: string | null; hasta: { ad_soyad: string } | null };
type HarcamaSatiri = { id: string; tarih: string; tutar: number; tedarikci_adi: string | null; kategori: string; banka_hesap_id: string | null };
type PersonelOdemeSatiri = { id: string; tarih: string; tutar: number; tur: string; banka_hesap_id: string | null; personel: { ad_soyad: string } | null };
type NakitBankaSatiri = {
  id: string;
  tip: string;
  kaynak_kasa: boolean;
  kaynak_banka_hesap_id: string | null;
  hedef_kasa: boolean;
  hedef_banka_hesap_id: string | null;
  odeme_yontemi: string | null;
  tutar: number;
  tarih: string;
  aciklama: string | null;
  karsi_taraf_adi: string | null;
  karsi_taraf_banka: string | null;
  karsi_taraf_iban: string | null;
};

function HesapPilleri({
  bankaHesaplari,
  selectedId,
  setSelectedId,
}: {
  bankaHesaplari: KlinikBankaHesabi[];
  selectedId: string;
  setSelectedId: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {bankaHesaplari.map((b) => (
        <Button
          key={b.id}
          type="button"
          variant="outline"
          size="sm"
          className={cn(selectedId === b.id && "!border-primary !bg-primary !text-primary-foreground")}
          onClick={() => setSelectedId(b.id)}
        >
          {b.sube ? `${b.banka_adi} — ${b.sube}` : b.banka_adi}
        </Button>
      ))}
    </div>
  );
}

function BankayaGirenDialog({ selectedId }: { selectedId: string }) {
  const [acik, setAcik] = useState(false);
  const [yontem, setYontem] = useState<"nakit" | "banka_havalesi">("banka_havalesi");
  const [durum, formAction, isPending] = useActionState(bankayaGirenEkle, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) setAcik(false);
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setAcik(true)}>
        <ArrowDownToLine />
        Bankaya Giren
      </Button>
      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bankaya Giren</DialogTitle>
          </DialogHeader>
          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="hedef_banka_hesap_id" value={selectedId} />
            <div className="flex flex-col gap-1">
              <Label>Ödeme Şekli</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  className={cn(yontem === "nakit" && "!border-primary !bg-primary !text-primary-foreground")}
                  onClick={() => setYontem("nakit")}
                >
                  Nakit
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  className={cn(yontem === "banka_havalesi" && "!border-primary !bg-primary !text-primary-foreground")}
                  onClick={() => setYontem("banka_havalesi")}
                >
                  Havale
                </Button>
              </div>
              <input type="hidden" name="odeme_yontemi" value={yontem} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="giren_karsi_taraf_adi">Gönderen</Label>
              <Input id="giren_karsi_taraf_adi" name="karsi_taraf_adi" required disabled={isPending} />
            </div>
            {yontem === "banka_havalesi" && (
              <>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="giren_karsi_taraf_banka">Gönderen Banka (opsiyonel)</Label>
                  <Input id="giren_karsi_taraf_banka" name="karsi_taraf_banka" disabled={isPending} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="giren_karsi_taraf_iban">Gönderen IBAN (opsiyonel)</Label>
                  <Input id="giren_karsi_taraf_iban" name="karsi_taraf_iban" disabled={isPending} className="font-mono tracking-wide" />
                </div>
              </>
            )}
            <div className="flex flex-col gap-1">
              <Label htmlFor="giren_tutar">Tutar (₺)</Label>
              <Input id="giren_tutar" name="tutar" type="number" min={0} step="0.01" required disabled={isPending} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="giren_tarih">Tarih</Label>
              <Input id="giren_tarih" name="tarih" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required disabled={isPending} />
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

function PersonelOdemeFormu({
  selectedId,
  personelListesi,
  basariliOlunca,
}: {
  selectedId: string;
  personelListesi: { id: string; ad_soyad: string }[];
  basariliOlunca: () => void;
}) {
  const [durum, formAction, isPending] = useActionState(bankaPersonelOdemesiEkle, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) basariliOlunca();
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="banka_hesap_id" value={selectedId} />
      <div className="flex flex-col gap-1">
        <Label htmlFor="b_personel_id">Personel</Label>
        <Select name="personel_id" required disabled={isPending} items={personelListesi.map((p) => ({ value: p.id, label: p.ad_soyad }))}>
          <SelectTrigger id="b_personel_id" className="w-full">
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
        <Label htmlFor="b_personel_tur">Tür</Label>
        <Select name="tur" required disabled={isPending} defaultValue="odeme" items={[{ value: "odeme", label: "Ödeme" }, { value: "avans", label: "Avans" }]}>
          <SelectTrigger id="b_personel_tur" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="odeme">Ödeme</SelectItem>
            <SelectItem value="avans">Avans</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="b_personel_tutar">Tutar (₺)</Label>
        <Input id="b_personel_tutar" name="tutar" type="number" min={0} step="0.01" required disabled={isPending} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="b_personel_tarih">Tarih</Label>
        <Input id="b_personel_tarih" name="tarih" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required disabled={isPending} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="b_personel_aciklama">Açıklama (opsiyonel)</Label>
        <Input id="b_personel_aciklama" name="aciklama" disabled={isPending} />
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
  selectedId,
  bankaHesaplari,
  basariliOlunca,
}: {
  selectedId: string;
  bankaHesaplari: KlinikBankaHesabi[];
  basariliOlunca: () => void;
}) {
  const [durum, formAction, isPending] = useActionState(bankadanTransferEkle, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) basariliOlunca();
  }

  const digerHesaplar = bankaHesaplari.filter((b) => b.id !== selectedId);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="kaynak_banka_hesap_id" value={selectedId} />
      <div className="flex flex-col gap-1">
        <Label htmlFor="b_hedef">Hedef</Label>
        <Select
          name="hedef"
          required
          disabled={isPending}
          items={[{ value: "kasa", label: "Kasa" }, ...digerHesaplar.map((b) => ({ value: b.id, label: b.sube ? `${b.banka_adi} — ${b.sube}` : b.banka_adi }))]}
        >
          <SelectTrigger id="b_hedef" className="w-full">
            <SelectValue placeholder="Seçiniz..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="kasa">Kasa</SelectItem>
            {digerHesaplar.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.sube ? `${b.banka_adi} — ${b.sube}` : b.banka_adi}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="b_transfer_tutar">Tutar (₺)</Label>
        <Input id="b_transfer_tutar" name="tutar" type="number" min={0} step="0.01" required disabled={isPending} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="b_transfer_tarih">Tarih</Label>
        <Input id="b_transfer_tarih" name="tarih" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required disabled={isPending} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="b_transfer_aciklama">Açıklama (opsiyonel)</Label>
        <Input id="b_transfer_aciklama" name="aciklama" disabled={isPending} />
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

function DigerCikanFormu({ selectedId, basariliOlunca }: { selectedId: string; basariliOlunca: () => void }) {
  const [durum, formAction, isPending] = useActionState(bankadanDigerCikanEkle, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) basariliOlunca();
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="kaynak_banka_hesap_id" value={selectedId} />
      <div className="flex flex-col gap-1">
        <Label htmlFor="b_diger_karsi_taraf_adi">Alıcı</Label>
        <Input id="b_diger_karsi_taraf_adi" name="karsi_taraf_adi" required disabled={isPending} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="b_diger_karsi_taraf_banka">Alıcı Banka (opsiyonel)</Label>
        <Input id="b_diger_karsi_taraf_banka" name="karsi_taraf_banka" disabled={isPending} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="b_diger_karsi_taraf_iban">Alıcı IBAN (opsiyonel)</Label>
        <Input id="b_diger_karsi_taraf_iban" name="karsi_taraf_iban" disabled={isPending} className="font-mono tracking-wide" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="b_diger_tutar">Tutar (₺)</Label>
        <Input id="b_diger_tutar" name="tutar" type="number" min={0} step="0.01" required disabled={isPending} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="b_diger_tarih">Tarih</Label>
        <Input id="b_diger_tarih" name="tarih" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required disabled={isPending} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="b_diger_aciklama">Açıklama (opsiyonel)</Label>
        <Input id="b_diger_aciklama" name="aciklama" disabled={isPending} />
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

type CikanAdimi = "tedarikci" | "personel" | "hesaplar_arasi" | "kamusal" | "diger" | null;

const CIKAN_ADIM_ETIKET: Record<Exclude<CikanAdimi, null>, string> = {
  tedarikci: "Tedarikçi",
  personel: "Personel",
  hesaplar_arasi: "Hesaplar Arası Transfer",
  kamusal: "Kamusal Ödeme",
  diger: "Diğer",
};

function BankadanCikanDialog({
  selectedId,
  bankaHesaplari,
  personelListesi,
  araclar,
}: {
  selectedId: string;
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
        Bankadan Çıkan
      </Button>
      <Dialog open={acik} onOpenChange={(v) => { setAcik(v); if (!v) setAdim(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{adim ? CIKAN_ADIM_ETIKET[adim] : "Bankadan Çıkan"}</DialogTitle>
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
              bankaHesaplari={bankaHesaplari}
              sabitOdemeTipi="havale"
              sabitBankaHesapId={selectedId}
              basariliOlunca={kapat}
            />
          )}
          {adim === "personel" && (
            <PersonelOdemeFormu selectedId={selectedId} personelListesi={personelListesi} basariliOlunca={kapat} />
          )}
          {adim === "hesaplar_arasi" && (
            <HesaplarArasiFormu selectedId={selectedId} bankaHesaplari={bankaHesaplari} basariliOlunca={kapat} />
          )}
          {adim === "kamusal" && <OdemeFormu action={kamusalOdemeEkle} gonderButonEtiketi="Ekle" araclar={araclar} basariliOlunca={kapat} />}
          {adim === "diger" && <DigerCikanFormu selectedId={selectedId} basariliOlunca={kapat} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function HavaleKayitlariTablosu({
  hareketler,
  bankaHesaplari,
  selectedId,
  duzenlenebilir,
}: {
  hareketler: NakitBankaSatiri[];
  bankaHesaplari: KlinikBankaHesabi[];
  selectedId: string;
  duzenlenebilir: boolean;
}) {
  const [silinecekId, setSilinecekId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function otherAccountLabel(h: NakitBankaSatiri): string {
    if (h.tip !== "hesaplar_arasi") return h.karsi_taraf_adi ?? h.karsi_taraf_banka ?? "—";
    if (h.kaynak_banka_hesap_id === selectedId) {
      if (h.hedef_kasa) return "Kasa";
      const hesap = bankaHesaplari.find((b) => b.id === h.hedef_banka_hesap_id);
      return hesap ? hesap.banka_adi : "—";
    }
    if (h.kaynak_kasa) return "Kasa";
    const hesap = bankaHesaplari.find((b) => b.id === h.kaynak_banka_hesap_id);
    return hesap ? hesap.banka_adi : "—";
  }

  if (hareketler.length === 0) {
    return <EmptyState icon={Landmark} title="Bu hesapta manuel hareket yok." compact />;
  }

  return (
    <Table className="min-w-[720px]">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Tarih</TableHead>
          <TableHead>Yön</TableHead>
          <TableHead>Karşı Taraf</TableHead>
          <TableHead>IBAN</TableHead>
          <TableHead className="text-right">Tutar</TableHead>
          {duzenlenebilir && <TableHead />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {hareketler.map((h) => {
          const gelenMi = h.hedef_banka_hesap_id === selectedId;
          return (
            <TableRow key={h.id}>
              <TableCell className="text-muted-foreground">{tarihFormat(h.tarih)}</TableCell>
              <TableCell>{gelenMi ? "Giren" : "Çıkan"}</TableCell>
              <TableCell className="text-muted-foreground">{otherAccountLabel(h)}</TableCell>
              <TableCell className="font-mono text-xs tracking-wide text-muted-foreground">
                {h.karsi_taraf_iban ? formatIban(h.karsi_taraf_iban) : "—"}
              </TableCell>
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
          );
        })}
      </TableBody>
    </Table>
  );
}

export function BankaClient({
  bankaHesaplari,
  hastaOdemeleri,
  harcamalar,
  personelOdemeleri,
  nakitBankaHareketleri,
  personelListesi,
  araclar,
  duzenlenebilir,
}: {
  bankaHesaplari: KlinikBankaHesabi[];
  hastaOdemeleri: HastaOdemeSatiri[];
  harcamalar: HarcamaSatiri[];
  personelOdemeleri: PersonelOdemeSatiri[];
  nakitBankaHareketleri: NakitBankaSatiri[];
  personelListesi: { id: string; ad_soyad: string }[];
  araclar: KlinikArac[];
  duzenlenebilir: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string>(bankaHesaplari[0]?.id ?? "");

  const { gelenRows, gidenRows, hesabiIlgilendirenTransferler } = useMemo(() => {
    if (!selectedId) {
      return { gelenRows: [] as LedgerSatiri[], gidenRows: [] as LedgerSatiri[], hesabiIlgilendirenTransferler: [] as NakitBankaSatiri[] };
    }

    const gelen: LedgerSatiri[] = [
      ...hastaOdemeleri
        .filter((h) => h.banka_hesap_id === selectedId)
        .map((h) => ({ tarih: h.created_at.slice(0, 10), tutar: h.tutar, etiket: "Hasta ödemesi", taraf: h.hasta?.ad_soyad ?? "Hasta" })),
    ];

    const giden: LedgerSatiri[] = [
      ...harcamalar
        .filter((g) => g.banka_hesap_id === selectedId)
        .map((g) => ({ tarih: g.tarih, tutar: g.tutar, etiket: g.tedarikci_adi ?? g.kategori, taraf: g.tedarikci_adi ?? undefined })),
      ...personelOdemeleri
        .filter((p) => p.banka_hesap_id === selectedId)
        .map((p) => ({
          tarih: p.tarih,
          tutar: p.tutar,
          etiket: p.tur === "avans" ? "Personel avansı" : "Personel ödemesi",
          taraf: p.personel?.ad_soyad ?? "Personel",
        })),
    ];

    const transferler: NakitBankaSatiri[] = [];
    for (const t of nakitBankaHareketleri) {
      const buHesapKaynak = t.kaynak_banka_hesap_id === selectedId;
      const buHesapHedef = t.hedef_banka_hesap_id === selectedId;
      if (!buHesapKaynak && !buHesapHedef) continue;
      transferler.push(t);

      const etiket = t.tip === "hesaplar_arasi" ? (buHesapHedef ? "Hesaptan transfer" : "Hesaba transfer") : buHesapHedef ? "Bankaya giren" : "Bankadan çıkan";
      const satir: LedgerSatiri = { tarih: t.tarih, tutar: t.tutar, etiket, taraf: t.karsi_taraf_adi ?? t.aciklama ?? undefined };
      if (buHesapHedef) gelen.push(satir);
      else giden.push(satir);
    }

    return { gelenRows: gelen, gidenRows: giden, hesabiIlgilendirenTransferler: transferler };
  }, [selectedId, hastaOdemeleri, harcamalar, personelOdemeleri, nakitBankaHareketleri]);

  if (bankaHesaplari.length === 0) {
    return (
      <EmptyState
        icon={Landmark}
        title="Kayıtlı banka hesabı yok."
        description="Finans > Şirket Bilgileri'nden banka hesabı ekleyin."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <HesapPilleri bankaHesaplari={bankaHesaplari} selectedId={selectedId} setSelectedId={setSelectedId} />

      {duzenlenebilir && (
        <div className="flex flex-wrap gap-2">
          <BankayaGirenDialog selectedId={selectedId} />
          <BankadanCikanDialog selectedId={selectedId} bankaHesaplari={bankaHesaplari} personelListesi={personelListesi} araclar={araclar} />
        </div>
      )}

      <LedgerView gelenRows={gelenRows} gidenRows={gidenRows} openingBalance={0} />

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-muted-foreground">Havale Kayıtları</h3>
        <HavaleKayitlariTablosu
          hareketler={hesabiIlgilendirenTransferler}
          bankaHesaplari={bankaHesaplari}
          selectedId={selectedId}
          duzenlenebilir={duzenlenebilir}
        />
      </div>
    </div>
  );
}
