"use client";

import { tlFark } from "@/lib/para";
import { IslemAnahtari } from "@/components/panel/islem-anahtari";
import { bugunIstanbulTarihi, formatDate } from "@/lib/datetime";
import { useActionState, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OdemeYontemi } from "@/types/odeme";
import type { KlinikBankaHesabi } from "@/types/klinik";
import { OdemeTipiSecici, ODEME_TIPI_ETIKETLERI } from "./odeme-tipi-secici";
import { hastaIadesiVer, iadeSecenekleriGetir, type IadeEdilebilirOdeme } from "./actions";

const paraFormat = (tutar: number) => tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

const odemeEtiketi = (o: IadeEdilebilirOdeme) =>
  `${formatDate(o.tarih)} · ${ODEME_TIPI_ETIKETLERI[o.yontem as OdemeYontemi] ?? o.yontem} · ${paraFormat(o.tutar)} (iade edilebilir: ${paraFormat(o.kalan)})`;

export function HastaIadesiButonu({
  hastaId,
  hastaAdSoyad,
  bankaHesaplari,
  guncelBakiye,
}: {
  hastaId: string;
  hastaAdSoyad: string;
  bankaHesaplari: KlinikBankaHesabi[];
  guncelBakiye: number;
}) {
  const idOnEki = useId();
  const [acik, setAcik] = useState(false);
  const [odemeTipi, setOdemeTipi] = useState<OdemeYontemi>("nakit");
  const [aciklamaMetni, setAciklamaMetni] = useState("");
  const [tutarMetni, setTutarMetni] = useState("");
  const [bankaHesapId, setBankaHesapId] = useState<string | undefined>(undefined);
  const [kaynakId, setKaynakId] = useState<string | undefined>(undefined);
  const [istisna, setIstisna] = useState(false);
  const [gerekce, setGerekce] = useState("");
  const [durum, formAction, isPending] = useActionState(hastaIadesiVer.bind(null, hastaId), null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  const secenekler = useQuery({
    queryKey: ["iade-secenekleri", hastaId, durum],
    queryFn: () => iadeSecenekleriGetir(hastaId),
    enabled: acik,
  });
  const odemeler = secenekler.data?.odemeler ?? [];
  const istisnaYapabilir = secenekler.data?.istisnaYapabilir ?? false;
  const kaynak = odemeler.find((o) => o.id === kaynakId);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      setAcik(false);
      setOdemeTipi("nakit");
      setAciklamaMetni("");
      setTutarMetni("");
      setBankaHesapId(undefined);
      setKaynakId(undefined);
      setIstisna(false);
      setGerekce("");
    }
  }

  // Yöntem hem kolona hem okunabilirlik için açıklama metnine etiket olarak yazılıyor (normal iadede yöntem kaynak ödemeden gelir).
  const yontem = istisna ? odemeTipi : ((kaynak?.yontem as OdemeYontemi | undefined) ?? odemeTipi);
  const etiketOnEki = `${ODEME_TIPI_ETIKETLERI[yontem]} iadesi`;
  const birlesikAciklama = aciklamaMetni.trim() ? `${etiketOnEki} — ${aciklamaMetni.trim()}` : etiketOnEki;

  const tutar = Number(tutarMetni) || 0;
  const iadeSonrasiBakiye = tlFark(guncelBakiye, tutar);
  const kalanAsildi = !istisna && !!kaynak && tutar > kaynak.kalan;

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setAcik(true)}>
        <Undo2 />
        İade Ver
      </Button>
      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>İade Ver</DialogTitle>
          </DialogHeader>
          <p className="text-sm font-medium">{hastaAdSoyad}</p>
          <p
            className={`text-sm font-medium tabular-nums ${
              guncelBakiye < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            Güncel Bakiye: {paraFormat(guncelBakiye)}
          </p>
          <form action={formAction} className="flex flex-col gap-3">
            <IslemAnahtari sonuc={durum} />
            <input type="hidden" name="aciklama" value={birlesikAciklama} />
            <input type="hidden" name="istisna" value={istisna ? "on" : ""} />
            <input type="hidden" name="kaynak_hareket_id" value={istisna ? "" : (kaynakId ?? "")} />
            <input type="hidden" name="odeme_yontemi" value={istisna ? odemeTipi : ""} />
            <input
              type="hidden"
              name="banka_hesap_id"
              value={istisna && odemeTipi === "banka_havalesi" ? (bankaHesapId ?? "") : ""}
            />
            <input type="hidden" name="istisna_gerekcesi" value={istisna ? gerekce : ""} />

            {!istisna && (
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${idOnEki}-kaynak`}>İade Edilecek Ödeme</Label>
                {secenekler.isLoading ? (
                  <p className="text-sm text-muted-foreground">Ödemeler yükleniyor...</p>
                ) : odemeler.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    İade edilebilir ödeme yok (iade, bir ödemenin kalanını aşamaz).
                    {istisnaYapabilir ? " Gerekirse aşağıdan istisna iade yapılabilir." : " Gerekirse klinik yöneticisine başvurun."}
                  </p>
                ) : (
                  <Select
                    disabled={isPending}
                    value={kaynakId}
                    onValueChange={(v) => {
                      setKaynakId(v ?? undefined);
                      const o = odemeler.find((x) => x.id === v);
                      if (o) setTutarMetni(String(o.kalan));
                    }}
                    items={odemeler.map((o) => ({ value: o.id, label: odemeEtiketi(o) }))}
                  >
                    <SelectTrigger id={`${idOnEki}-kaynak`} className="w-full">
                      <SelectValue placeholder="Seçiniz..." />
                    </SelectTrigger>
                    <SelectContent>
                      {odemeler.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {odemeEtiketi(o)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {istisnaYapabilir && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={istisna}
                  onChange={(e) => setIstisna(e.target.checked)}
                  disabled={isPending}
                />
                İstisna iade (ödemeye bağlı değil — yalnız yönetici, gerekçe zorunlu)
              </label>
            )}

            {istisna && (
              <>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${idOnEki}-gerekce`}>İstisna Gerekçesi</Label>
                  <Input
                    id={`${idOnEki}-gerekce`}
                    value={gerekce}
                    onChange={(e) => setGerekce(e.target.value)}
                    placeholder="Örn. arşivden aktarılan ödeme; yanlış yöntemle girilmiş tahsilat"
                    disabled={isPending}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>İade Yöntemi</Label>
                  <OdemeTipiSecici
                    value={odemeTipi}
                    onChange={(deger) => {
                      setOdemeTipi(deger);
                      if (deger !== "banka_havalesi") setBankaHesapId(undefined);
                    }}
                    disabled={isPending}
                  />
                </div>
                {odemeTipi === "banka_havalesi" && (
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`${idOnEki}-banka_hesap_id`}>Banka Hesabı</Label>
                    {bankaHesaplari.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Kayıtlı banka hesabı yok — Finans &gt; Banka&apos;dan hesap ekleyin.
                      </p>
                    ) : (
                      <Select
                        disabled={isPending}
                        value={bankaHesapId}
                        onValueChange={(v) => setBankaHesapId(v ?? undefined)}
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
              </>
            )}

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${idOnEki}-tutar`}>Tutar (₺)</Label>
              <Input
                id={`${idOnEki}-tutar`}
                name="tutar"
                type="number"
                min={0}
                step="0.01"
                max={!istisna && kaynak ? kaynak.kalan : undefined}
                required
                value={tutarMetni}
                onChange={(e) => setTutarMetni(e.target.value)}
                disabled={isPending}
              />
              {kalanAsildi && <p className="text-xs text-destructive">Tutar seçilen ödemenin iade edilebilir kalanını aşıyor.</p>}
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${idOnEki}-tarih`}>Tarih</Label>
              <Input
                id={`${idOnEki}-tarih`}
                name="tarih"
                type="date"
                defaultValue={bugunIstanbulTarihi()}
                required
                disabled={isPending}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${idOnEki}-aciklama`}>Açıklama (opsiyonel)</Label>
              <Input
                id={`${idOnEki}-aciklama`}
                value={aciklamaMetni}
                onChange={(e) => setAciklamaMetni(e.target.value)}
                disabled={isPending}
              />
            </div>

            {tutar > 0 && (
              <div className="flex flex-col gap-1 rounded-2xl border border-border p-3 text-sm">
                <div className="flex justify-between font-medium">
                  <span>İade Sonrası Bakiye</span>
                  <span
                    className={`tabular-nums ${iadeSonrasiBakiye < 0 ? "text-rose-600 dark:text-rose-400" : ""}`}
                  >
                    {paraFormat(iadeSonrasiBakiye)}
                  </span>
                </div>
                {iadeSonrasiBakiye < 0 && guncelBakiye >= 0 && (
                  <p className="text-xs text-muted-foreground">
                    İade tutarı hastanın mevcut alacağından fazla — bakiye borca düşecek.
                  </p>
                )}
              </div>
            )}

            {durum && (
              <p
                role="alert"
                className={`text-sm ${durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}
              >
                {durum.message}
              </p>
            )}

            <Button type="submit" disabled={isPending || kalanAsildi} className="w-fit">
              {isPending ? "Kaydediliyor..." : "İadeyi Kaydet"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
