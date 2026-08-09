"use client";

import { useActionState, useRef, useState } from "react";
import { AdresSecici } from "@/components/ui/AdresSecici";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TelefonGirisi } from "@/components/ui/TelefonGirisi";
import type { SirketBilgileri } from "@/types/klinik";
import { isimBasHarfBuyukYap } from "@/lib/utils";
import { logoHazirla } from "./logo-hazirla";
import { sirketBilgileriGuncelle } from "./actions";

const textareaClass =
  "rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

// DB'den "HH:MM:SS" olarak dönebilir; <input type="time"> saniyesiz gösterir.
function saatKisalt(deger: string | null | undefined) {
  return deger ? deger.slice(0, 5) : "";
}

export function SirketBilgileriFormu({ bilgiler }: { bilgiler: SirketBilgileri | null }) {
  const [sonuc, formAction, isPending] = useActionState(sirketBilgileriGuncelle, null);
  const [ad, setAd] = useState(bilgiler?.ad ?? "");
  const [unvan, setUnvan] = useState(bilgiler?.unvan ?? "");
  const [vergiDairesi, setVergiDairesi] = useState(bilgiler?.vergi_dairesi ?? "");
  const [yetkiliKisi, setYetkiliKisi] = useState(bilgiler?.yetkili_kisi ?? "");
  const [onizleme, setOnizleme] = useState<string | null>(null);
  const [logoDosyasi, setLogoDosyasi] = useState<File | null>(null);
  const [hazirlaniyor, setHazirlaniyor] = useState(false);
  const [hazirlamaHatasi, setHazirlamaHatasi] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  async function dosyaSecildi(dosya: File) {
    setHazirlamaHatasi(null);
    setHazirlaniyor(true);
    try {
      const hazirDosya = await logoHazirla(dosya);
      setLogoDosyasi(hazirDosya);
      setOnizleme(URL.createObjectURL(hazirDosya));
    } catch (e) {
      console.error("Logo hazırlanamadı:", e);
      setHazirlamaHatasi("Görsel hazırlanamadı, lütfen başka bir dosya deneyin.");
      setLogoDosyasi(null);
      setOnizleme(null);
      if (logoInputRef.current) logoInputRef.current.value = "";
    } finally {
      setHazirlaniyor(false);
    }
  }

  // Seçilen logo, işlenmiş File nesnesi olarak React state'inde tutulur (sadece
  // <input type="file"> öğesine güvenilmez): React 19'da bir form action denemesi
  // sonrasında (örn. Storage'a yükleme geçici bir hatayla başarısız olduğunda)
  // dosya girişleri sıfırlanabiliyor — kullanıcı "Kaydet"e tekrar bastığında native
  // input boş kalıp logo hiç yüklenmeden diğer alanlar "kaydedildi" görünebiliyordu.
  // FormData'yı elle kurup her denemede state'teki dosyayı yeniden eklemek bu riski ortadan kaldırır.
  function gonder(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const veri = new FormData(e.currentTarget);
    veri.delete("logo");
    if (logoDosyasi) veri.set("logo", logoDosyasi, logoDosyasi.name);
    formAction(veri);
  }

  return (
    <form onSubmit={gonder} className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="flex size-16 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
            {onizleme || bilgiler?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={onizleme ?? bilgiler?.logo_url ?? ""}
                alt="Klinik logosu"
                className="size-full object-contain"
              />
            ) : (
              <span className="text-xs text-muted-foreground">Logo yok</span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="logo">Logo (otomatik optimize edilir)</Label>
            <input
              ref={logoInputRef}
              id="logo"
              name="logo"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml,.heic,.heif"
              disabled={isPending || hazirlaniyor}
              onChange={(e) => {
                const dosya = e.target.files?.[0];
                if (!dosya) {
                  setOnizleme(null);
                  setLogoDosyasi(null);
                  return;
                }
                void dosyaSecildi(dosya);
              }}
              className="text-sm file:cursor-pointer file:underline"
            />
            {hazirlaniyor && <p className="text-xs text-muted-foreground">Hazırlanıyor...</p>}
          </div>
        </div>
      </div>
      {hazirlamaHatasi && <p className="text-sm text-destructive">{hazirlamaHatasi}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="ad">Şirket Adı (pdf, mail, mesajlarda kullanılacak)</Label>
          <Input
            id="ad"
            name="ad"
            required
            disabled={isPending}
            value={ad}
            onChange={(e) => setAd(isimBasHarfBuyukYap(e.target.value))}
          />
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="unvan">Şirket Fatura Ünvanı</Label>
          <Input
            id="unvan"
            name="unvan"
            disabled={isPending}
            value={unvan}
            onChange={(e) => setUnvan(isimBasHarfBuyukYap(e.target.value))}
          />
        </div>

        <fieldset className="flex flex-col gap-3 sm:col-span-2">
          <legend className="mb-1 text-sm font-medium">Adres</legend>
          <AdresSecici
            prefix="adres"
            defaultIl={bilgiler?.il}
            defaultIlce={bilgiler?.ilce}
            defaultMahalle={bilgiler?.mahalle}
            disabled={isPending}
          />
          <div className="flex flex-col gap-2">
            <Label htmlFor="adres">Sokak / Cadde, Bina No, Daire</Label>
            <textarea
              id="adres"
              name="adres"
              rows={2}
              disabled={isPending}
              defaultValue={bilgiler?.adres ?? ""}
              className={textareaClass}
            />
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <Label htmlFor="vergi_dairesi">Vergi Dairesi</Label>
          <Input
            id="vergi_dairesi"
            name="vergi_dairesi"
            disabled={isPending}
            value={vergiDairesi}
            onChange={(e) => setVergiDairesi(isimBasHarfBuyukYap(e.target.value))}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="vergi_no">Vergi Numarası</Label>
          <Input id="vergi_no" name="vergi_no" disabled={isPending} defaultValue={bilgiler?.vergi_no ?? ""} />
        </div>

        <TelefonGirisi ad="telefon" label="Şirket Telefonu" varsayilanTelefon={bilgiler?.telefon} disabled={isPending} />
        <TelefonGirisi ad="whatsapp_no" label="WhatsApp Numarası" varsayilanTelefon={bilgiler?.whatsapp_no} disabled={isPending} />

        <div className="flex flex-col gap-2">
          <Label htmlFor="eposta">E-posta</Label>
          <Input id="eposta" name="eposta" type="email" disabled={isPending} defaultValue={bilgiler?.eposta ?? ""} />
        </div>
        <div />

        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="yetkili_kisi">Yetkili Kişi</Label>
          <Input
            id="yetkili_kisi"
            name="yetkili_kisi"
            disabled={isPending}
            value={yetkiliKisi}
            onChange={(e) => setYetkiliKisi(isimBasHarfBuyukYap(e.target.value))}
          />
        </div>
        <TelefonGirisi
          ad="yetkili_telefon"
          label="Yetkili Telefon Numarası"
          varsayilanTelefon={bilgiler?.yetkili_telefon}
          disabled={isPending}
        />
        <div className="flex flex-col gap-2">
          <Label htmlFor="yetkili_eposta">Yetkili Mail Adresi</Label>
          <Input
            id="yetkili_eposta"
            name="yetkili_eposta"
            type="email"
            disabled={isPending}
            defaultValue={bilgiler?.yetkili_eposta ?? ""}
          />
        </div>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Çalışma Saatleri</legend>
        <div className="grid grid-cols-[auto_1fr_auto_1fr] items-center gap-x-3 gap-y-3 sm:grid-cols-[120px_1fr_auto_1fr]">
          <span className="text-sm text-muted-foreground">Hafta İçi</span>
          <Input
            id="hafta_ici_baslangic"
            name="hafta_ici_baslangic"
            type="time"
            disabled={isPending}
            defaultValue={saatKisalt(bilgiler?.hafta_ici_baslangic)}
          />
          <span className="text-sm text-muted-foreground">–</span>
          <Input
            id="hafta_ici_bitis"
            name="hafta_ici_bitis"
            type="time"
            disabled={isPending}
            defaultValue={saatKisalt(bilgiler?.hafta_ici_bitis)}
          />

          <span className="text-sm text-muted-foreground">Cumartesi</span>
          <Input
            id="cumartesi_baslangic"
            name="cumartesi_baslangic"
            type="time"
            disabled={isPending}
            defaultValue={saatKisalt(bilgiler?.cumartesi_baslangic)}
          />
          <span className="text-sm text-muted-foreground">–</span>
          <Input
            id="cumartesi_bitis"
            name="cumartesi_bitis"
            type="time"
            disabled={isPending}
            defaultValue={saatKisalt(bilgiler?.cumartesi_bitis)}
          />

          <span className="text-sm text-muted-foreground">Pazar</span>
          <Input
            id="pazar_baslangic"
            name="pazar_baslangic"
            type="time"
            disabled={isPending}
            defaultValue={saatKisalt(bilgiler?.pazar_baslangic)}
          />
          <span className="text-sm text-muted-foreground">–</span>
          <Input
            id="pazar_bitis"
            name="pazar_bitis"
            type="time"
            disabled={isPending}
            defaultValue={saatKisalt(bilgiler?.pazar_bitis)}
          />
        </div>
        <p className="text-xs text-muted-foreground">Kapalı olan bir gün için başlangıç ve bitiş saatlerini boş bırakın.</p>
      </fieldset>

      {sonuc && (
        <p role="alert" className={`text-sm ${sonuc.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
          {sonuc.message}
        </p>
      )}

      <Button type="submit" disabled={isPending || hazirlaniyor} className="w-fit">
        {isPending ? "Kaydediliyor..." : "Kaydet"}
      </Button>
    </form>
  );
}
