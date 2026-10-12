"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, CirclePlus, Pencil, Trash2, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { bugunIstanbulTarihi } from "@/lib/datetime";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { KlinikBankaHesabi, KlinikKrediKarti } from "@/types/klinik";
import {
  HARCAMA_KATEGORI_ETIKET,
  ODEME_TIPI_ETIKET,
  ODEME_TIPI_SECENEKLERI,
  type HarcamaKategori,
  type HarcamaOdemeTipi,
  type OdemeTipi,
} from "@/types/klinik-harcama";
import { giderOdemeBilgisiGuncelle } from "../actions";
import { cariOdemeEkle, cariOdemeSil } from "./actions";
import { useBasariOlunca } from "@/lib/use-basari-olunca";

export type TedarikciHareketi = {
  /** cari_gider: "Cariye Ekle" (borç) · odenmis_gider: nakit/havale/kart (borç+ödeme, net 0) ·
   *  bekleyen_gider: ödeme yöntemi boş (hiçbir toplama girmez) · cari_odeme: tedarikçiye yapılan ödeme */
  tur: "cari_gider" | "odenmis_gider" | "bekleyen_gider" | "cari_odeme";
  id: string;
  tarih: string;
  tutar: number;
  kategori: HarcamaKategori | null;
  aciklama: string | null;
  odeme_tipi: HarcamaOdemeTipi | null;
  banka_hesap_id: string | null;
  kredi_karti_id: string | null;
  fatura_no: string | null;
};

export type TedarikciOzeti = {
  anahtar: string;
  ad: string;
  /** Tüm gider tutarları (cariye eklenen + ödenmiş + ödeme bilgisi bekleyen) */
  toplamHarcama: number;
  sonTarih: string;
  /** SQL (klinik_cari_bakiyeler) — Borç, Ödenen, Bakiye = Borç − Ödenen */
  borc: number;
  odenen: number;
  bakiye: number;
  /** Kronolojik (eskiden yeniye) */
  hareketler: TedarikciHareketi[];
};

const paraFormat = (tutar: number) => tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });
const tarihFormat = (tarih: string) => new Date(tarih).toLocaleDateString("tr-TR");

const SECILI_SINIF = "border-primary bg-primary/10 text-primary";
const SECILMEMIS_SINIF = "border-border bg-card text-muted-foreground hover:bg-muted";
const SELECT_SINIF =
  "h-9 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function TedarikciListesi({
  tedarikciler,
  bankaHesaplari,
  kartlar,
  duzenlenebilir,
}: {
  tedarikciler: TedarikciOzeti[];
  bankaHesaplari: KlinikBankaHesabi[];
  kartlar: KlinikKrediKarti[];
  duzenlenebilir: boolean;
}) {
  const [arama, setArama] = useState("");
  const [acikAnahtar, setAcikAnahtar] = useState<string | null>(null);

  const filtreli = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr-TR");
    return q ? tedarikciler.filter((t) => t.ad.toLocaleLowerCase("tr-TR").includes(q)) : tedarikciler;
  }, [tedarikciler, arama]);

  const borclular = tedarikciler.filter((t) => t.bakiye > 0);
  const toplamBorc = borclular.reduce((acc, t) => acc + t.bakiye, 0);
  const toplamHarcama = tedarikciler.reduce((acc, t) => acc + t.toplamHarcama, 0);
  const bekleyenSayisi = tedarikciler.reduce(
    (acc, t) => acc + t.hareketler.filter((h) => h.tur === "bekleyen_gider").length,
    0
  );

  return (
    <div className="flex flex-col gap-4">
      <Card className={cn(toplamBorc > 0 && "border-rose-200 dark:border-rose-500/30")}>
        <CardContent className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">Tedarikçilere Toplam Borç (Bakiye)</p>
          <p
            className={cn(
              "tabular text-3xl font-semibold",
              toplamBorc > 0 ? "text-rose-700 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"
            )}
          >
            {paraFormat(toplamBorc)}
          </p>
          <p className="text-sm text-muted-foreground">
            {borclular.length > 0 ? `${borclular.length} tedarikçiye borç var` : "Açık cari borç yok"}
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">Tedarikçi Sayısı</p>
            <p className="tabular text-2xl font-semibold">{tedarikciler.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">Toplam Harcama</p>
            <p className="tabular text-2xl font-semibold text-primary">{paraFormat(toplamHarcama)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">Ödeme Bilgisi Bekleyen</p>
            <p className={cn("tabular text-2xl font-semibold", bekleyenSayisi > 0 && "text-amber-600 dark:text-amber-400")}>
              {bekleyenSayisi} kayıt
            </p>
          </CardContent>
        </Card>
      </div>

      {bekleyenSayisi > 0 && (
        <p className="text-sm text-muted-foreground">
          Ödeme yöntemi seçilmemiş kayıtlar Kasa/Banka/Kredi Kartı mutabakatına ve cari toplamlara düşmez. Tedarikçiyi
          açıp ilgili kayıtta ödeme bilgisini girin.
        </p>
      )}

      <Input
        value={arama}
        onChange={(e) => setArama(e.target.value)}
        placeholder="Tedarikçi ara"
        aria-label="Tedarikçi ara"
        className="max-w-sm"
      />

      {filtreli.length === 0 ? (
        <EmptyState
          icon={Truck}
          title={tedarikciler.length === 0 ? "Henüz tedarikçi kaydı yok." : "Aramayla eşleşen tedarikçi yok."}
          description={
            tedarikciler.length === 0
              ? "Giderlere tedarikçi adı girildikçe burada tedarikçi bazında listelenir."
              : undefined
          }
          compact
        />
      ) : (
        <Table className="min-w-[680px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Tedarikçi</TableHead>
              <TableHead>Son İşlem</TableHead>
              <TableHead className="text-right">Borç</TableHead>
              <TableHead className="text-right">Ödenen</TableHead>
              <TableHead className="text-right">Bakiye</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtreli.map((t) => {
              const acik = acikAnahtar === t.anahtar;
              return (
                <TedarikciSatiri
                  key={t.anahtar}
                  t={t}
                  acik={acik}
                  degistir={() => setAcikAnahtar(acik ? null : t.anahtar)}
                  bankaHesaplari={bankaHesaplari}
                  kartlar={kartlar}
                  duzenlenebilir={duzenlenebilir}
                />
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function TedarikciSatiri({
  t,
  acik,
  degistir,
  bankaHesaplari,
  kartlar,
  duzenlenebilir,
}: {
  t: TedarikciOzeti;
  acik: boolean;
  degistir: () => void;
  bankaHesaplari: KlinikBankaHesabi[];
  kartlar: KlinikKrediKarti[];
  duzenlenebilir: boolean;
}) {
  const bekleyen = t.hareketler.filter((h) => h.tur === "bekleyen_gider").length;
  return (
    <>
      <TableRow className="cursor-pointer" onClick={degistir} aria-expanded={acik}>
        <TableCell className="font-medium">
          <span className="flex flex-wrap items-center gap-1.5">
            {acik ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
            {t.ad}
            {bekleyen > 0 && <StatusBadge tone="amber">{bekleyen} ödeme bilgisi bekliyor</StatusBadge>}
          </span>
        </TableCell>
        <TableCell className="text-muted-foreground">{tarihFormat(t.sonTarih)}</TableCell>
        <TableCell className="tabular text-right text-muted-foreground">{paraFormat(t.borc)}</TableCell>
        <TableCell className="tabular text-right text-muted-foreground">{paraFormat(t.odenen)}</TableCell>
        <TableCell
          className={cn(
            "tabular text-right font-medium",
            t.bakiye > 0 ? "text-rose-700 dark:text-rose-400" : t.borc > 0 && "text-emerald-700 dark:text-emerald-400"
          )}
        >
          {paraFormat(t.bakiye)}
        </TableCell>
      </TableRow>
      {acik && (
        <TableRow className="hover:bg-transparent">
          <td colSpan={5} className="bg-muted/30 px-4 py-3">
            <CariPaneli t={t} bankaHesaplari={bankaHesaplari} kartlar={kartlar} duzenlenebilir={duzenlenebilir} />
          </td>
        </TableRow>
      )}
    </>
  );
}

/** Kronolojik hareketlere yürüyen bakiye ekler (SQL klinik_cari_bakiyeler ile aynı kural). */
function yuruyenBakiyeli(hareketler: TedarikciHareketi[]) {
  const sonuc: { h: TedarikciHareketi; yuruyen: number }[] = [];
  let toplam = 0;
  for (const h of hareketler) {
    if (h.tur === "cari_gider") toplam += h.tutar;
    else if (h.tur === "cari_odeme") toplam -= h.tutar;
    sonuc.push({ h, yuruyen: Math.round(toplam * 100) / 100 });
  }
  return sonuc;
}

function CariPaneli({
  t,
  bankaHesaplari,
  kartlar,
  duzenlenebilir,
}: {
  t: TedarikciOzeti;
  bankaHesaplari: KlinikBankaHesabi[];
  kartlar: KlinikKrediKarti[];
  duzenlenebilir: boolean;
}) {
  const [odemeFormuAcik, setOdemeFormuAcik] = useState(false);

  // Yürüyen bakiye: yalnız Cariye Ekle (+) ve cari ödemesi (−) bakiyeyi oynatır; ödenmiş gider net 0,
  // ödeme yöntemi boş gider hiçbir toplamda yok. SQL (klinik_cari_bakiyeler) ile aynı kural.
  const satirlar = yuruyenBakiyeli(t.hareketler);

  const bankaMap = new Map(bankaHesaplari.map((b) => [b.id, b]));
  const kartMap = new Map(kartlar.map((k) => [k.id, k]));

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div className="rounded-xl border border-border bg-card px-3 py-2">
          <p className="text-xs text-muted-foreground">Borç</p>
          <p className="tabular font-medium">{paraFormat(t.borc)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-3 py-2">
          <p className="text-xs text-muted-foreground">Ödenen</p>
          <p className="tabular font-medium">{paraFormat(t.odenen)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-3 py-2">
          <p className="text-xs text-muted-foreground">Bakiye</p>
          <p className={cn("tabular font-semibold", t.bakiye > 0 && "text-rose-700 dark:text-rose-400")}>
            {paraFormat(t.bakiye)}
          </p>
        </div>
      </div>

      {duzenlenebilir && (
        <div className="flex flex-wrap items-center gap-2">
          {t.bakiye > 0 ? (
            <Button type="button" size="sm" onClick={() => setOdemeFormuAcik((a) => !a)}>
              <CirclePlus />
              Ödeme Ekle
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Cari bakiye yok — ödeme eklemek için önce giderlerde &quot;Cariye Ekle&quot; ile borç yazın.
            </p>
          )}
        </div>
      )}

      {odemeFormuAcik && t.bakiye > 0 && (
        <CariOdemeFormu
          tedarikciAdi={t.ad}
          azamiTutar={t.bakiye}
          bankaHesaplari={bankaHesaplari}
          kartlar={kartlar}
          kapat={() => setOdemeFormuAcik(false)}
        />
      )}

      <ul className="flex flex-col divide-y divide-border">
        {satirlar.map(({ h, yuruyen: bakiye }) => (
          <HareketSatiri
            key={`${h.tur}-${h.id}`}
            h={h}
            bakiye={bakiye}
            bankaMap={bankaMap}
            kartMap={kartMap}
            bankaHesaplari={bankaHesaplari}
            kartlar={kartlar}
            duzenlenebilir={duzenlenebilir}
          />
        ))}
      </ul>
    </div>
  );
}

function HareketSatiri({
  h,
  bakiye,
  bankaMap,
  kartMap,
  bankaHesaplari,
  kartlar,
  duzenlenebilir,
}: {
  h: TedarikciHareketi;
  bakiye: number;
  bankaMap: Map<string, KlinikBankaHesabi>;
  kartMap: Map<string, KlinikKrediKarti>;
  bankaHesaplari: KlinikBankaHesabi[];
  kartlar: KlinikKrediKarti[];
  duzenlenebilir: boolean;
}) {
  const [duzenleniyor, setDuzenleniyor] = useState(false);
  const [silinecek, setSilinecek] = useState(false);
  const [silmeHatasi, setSilmeHatasi] = useState<string | null>(null);
  const [silmeBekliyor, startTransition] = useTransition();

  const banka = h.banka_hesap_id ? bankaMap.get(h.banka_hesap_id) : undefined;
  const kart = h.kredi_karti_id ? kartMap.get(h.kredi_karti_id) : undefined;
  const odemeMetni = h.odeme_tipi
    ? h.odeme_tipi === "cari"
      ? "Cariye eklendi"
      : h.odeme_tipi === "havale" && banka
        ? `Havale (${banka.banka_adi})`
        : h.odeme_tipi === "kredi_karti" && kart
          ? `Kredi Kartı (${kart.kart_adi})`
          : ODEME_TIPI_ETIKET[h.odeme_tipi]
    : null;

  const bekleyen = h.tur === "bekleyen_gider";
  // Ödenmiş gider: aynı tutar hem Borç hem Ödeme sütununda (bakiyeyi etkilemez, ekstrede görünür).
  const borcTutari = h.tur === "cari_gider" || h.tur === "odenmis_gider" ? h.tutar : null;
  const odemeTutari = h.tur === "cari_odeme" || h.tur === "odenmis_gider" ? h.tutar : null;

  return (
    <li className={cn("flex flex-col gap-2 py-2 text-sm", bekleyen && "opacity-70")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="w-24 shrink-0 text-muted-foreground">{tarihFormat(h.tarih)}</span>
        {h.tur === "cari_odeme" ? (
          <StatusBadge tone="emerald">Cari ödemesi</StatusBadge>
        ) : (
          h.kategori && <StatusBadge tone="slate">{HARCAMA_KATEGORI_ETIKET[h.kategori]}</StatusBadge>
        )}
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {[h.aciklama, h.fatura_no ? `Fatura ${h.fatura_no}` : null].filter(Boolean).join(" · ") || "—"}
        </span>
        {odemeMetni ? (
          <span className="text-muted-foreground">{odemeMetni}</span>
        ) : (
          <StatusBadge tone="amber">Ödeme bilgisi bekliyor</StatusBadge>
        )}
        <span className="tabular w-24 text-right">{borcTutari != null ? paraFormat(borcTutari) : "—"}</span>
        <span className="tabular w-24 text-right">{odemeTutari != null ? paraFormat(odemeTutari) : "—"}</span>
        <span className="tabular w-24 text-right text-muted-foreground">{bekleyen ? "—" : paraFormat(bakiye)}</span>

        {duzenlenebilir && h.tur !== "cari_odeme" && h.tur !== "cari_gider" && !duzenleniyor && (
          <Button
            type="button"
            size={odemeMetni ? "icon-sm" : "sm"}
            variant={odemeMetni ? "ghost" : "outline"}
            aria-label="Ödeme bilgisini düzenle"
            onClick={() => setDuzenleniyor(true)}
          >
            {odemeMetni ? <Pencil /> : "Ödeme Bilgisi Gir"}
          </Button>
        )}

        {duzenlenebilir && h.tur === "cari_odeme" && !silinecek && (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Cari ödemesini sil"
            onClick={() => setSilinecek(true)}
          >
            <Trash2 />
          </Button>
        )}
        {duzenlenebilir && h.tur === "cari_odeme" && silinecek && (
          <span className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Silinsin mi?</span>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={silmeBekliyor}
              onClick={() =>
                startTransition(async () => {
                  const sonuc = await cariOdemeSil(h.id);
                  setSilmeHatasi(sonuc?.success ? null : (sonuc?.message ?? "Silinemedi."));
                  setSilinecek(false);
                })
              }
            >
              Sil
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={silmeBekliyor} onClick={() => setSilinecek(false)}>
              Vazgeç
            </Button>
          </span>
        )}
      </div>
      {silmeHatasi && (
        <p role="alert" className="text-xs text-destructive">
          {silmeHatasi}
        </p>
      )}
      {duzenleniyor && (
        <OdemeBilgisiFormu
          h={h}
          bankaHesaplari={bankaHesaplari}
          kartlar={kartlar}
          kapat={() => setDuzenleniyor(false)}
        />
      )}
    </li>
  );
}

function CariOdemeFormu({
  tedarikciAdi,
  azamiTutar,
  bankaHesaplari,
  kartlar,
  kapat,
}: {
  tedarikciAdi: string;
  azamiTutar: number;
  bankaHesaplari: KlinikBankaHesabi[];
  kartlar: KlinikKrediKarti[];
  kapat: () => void;
}) {
  const [sonuc, formAction, isPending] = useActionState(cariOdemeEkle, null);
  const [tip, setTip] = useState<OdemeTipi | "">("");

  useBasariOlunca(sonuc, () => kapat());

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
      <input type="hidden" name="tedarikci_adi" value={tedarikciAdi} />
      <input type="hidden" name="odeme_tipi" value={tip} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cari-tutar">Tutar (₺) — en çok {paraFormat(azamiTutar)}</Label>
          <Input
            id="cari-tutar"
            name="tutar"
            type="number"
            min={0.01}
            max={azamiTutar}
            step="0.01"
            required
            disabled={isPending}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cari-tarih">Tarih</Label>
          <Input id="cari-tarih" name="tarih" type="date" defaultValue={bugunIstanbulTarihi()} required disabled={isPending} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Ödeme Yöntemi</Label>
        <div className="grid grid-cols-3 gap-2">
          {ODEME_TIPI_SECENEKLERI.map((s) => (
            <button
              key={s.value}
              type="button"
              disabled={isPending}
              aria-pressed={tip === s.value}
              onClick={() => setTip(s.value)}
              className={cn(
                "rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                tip === s.value ? SECILI_SINIF : SECILMEMIS_SINIF
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Nakit Kasa&apos;dan, havale seçilen banka hesabından çıkış olur; kredi kartı Kasa/Banka&apos;ya girmez, kartın
          borcuna yazılır. Raporlar&apos;da ayrıca gider sayılmaz (gider &quot;Cariye Ekle&quot; anında sayıldı).
        </p>
      </div>

      {tip === "havale" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cari-banka">Banka Hesabı</Label>
          <select id="cari-banka" name="banka_hesap_id" defaultValue="" required disabled={isPending} className={SELECT_SINIF}>
            <option value="" disabled>
              Hesap seçin
            </option>
            {bankaHesaplari.map((b) => (
              <option key={b.id} value={b.id}>
                {b.banka_adi}
                {b.sube ? ` — ${b.sube}` : ""}
              </option>
            ))}
          </select>
          {bankaHesaplari.length === 0 && (
            <p className="text-xs text-muted-foreground">Önce Şirket Bilgileri&apos;nden banka hesabı ekleyin.</p>
          )}
        </div>
      )}

      {tip === "kredi_karti" && kartlar.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cari-kart">Kredi Kartı (opsiyonel)</Label>
          <select id="cari-kart" name="kredi_karti_id" defaultValue="" disabled={isPending} className={SELECT_SINIF}>
            <option value="">Kart seçilmedi</option>
            {kartlar.map((k) => (
              <option key={k.id} value={k.id}>
                {k.kart_adi} — {k.banka_adi}
                {k.son_dort_hane ? ` •••• ${k.son_dort_hane}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cari-aciklama">Not (opsiyonel)</Label>
        <Input id="cari-aciklama" name="aciklama" disabled={isPending} />
      </div>

      {sonuc && !sonuc.success && (
        <p role="alert" className="text-sm text-destructive">
          {sonuc.message}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={kapat} disabled={isPending}>
          İptal
        </Button>
        <Button type="submit" size="sm" disabled={isPending || !tip}>
          {isPending ? "Kaydediliyor..." : "Ödemeyi Kaydet"}
        </Button>
      </div>
    </form>
  );
}

function OdemeBilgisiFormu({
  h,
  bankaHesaplari,
  kartlar,
  kapat,
}: {
  h: TedarikciHareketi;
  bankaHesaplari: KlinikBankaHesabi[];
  kartlar: KlinikKrediKarti[];
  kapat: () => void;
}) {
  const [sonuc, formAction, isPending] = useActionState(giderOdemeBilgisiGuncelle, null);
  const [tip, setTip] = useState<OdemeTipi | "">(h.odeme_tipi && h.odeme_tipi !== "cari" ? h.odeme_tipi : "");

  useBasariOlunca(sonuc, () => kapat());

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
      <input type="hidden" name="id" value={h.id} />
      <input type="hidden" name="odeme_tipi" value={tip} />

      <div className="flex flex-col gap-1.5">
        <Label>Ödeme Yöntemi</Label>
        <div className="grid grid-cols-3 gap-2">
          {ODEME_TIPI_SECENEKLERI.map((s) => (
            <button
              key={s.value}
              type="button"
              disabled={isPending}
              aria-pressed={tip === s.value}
              onClick={() => setTip(s.value)}
              className={cn(
                "rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                tip === s.value ? SECILI_SINIF : SECILMEMIS_SINIF
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {tip === "havale" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`banka-${h.id}`}>Banka Hesabı</Label>
          <select
            id={`banka-${h.id}`}
            name="banka_hesap_id"
            defaultValue={h.banka_hesap_id ?? ""}
            required
            disabled={isPending}
            className={SELECT_SINIF}
          >
            <option value="" disabled>
              Hesap seçin
            </option>
            {bankaHesaplari.map((b) => (
              <option key={b.id} value={b.id}>
                {b.banka_adi}
                {b.sube ? ` — ${b.sube}` : ""}
              </option>
            ))}
          </select>
          {bankaHesaplari.length === 0 && (
            <p className="text-xs text-muted-foreground">Önce Şirket Bilgileri&apos;nden banka hesabı ekleyin.</p>
          )}
        </div>
      )}

      {tip === "kredi_karti" && kartlar.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`kart-${h.id}`}>Kredi Kartı (opsiyonel)</Label>
          <select
            id={`kart-${h.id}`}
            name="kredi_karti_id"
            defaultValue={h.kredi_karti_id ?? ""}
            disabled={isPending}
            className={SELECT_SINIF}
          >
            <option value="">Kart seçilmedi</option>
            {kartlar.map((k) => (
              <option key={k.id} value={k.id}>
                {k.kart_adi} — {k.banka_adi}
                {k.son_dort_hane ? ` •••• ${k.son_dort_hane}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {sonuc && !sonuc.success && (
        <p role="alert" className="text-sm text-destructive">
          {sonuc.message}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={kapat} disabled={isPending}>
          İptal
        </Button>
        <Button type="submit" size="sm" disabled={isPending || !tip}>
          {isPending ? "Kaydediliyor..." : "Kaydet"}
        </Button>
      </div>
    </form>
  );
}
