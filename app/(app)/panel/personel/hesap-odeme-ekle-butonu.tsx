"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { KlinikBankaHesabi } from "@/types/klinik";
import {
  ODEME_KATEGORI_ETIKET,
  ODEME_KATEGORI_TUR,
  ODEME_TIPI_GOSTERILEN_TURLER,
  PERSONEL_ODEME_TIPI_ETIKET,
  type OdemeKategori,
  type PersonelOdemeTipi,
} from "@/types/hesap-hareket";
import type { HesapOzetSatir } from "./hesap-ozeti";
import { topluHesapHareketiEkle } from "./actions";

const SECILI_SINIFI = "!border-primary !bg-primary !text-primary-foreground hover:!bg-primary/90";

const paraFormatla = (tutar: number) =>
  tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

/** Sabit maaş eksi bu ay verilen avans — maaş ödemesi net gitsin, avans ayrıca bir daha ödenmesin diye (bkz. [id]/odeme-ekle-butonu.tsx). */
function maasOnerisi(satir: HesapOzetSatir) {
  return Math.max(0, (satir.maas ?? 0) - satir.buAykiAvans);
}

/**
 * Hesap sekmesinden (hub seviyesi, tek bir personel context'i olmadan)
 * ödeme eklemenin tek giriş noktası — Tekil modda personel + kategori seçilip
 * [id]/odeme-ekle-butonu.tsx ile aynı öneri mantığı uygulanır; Toplu Ödeme
 * modu bilinçli olarak SADECE Maaş'a kilitli (diğer kategorilerin kişi
 * başına doğal bir tutar önerisi yok) — personel kutucuklara tıklanarak
 * seçilir, her biri kendi (sabit maaş − bu ayki avans) tutarıyla tek
 * seferde ödenir.
 */
export function HesapOdemeEkleButonu({
  satirlar,
  bankaHesaplari,
}: {
  satirlar: HesapOzetSatir[];
  bankaHesaplari: KlinikBankaHesabi[];
}) {
  const idOnEki = "hesap-odeme-ekle";
  const [acik, setAcik] = useState(false);
  const [mod, setMod] = useState<"tekil" | "toplu">("tekil");
  const [kategori, setKategori] = useState<OdemeKategori>("maas");
  const [personelId, setPersonelId] = useState("");
  const [tutar, setTutar] = useState("");
  const [tarih, setTarih] = useState(() => new Date().toISOString().slice(0, 10));
  const [aciklama, setAciklama] = useState("Maaş");
  const [odemeTipi, setOdemeTipi] = useState<PersonelOdemeTipi | null>(null);
  const [bankaHesapId, setBankaHesapId] = useState("");
  const [secilenIdler, setSecilenIdler] = useState<Set<string>>(new Set());

  const eklemeAction = topluHesapHareketiEkle;
  const [durum, formAction, isPending] = useActionState(eklemeAction, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  const secilenSatir = satirlar.find((s) => s.personelId === personelId) ?? null;
  const etkinKategori = mod === "toplu" ? "maas" : kategori;
  const odemeTipiGosterilir = ODEME_TIPI_GOSTERILEN_TURLER.includes(ODEME_KATEGORI_TUR[etkinKategori]);

  function sifirla() {
    setMod("tekil");
    setKategori("maas");
    setPersonelId("");
    setTutar("");
    setTarih(new Date().toISOString().slice(0, 10));
    setAciklama("Maaş");
    setOdemeTipi(null);
    setBankaHesapId("");
    setSecilenIdler(new Set());
  }

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      setAcik(false);
      sifirla();
    }
  }

  function kategoriSec(deger: OdemeKategori) {
    setKategori(deger);
    if (!ODEME_TIPI_GOSTERILEN_TURLER.includes(ODEME_KATEGORI_TUR[deger])) {
      setOdemeTipi(null);
    }
    if (deger === "maas") {
      setTutar(secilenSatir ? String(maasOnerisi(secilenSatir)) : "");
      setAciklama("Maaş");
    } else if (deger === "odeme") {
      setTutar(secilenSatir ? String(Math.max(0, secilenSatir.bakiye)) : "");
      setAciklama("");
    } else {
      setTutar("");
      setAciklama("");
    }
  }

  function personelSec(id: string) {
    setPersonelId(id);
    const satir = satirlar.find((s) => s.personelId === id);
    if (!satir) return;
    if (kategori === "maas") {
      setTutar(String(maasOnerisi(satir)));
    } else if (kategori === "odeme") {
      setTutar(String(Math.max(0, satir.bakiye)));
    }
  }

  function topluPersonelToggle(id: string) {
    setSecilenIdler((mevcut) => {
      const yeni = new Set(mevcut);
      if (yeni.has(id)) {
        yeni.delete(id);
      } else {
        yeni.add(id);
      }
      return yeni;
    });
  }

  const topluKalemler = satirlar
    .filter((s) => secilenIdler.has(s.personelId))
    .map((s) => ({ personelId: s.personelId, tutar: maasOnerisi(s) }))
    .filter((k) => k.tutar > 0);
  const topluToplam = topluKalemler.reduce((acc, k) => acc + k.tutar, 0);

  const tutarSayi = Number(tutar);
  const kalemlerJson =
    mod === "toplu"
      ? JSON.stringify(topluKalemler)
      : JSON.stringify(personelId && tutarSayi > 0 ? [{ personelId, tutar: tutarSayi }] : []);

  const gonderilebilir = mod === "tekil" ? Boolean(personelId) && tutarSayi > 0 : topluKalemler.length > 0;

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAcik(true)}>
        <Plus />
        Ödeme Ekle
      </Button>
      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ödeme Ekle</DialogTitle>
          </DialogHeader>
          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="tur" value={ODEME_KATEGORI_TUR[etkinKategori]} />
            <input type="hidden" name="odeme_tipi" value={odemeTipiGosterilir ? (odemeTipi ?? "") : ""} />
            <input type="hidden" name="kalemler_json" value={kalemlerJson} />

            <div className="flex flex-col gap-1">
              <Label>Mod</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  className={cn(mod === "tekil" && SECILI_SINIFI)}
                  onClick={() => setMod("tekil")}
                >
                  Tekil
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  className={cn(mod === "toplu" && SECILI_SINIFI)}
                  onClick={() => {
                    setMod("toplu");
                    setKategori("maas");
                    setAciklama("Maaş");
                  }}
                >
                  Toplu Ödeme (Maaş)
                </Button>
              </div>
            </div>

            {mod === "tekil" && (
              <>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${idOnEki}-personel`}>Personel</Label>
                  <Select
                    disabled={isPending}
                    value={personelId}
                    onValueChange={(v) => personelSec(v as string)}
                    items={satirlar.map((s) => ({ value: s.personelId, label: `${s.adSoyad} · ${s.gorev}` }))}
                  >
                    <SelectTrigger id={`${idOnEki}-personel`} className="w-full">
                      <SelectValue placeholder="Personel seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {satirlar.map((s) => (
                        <SelectItem key={s.personelId} value={s.personelId}>
                          {s.adSoyad} · {s.gorev}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1">
                  <Label>Kategori</Label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(Object.keys(ODEME_KATEGORI_ETIKET) as OdemeKategori[]).map((k) => (
                      <Button
                        key={k}
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isPending}
                        className={cn(kategori === k && SECILI_SINIFI)}
                        onClick={() => kategoriSec(k)}
                      >
                        {ODEME_KATEGORI_ETIKET[k]}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${idOnEki}-tutar`}>Tutar (₺)</Label>
                  <Input
                    id={`${idOnEki}-tutar`}
                    type="number"
                    min={0}
                    step="0.01"
                    disabled={isPending || !personelId}
                    value={tutar}
                    onChange={(e) => setTutar(e.target.value)}
                  />
                  {kategori === "maas" && secilenSatir && (
                    <p className="text-xs text-muted-foreground">
                      {secilenSatir.maas == null
                        ? "Bu personelin sabit maaşı tanımlı değil"
                        : secilenSatir.buAykiAvans > 0
                          ? `Sabit maaş (${paraFormatla(secilenSatir.maas)}) − bu ay verilen avans (${paraFormatla(secilenSatir.buAykiAvans)}) önerisi`
                          : "Sabit maaş önerisi"}{" "}
                      — istersen değiştir.
                    </p>
                  )}
                  {kategori === "odeme" && secilenSatir && (
                    <p className="text-xs text-muted-foreground">Güncel bakiye önerisi — istersen değiştir.</p>
                  )}
                </div>
              </>
            )}

            {mod === "toplu" && (
              <div className="flex flex-col gap-1">
                <Label>Personel Seç {secilenIdler.size > 0 && `(${secilenIdler.size} seçili)`}</Label>
                <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto rounded-lg border border-border p-2">
                  {satirlar.map((s) => {
                    const oneri = maasOnerisi(s);
                    const secilebilir = s.maas != null && oneri > 0;
                    const secili = secilenIdler.has(s.personelId);
                    return (
                      <button
                        key={s.personelId}
                        type="button"
                        disabled={isPending || !secilebilir}
                        onClick={() => topluPersonelToggle(s.personelId)}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:pointer-events-none disabled:opacity-50",
                          secili ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40"
                        )}
                      >
                        <div className="flex flex-col">
                          <span className="font-medium">{s.adSoyad}</span>
                          <span className="text-xs text-muted-foreground">
                            {s.gorev}
                            {!secilebilir &&
                              (s.maas == null ? " · Sabit maaş tanımlı değil" : " · Ödenecek tutar yok")}
                          </span>
                        </div>
                        {secilebilir && <span className="font-medium tabular-nums">{paraFormatla(oneri)}</span>}
                      </button>
                    );
                  })}
                </div>
                {topluKalemler.length > 0 && (
                  <p className="text-sm font-medium">
                    Toplam: {paraFormatla(topluToplam)} ({topluKalemler.length} personel)
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${idOnEki}-tarih`}>Tarih</Label>
              <Input
                id={`${idOnEki}-tarih`}
                name="tarih"
                type="date"
                value={tarih}
                onChange={(e) => setTarih(e.target.value)}
                required
                disabled={isPending}
              />
            </div>

            {odemeTipiGosterilir && (
              <div className="flex flex-col gap-1">
                <Label>Ödeme Tipi (opsiyonel — Kasa/Banka mutabakatı için)</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(PERSONEL_ODEME_TIPI_ETIKET) as PersonelOdemeTipi[]).map((tip) => (
                    <Button
                      key={tip}
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      className={cn(odemeTipi === tip && SECILI_SINIFI)}
                      onClick={() => setOdemeTipi((onceki) => (onceki === tip ? null : tip))}
                    >
                      {PERSONEL_ODEME_TIPI_ETIKET[tip]}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {odemeTipiGosterilir && odemeTipi === "havale" && (
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${idOnEki}-banka`}>Banka Hesabı</Label>
                {bankaHesaplari.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Kayıtlı banka hesabı yok — Finans &gt; Banka&apos;dan hesap ekleyin.
                  </p>
                ) : (
                  <Select
                    name="banka_hesap_id"
                    disabled={isPending}
                    value={bankaHesapId}
                    onValueChange={(v) => setBankaHesapId(v as string)}
                    items={bankaHesaplari.map((b) => ({
                      value: b.id,
                      label: b.sube ? `${b.banka_adi} — ${b.sube}` : b.banka_adi,
                    }))}
                  >
                    <SelectTrigger id={`${idOnEki}-banka`} className="w-full">
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
                )}
              </div>
            )}

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${idOnEki}-aciklama`}>Açıklama (opsiyonel)</Label>
              <Input
                id={`${idOnEki}-aciklama`}
                name="aciklama"
                disabled={isPending}
                value={aciklama}
                onChange={(e) => setAciklama(e.target.value)}
              />
            </div>

            {durum && !durum.success && (
              <p role="alert" className="text-sm text-destructive">
                {durum.message}
              </p>
            )}

            <Button type="submit" disabled={isPending || !gonderilebilir} className="w-fit">
              {isPending
                ? "Kaydediliyor..."
                : mod === "toplu"
                  ? `Öde (${topluKalemler.length} personel · ${paraFormatla(topluToplam)})`
                  : "Kaydet"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
