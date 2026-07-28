"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { VUCUT_BOLGE_ETIKETLERI } from "@/types/musteri-detay";
import {
  BELGE_ASAMA_ETIKETLERI,
  BELGE_KATEGORI_ETIKETLERI,
  BELGE_TURU_SECENEKLERI,
  KABUL_EDILEN_MIME_TIPLERI,
  type BelgeAsama,
  type BelgeKategori,
  type BelgeTuru,
} from "@/types/musteri-belge";
import { dosyaBoyutuGecerliMi, dosyaUzantisiCikar, gorseliHazirla } from "@/lib/belge-yukleme";
import { belgeKaydet, belgeYuklemeBaslat, klinikFotoOnamKaydet } from "./actions";
import { useKarsilastirmaGruplari, useKlinikFotoOnam } from "./queries";

const KATEGORI_SECENEKLERI: BelgeKategori[] = ["radyoloji", "klinik_foto", "dokuman"];
const BOLGE_SECENEKLERI = Object.entries(VUCUT_BOLGE_ETIKETLERI).map(([value, label]) => ({ value, label }));

type DosyaDurumu = "bekliyor" | "hazirlaniyor" | "yukleniyor" | "kaydediliyor" | "tamam" | "hata";

type DosyaGirisi = {
  dosya: File;
  durum: DosyaDurumu;
  hataMesaji?: string;
};

export function YuklemeDialogu({
  musteriId,
  varsayilanKategori,
  onKapat,
}: {
  musteriId: string;
  varsayilanKategori: BelgeKategori;
  onKapat: () => void;
}) {
  const queryClient = useQueryClient();
  const dosyaInputRef = useRef<HTMLInputElement>(null);
  const kameraInputRef = useRef<HTMLInputElement>(null);

  const [kategori, setKategori] = useState<BelgeKategori>(varsayilanKategori);
  const [belgeTuru, setBelgeTuru] = useState<BelgeTuru>(BELGE_TURU_SECENEKLERI[varsayilanKategori][0].value);
  const [bolge, setBolge] = useState<string>("");
  const [cekimTarihi, setCekimTarihi] = useState<string>(new Date().toISOString().slice(0, 10));
  const [cekenKurum, setCekenKurum] = useState("");
  const [not, setNot] = useState("");
  const [asama, setAsama] = useState<BelgeAsama>("tedavi_oncesi");
  const [karsilastirmaModu, setKarsilastirmaModu] = useState<"yeni" | "mevcut">("yeni");
  const [seciliGrup, setSeciliGrup] = useState<string>("");
  const [surukleniyor, setSurukleniyor] = useState(false);
  const [dosyalar, setDosyalar] = useState<DosyaGirisi[]>([]);
  const [genelHata, setGenelHata] = useState<string | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  const { data: onam, isLoading: onamYukleniyor } = useKlinikFotoOnam(musteriId, kategori === "klinik_foto");
  const { data: mevcutGruplar } = useKarsilastirmaGruplari(musteriId, kategori === "klinik_foto");

  const onamKilitliMi = kategori === "klinik_foto" && !onamYukleniyor && !onam;

  function kategoriDegistir(yeni: BelgeKategori) {
    setKategori(yeni);
    setBelgeTuru(BELGE_TURU_SECENEKLERI[yeni][0].value);
  }

  function dosyalariEkle(yeniDosyalar: FileList | File[]) {
    setGenelHata(null);
    const gecerliler: DosyaGirisi[] = [];
    for (const dosya of Array.from(yeniDosyalar)) {
      if (!dosyaBoyutuGecerliMi(dosya)) {
        setGenelHata(`${dosya.name}: dosya boyutu çok büyük.`);
        continue;
      }
      gecerliler.push({ dosya, durum: "bekliyor" });
    }
    setDosyalar((onceki) => [...onceki, ...gecerliler]);
  }

  function dosyaDurumGuncelle(index: number, guncelleme: Partial<DosyaGirisi>) {
    setDosyalar((onceki) => onceki.map((d, i) => (i === index ? { ...d, ...guncelleme } : d)));
  }

  async function yuklemeyiBaslat() {
    if (dosyalar.length === 0) {
      setGenelHata("En az bir dosya seçin.");
      return;
    }
    if (onamKilitliMi) {
      setGenelHata("Önce fotoğraf onamı alınmalı.");
      return;
    }

    setGonderiliyor(true);
    const supabase = createClient();

    const grupId =
      kategori === "klinik_foto"
        ? karsilastirmaModu === "yeni"
          ? crypto.randomUUID()
          : seciliGrup || null
        : null;

    let herhangiBasarili = false;

    for (let i = 0; i < dosyalar.length; i++) {
      try {
        dosyaDurumGuncelle(i, { durum: "hazirlaniyor" });
        const hazirDosya = await gorseliHazirla(dosyalar[i].dosya);

        dosyaDurumGuncelle(i, { durum: "yukleniyor" });
        const uzanti = dosyaUzantisiCikar(hazirDosya);
        const baslatSonucu = await belgeYuklemeBaslat(musteriId, kategori, uzanti);
        if ("error" in baslatSonucu) throw new Error(baslatSonucu.error);

        const { error: yuklemeHatasi } = await supabase.storage
          .from("musteri-belge")
          .uploadToSignedUrl(baslatSonucu.path, baslatSonucu.token, hazirDosya);
        if (yuklemeHatasi) throw new Error(yuklemeHatasi.message);

        dosyaDurumGuncelle(i, { durum: "kaydediliyor" });
        const kayitSonucu = await belgeKaydet({
          belgeId: baslatSonucu.belgeId,
          musteriId,
          storagePath: baslatSonucu.path,
          kategori,
          belgeTuru,
          bolge: bolge || null,
          cekimTarihi,
          karsilastirmaGrubuId: grupId,
          asama: kategori === "klinik_foto" ? asama : null,
          onamId: kategori === "klinik_foto" ? (onam?.id ?? null) : null,
          not: not || null,
          cekenKurum: kategori === "radyoloji" ? cekenKurum || null : null,
          dosyaMime: hazirDosya.type,
          dosyaBoyutByte: hazirDosya.size,
        });
        if ("error" in kayitSonucu) throw new Error(kayitSonucu.error);

        dosyaDurumGuncelle(i, { durum: "tamam" });
        herhangiBasarili = true;
      } catch (e) {
        dosyaDurumGuncelle(i, { durum: "hata", hataMesaji: e instanceof Error ? e.message : "Yüklenemedi." });
      }
    }

    setGonderiliyor(false);
    if (herhangiBasarili) {
      queryClient.invalidateQueries({ queryKey: ["musteri_belge", musteriId, kategori] });
      queryClient.invalidateQueries({ queryKey: ["karsilastirma_gruplari", musteriId] });
    }
  }

  const tumuTamamlandiMi = dosyalar.length > 0 && dosyalar.every((d) => d.durum === "tamam");

  return (
    <Dialog open onOpenChange={(acik) => !acik && onKapat()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Belge / Fotoğraf Yükle</DialogTitle>
          <DialogDescription>
            jpg, jpeg, png, heic, webp, pdf · her boyutta fotoğraf otomatik küçültülür
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            {KATEGORI_SECENEKLERI.map((k) => (
              <button
                key={k}
                type="button"
                disabled={gonderiliyor}
                onClick={() => kategoriDegistir(k)}
                className={cn(
                  "flex-1 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
                  kategori === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {BELGE_KATEGORI_ETIKETLERI[k]}
              </button>
            ))}
          </div>

          {onamYukleniyor && kategori === "klinik_foto" && (
            <p className="text-sm text-muted-foreground">Onam kontrol ediliyor...</p>
          )}

          {onamKilitliMi && (
            <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <span className="font-semibold">Bu hastanın aktif fotoğraf onamı yok</span>
              <p>Klinik foto yüklemeden önce onam alınmalı.</p>
              <OnamAlButonu musteriId={musteriId} />
            </div>
          )}

          <fieldset disabled={onamKilitliMi} className="flex flex-col gap-3 disabled:opacity-50">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="belge_turu">Tür</Label>
                <Select value={belgeTuru} onValueChange={(v) => setBelgeTuru(v as BelgeTuru)} items={BELGE_TURU_SECENEKLERI[kategori]}>
                  <SelectTrigger id="belge_turu" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BELGE_TURU_SECENEKLERI[kategori].map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {kategori !== "dokuman" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="belge_bolge">Bölge</Label>
                  <Select value={bolge || undefined} onValueChange={(v) => setBolge(v ?? "")} items={BOLGE_SECENEKLERI}>
                    <SelectTrigger id="belge_bolge" className="w-full">
                      <SelectValue placeholder="Seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {BOLGE_SECENEKLERI.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="belge_tarih">{kategori === "radyoloji" ? "Çekim Tarihi" : "Tarih"}</Label>
                <Input
                  id="belge_tarih"
                  type="date"
                  value={cekimTarihi}
                  onChange={(e) => setCekimTarihi(e.target.value)}
                />
              </div>

              {kategori === "radyoloji" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ceken_kurum">Çeken Kurum</Label>
                  <Input id="ceken_kurum" value={cekenKurum} onChange={(e) => setCekenKurum(e.target.value)} />
                </div>
              )}

              {kategori === "klinik_foto" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="belge_asama">Aşama</Label>
                  <Select value={asama} onValueChange={(v) => setAsama(v as BelgeAsama)} items={Object.entries(BELGE_ASAMA_ETIKETLERI).map(([value, label]) => ({ value, label }))}>
                    <SelectTrigger id="belge_asama" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(BELGE_ASAMA_ETIKETLERI).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {kategori === "klinik_foto" && (
              <div className="flex flex-col gap-1.5">
                <Label>Karşılaştırma Grubu</Label>
                <div className="flex gap-1 rounded-lg bg-muted p-1">
                  <button
                    type="button"
                    onClick={() => setKarsilastirmaModu("yeni")}
                    className={cn(
                      "flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                      karsilastirmaModu === "yeni" ? "bg-background shadow-sm" : "text-muted-foreground"
                    )}
                  >
                    Yeni grup
                  </button>
                  <button
                    type="button"
                    disabled={!mevcutGruplar || mevcutGruplar.length === 0}
                    onClick={() => setKarsilastirmaModu("mevcut")}
                    className={cn(
                      "flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:opacity-40",
                      karsilastirmaModu === "mevcut" ? "bg-background shadow-sm" : "text-muted-foreground"
                    )}
                  >
                    Mevcut gruba ekle
                  </button>
                </div>
                {karsilastirmaModu === "mevcut" && mevcutGruplar && mevcutGruplar.length > 0 && (
                  <Select
                    value={seciliGrup || undefined}
                    onValueChange={(v) => setSeciliGrup(v ?? "")}
                    items={mevcutGruplar.map((g, i) => ({ value: g, label: `Grup ${i + 1}` }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Grup seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {mevcutGruplar.map((g, i) => (
                        <SelectItem key={g} value={g}>
                          Grup {i + 1}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="belge_not">Not</Label>
              <textarea
                id="belge_not"
                rows={2}
                value={not}
                onChange={(e) => setNot(e.target.value)}
                className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setSurukleniyor(true);
              }}
              onDragLeave={() => setSurukleniyor(false)}
              onDrop={(e) => {
                e.preventDefault();
                setSurukleniyor(false);
                if (e.dataTransfer.files.length > 0) dosyalariEkle(e.dataTransfer.files);
              }}
              className={cn(
                "flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-4 text-center text-sm",
                surukleniyor ? "border-primary bg-primary/5" : "border-border"
              )}
            >
              <p className="text-muted-foreground">Dosyaları buraya sürükleyin ya da</p>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => dosyaInputRef.current?.click()}>
                  Dosya Seç
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => kameraInputRef.current?.click()}>
                  Kamera ile Çek
                </Button>
              </div>
              <input
                ref={dosyaInputRef}
                type="file"
                multiple
                accept={KABUL_EDILEN_MIME_TIPLERI.join(",") + ",.heic,.heif"}
                className="hidden"
                onChange={(e) => e.target.files && dosyalariEkle(e.target.files)}
              />
              <input
                ref={kameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => e.target.files && dosyalariEkle(e.target.files)}
              />
            </div>

            {dosyalar.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {dosyalar.map((d, i) => (
                  <li key={i} className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5 text-xs">
                    <span className="truncate">{d.dosya.name}</span>
                    <span
                      className={cn(
                        "shrink-0 font-medium",
                        d.durum === "tamam" && "text-emerald-600 dark:text-emerald-400",
                        d.durum === "hata" && "text-destructive",
                        d.durum !== "tamam" && d.durum !== "hata" && d.durum !== "bekliyor" && "text-primary"
                      )}
                    >
                      {d.durum === "bekliyor" && "Bekliyor"}
                      {d.durum === "hazirlaniyor" && "Hazırlanıyor..."}
                      {d.durum === "yukleniyor" && "Yükleniyor..."}
                      {d.durum === "kaydediliyor" && "Kaydediliyor..."}
                      {d.durum === "tamam" && "Tamamlandı"}
                      {d.durum === "hata" && (d.hataMesaji ?? "Hata")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          {genelHata && <p className="text-sm text-destructive">{genelHata}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onKapat}>
            {tumuTamamlandiMi ? "Kapat" : "Vazgeç"}
          </Button>
          {!tumuTamamlandiMi && (
            <Button type="button" disabled={gonderiliyor || onamKilitliMi} onClick={yuklemeyiBaslat}>
              {gonderiliyor ? "Yükleniyor..." : "Yükle"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OnamAlButonu({ musteriId }: { musteriId: string }) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        type="button"
        size="sm"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setHata(null);
          const sonuc = await klinikFotoOnamKaydet(musteriId);
          setPending(false);
          if ("error" in sonuc) {
            setHata(sonuc.error);
            return;
          }
          queryClient.invalidateQueries({ queryKey: ["musteri_onam_klinik_foto", musteriId] });
        }}
        className="w-fit"
      >
        {pending ? "Kaydediliyor..." : "Onam Kaydet (kağıt form imzalandıysa)"}
      </Button>
      {hata && <p className="text-xs text-destructive">{hata}</p>}
    </div>
  );
}
