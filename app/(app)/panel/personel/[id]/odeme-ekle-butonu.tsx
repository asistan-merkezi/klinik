"use client";

import { useActionState, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  ODEME_TIPI_GOSTERILEN_TURLER,
  PERSONEL_ODEME_TIPI_ETIKET,
  type ManuelHesapHareketTuru,
  type PersonelOdemeTipi,
} from "@/types/hesap-hareket";
import { hesapHareketiEkle } from "./actions";

// "Maaş" DB'de ayrı bir tür DEĞİL — hakediş(maaş) elle eklenemez kuralı
// (personel_hesap_hareket_ekle RPC + DB CHECK, bkz. personel/CLAUDE.md)
// hiç ihlal edilmiyor: "Maaş" da altta tur='odeme' olarak yazılıyor, sadece
// tutar önerisi ve açıklama etiketi farklı — maaş ödeme TARİHLERİNİ takip
// edebilmek için "Diğer Ödeme"den ayrı bir hızlı-giriş kısayolu. Cari hesaba
// manuel eklenebilen TÜM türler burada toplandı (eskiden ayrı bir "Hareket
// Ekle" formu vardı — iki paralel giriş noktası bırakılmadı).
type OdemeKategori = "maas" | "odeme" | "avans" | "prim" | "yol" | "yemek" | "mesai" | "kesinti";

const KATEGORI_ETIKET: Record<OdemeKategori, string> = {
  maas: "Maaş",
  odeme: "Diğer Ödeme",
  avans: "Avans",
  prim: "Prim",
  yol: "Yol",
  yemek: "Yemek",
  mesai: "Fazla Mesai",
  kesinti: "Kesinti",
};

const KATEGORI_TUR: Record<OdemeKategori, ManuelHesapHareketTuru> = {
  maas: "odeme",
  odeme: "odeme",
  avans: "avans",
  prim: "prim",
  yol: "yol",
  yemek: "yemek",
  mesai: "mesai",
  kesinti: "kesinti",
};

const ODEME_TIPI_SECILI_SINIFI =
  "!border-primary !bg-primary !text-primary-foreground hover:!bg-primary/90";

export function OdemeEkleButonu({
  personelId,
  guncelBakiye,
  sabitMaas,
  buAykiAvansToplami,
  bankaHesaplari,
  otomatikAc,
}: {
  personelId: string;
  guncelBakiye: number;
  sabitMaas: number | null;
  buAykiAvansToplami: number;
  bankaHesaplari: KlinikBankaHesabi[];
  otomatikAc?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const idOnEki = "odeme-ekle";
  const netMaasOnerisi = Math.max(0, (sabitMaas ?? 0) - buAykiAvansToplami);
  const [acik, setAcik] = useState(() => otomatikAc ?? false);

  // Personel listesinden "Ödeme" ile gelindiğinde (?odemeEkle=1) popup zaten
  // açık başlıyor — parametre tek seferlik bir tetikleyici, geri/yenilemede
  // tekrar açılmasın diye URL'den hemen temizleniyor.
  useEffect(() => {
    if (!otomatikAc) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("odemeEkle");
    router.replace(`${pathname}?${params.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const eklemeAction = hesapHareketiEkle.bind(null, personelId);
  const [durum, formAction, isPending] = useActionState(eklemeAction, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);
  const [kategori, setKategori] = useState<OdemeKategori>("maas");
  const [tutar, setTutar] = useState(String(netMaasOnerisi));
  const [aciklama, setAciklama] = useState("Maaş");
  const [odemeTipi, setOdemeTipi] = useState<PersonelOdemeTipi | null>(null);
  const odemeTipiGosterilir = ODEME_TIPI_GOSTERILEN_TURLER.includes(KATEGORI_TUR[kategori]);

  function sifirla() {
    setKategori("maas");
    setTutar(String(netMaasOnerisi));
    setAciklama("Maaş");
    setOdemeTipi(null);
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
    if (!ODEME_TIPI_GOSTERILEN_TURLER.includes(KATEGORI_TUR[deger])) {
      setOdemeTipi(null);
    }
    // Tutar önerisi: Maaş → sabit maaş EKSİ bu ay verilen avans (avans ayrıca
    // bir daha ödenmesin diye), Diğer Ödeme → güncel bakiye (o ana kadar
    // birikmiş, henüz ödenmemiş her şey), geri kalanı keyfi olduğu için
    // öneri yok.
    if (deger === "maas") {
      setTutar(String(netMaasOnerisi));
      setAciklama("Maaş");
    } else if (deger === "odeme") {
      setTutar(String(Math.max(0, guncelBakiye)));
      setAciklama("");
    } else {
      setTutar("");
      setAciklama("");
    }
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAcik(true)}>
        <Plus />
        Ödeme Ekle
      </Button>
      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ödeme Ekle</DialogTitle>
          </DialogHeader>
          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="tur" value={KATEGORI_TUR[kategori]} />
            <input type="hidden" name="odeme_tipi" value={odemeTipiGosterilir ? (odemeTipi ?? "") : ""} />

            <div className="flex flex-col gap-1">
              <Label>Kategori</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(Object.keys(KATEGORI_ETIKET) as OdemeKategori[]).map((k) => (
                  <Button
                    key={k}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    className={cn(kategori === k && ODEME_TIPI_SECILI_SINIFI)}
                    onClick={() => kategoriSec(k)}
                  >
                    {KATEGORI_ETIKET[k]}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${idOnEki}-tutar`}>Tutar (₺)</Label>
              <Input
                id={`${idOnEki}-tutar`}
                name="tutar"
                type="number"
                min={0}
                step="0.01"
                required
                disabled={isPending}
                value={tutar}
                onChange={(e) => setTutar(e.target.value)}
              />
              {kategori === "maas" && (
                <p className="text-xs text-muted-foreground">
                  {sabitMaas == null
                    ? "Bu personelin sabit maaşı tanımlı değil"
                    : buAykiAvansToplami > 0
                      ? `Sabit maaş (${sabitMaas.toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}) − bu ay verilen avans (${buAykiAvansToplami.toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}) önerisi`
                      : "Sabit maaş önerisi"}{" "}
                  — istersen değiştir.
                </p>
              )}
              {kategori === "odeme" && (
                <p className="text-xs text-muted-foreground">Güncel bakiye önerisi — istersen değiştir.</p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${idOnEki}-tarih`}>Tarih</Label>
              <Input
                id={`${idOnEki}-tarih`}
                name="tarih"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
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
                      className={cn(odemeTipi === tip && ODEME_TIPI_SECILI_SINIFI)}
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
                <Label htmlFor={`${idOnEki}-banka_hesap_id`}>Banka Hesabı</Label>
                {bankaHesaplari.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Kayıtlı banka hesabı yok — Finans &gt; Banka&apos;dan hesap ekleyin.
                  </p>
                ) : (
                  <Select
                    name="banka_hesap_id"
                    disabled={isPending}
                    items={bankaHesaplari.map((b) => ({
                      value: b.id,
                      label: b.sube ? `${b.banka_adi} — ${b.sube}` : b.banka_adi,
                    }))}
                  >
                    <SelectTrigger id={`${idOnEki}-banka_hesap_id`} className="w-full">
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

            <Button type="submit" disabled={isPending} className="w-fit">
              {isPending ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
