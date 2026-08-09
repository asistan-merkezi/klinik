"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { AdresSecici } from "@/components/ui/AdresSecici";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TelefonGirisi } from "@/components/ui/TelefonGirisi";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CALISMA_TIPI_SECENEKLERI,
  CINSIYET_SECENEKLERI,
  ROL_SECENEKLERI,
  type KullaniciRol,
  type PersonelAcilKisi,
  type PersonelDetay,
  type PersonelHassasMaskeli,
  type PersonelMeslekiBelge,
} from "@/types/personel";
import { isimBasHarfBuyukYap } from "@/lib/utils";
import { personelHesabiOlustur, personelBilgileriGuncelle } from "./actions";

type Props =
  | { mod: "olustur"; onBasarili?: () => void }
  | {
      mod: "duzenle";
      personelId: string;
      initialData: PersonelDetay;
      initialAcilKisi: PersonelAcilKisi | null;
      initialMesleki: PersonelMeslekiBelge | null;
      maskeliHassas: PersonelHassasMaskeli | null;
      onBasarili?: () => void;
    };

const inputClass =
  "flex h-8 w-full min-w-0 rounded-lg border border-input bg-input-bg px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function hassasIpucu(maskeli: PersonelHassasMaskeli | null, alan: "tc_kimlik" | "pasaport"): string {
  if (!maskeli) return "Boş bırakılırsa mevcut kayıt değişmez.";
  if (!maskeli.anahtar_kurulu) return "Şifreleme henüz kurulmadı — girilen değer kaydedilemeyecek.";
  const varMi = alan === "tc_kimlik" ? maskeli.tc_kimlik_var : maskeli.pasaport_var;
  const son2 = alan === "tc_kimlik" ? maskeli.tc_kimlik_son2 : maskeli.pasaport_son2;
  if (!varMi) return "Kayıtlı değil. Boş bırakılırsa kaydedilmez.";
  return `Kayıtlı: ••••••••${son2 ?? "••"} — değiştirmek için üzerine yazın, boş bırakırsanız değişmez.`;
}

export function PersonelFormu(props: Props) {
  const duzenleMi = props.mod === "duzenle";
  const initialData = duzenleMi ? props.initialData : null;
  const initialAcilKisi = duzenleMi ? props.initialAcilKisi : null;
  const initialMesleki = duzenleMi ? props.initialMesleki : null;
  const maskeliHassas = duzenleMi ? props.maskeliHassas : null;

  const action = duzenleMi ? personelBilgileriGuncelle.bind(null, props.personelId) : personelHesabiOlustur;
  const [durum, formAction, isPending] = useActionState(action, null);

  const [adim, setAdim] = useState(1);
  const [rol, setRol] = useState<KullaniciRol>(initialData?.kullanici?.rol ?? "terapist");
  const meslekiVar = rol === "terapist";
  const sonAdim = meslekiVar ? 4 : 3;

  const [adSoyad, setAdSoyad] = useState(initialData?.ad_soyad ?? "");
  const [dogumYeri, setDogumYeri] = useState(initialData?.dogum_yeri ?? "");
  const [acilAdSoyad, setAcilAdSoyad] = useState(initialAcilKisi?.ad_soyad ?? "");
  const [acilYakinlik, setAcilYakinlik] = useState(initialAcilKisi?.yakinlik ?? "");
  const [unvan, setUnvan] = useState(initialData?.gorev ?? "");
  const [departman, setDepartman] = useState(initialData?.departman ?? "");
  const [uzmanlikTescilNo, setUzmanlikTescilNo] = useState(initialData?.uzmanlik_tescil_no ?? "");

  const adimRefleri = useRef<Record<number, HTMLDivElement | null>>({});
  const formRef = useRef<HTMLFormElement>(null);

  // Not: oluşturma modunda dialog'u başarı sonrası kapatmıyoruz — geçici şifre
  // sadece bir kez gösteriliyor, admin'in kopyalayabilmesi için ekranda kalmalı.
  // Düzenleme modunda gösterilecek gizli bir bilgi olmadığı için otomatik kapanır.
  useEffect(() => {
    if (duzenleMi && durum?.success) {
      props.onBasarili?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durum]);

  function ileri() {
    const kapsayici = adimRefleri.current[adim];
    if (kapsayici) {
      const elemanlar = Array.from(kapsayici.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select"));
      const gecersiz = elemanlar.find((el) => !el.checkValidity());
      if (gecersiz) {
        gecersiz.reportValidity();
        return;
      }
    }
    setAdim((a) => Math.min(a + 1, sonAdim));
  }

  function geri() {
    setAdim((a) => Math.max(a - 1, 1));
  }

  const ADIM_BASLIKLARI = ["Kişisel Bilgiler", "İş Bilgileri", "Sistem Yetkileri", "Mesleki Belgeler"];

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {ADIM_BASLIKLARI.slice(0, sonAdim).map((baslik, i) => {
          const n = i + 1;
          return (
            <span
              key={baslik}
              className={`rounded-full px-2.5 py-1 font-medium ${
                n === adim
                  ? "bg-primary text-primary-foreground"
                  : n < adim
                    ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {n}. {baslik}
            </span>
          );
        })}
      </div>

      {/* Adım 1: Kişisel Bilgiler */}
      <div ref={(el) => { adimRefleri.current[1] = el; }} className={adim === 1 ? "flex flex-col gap-4" : "hidden"}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ad_soyad">Ad Soyad</Label>
            <Input
              id="ad_soyad"
              name="ad_soyad"
              required
              disabled={isPending}
              value={adSoyad}
              onChange={(e) => setAdSoyad(isimBasHarfBuyukYap(e.target.value))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="dogum_tarihi">Doğum Tarihi</Label>
            <Input
              id="dogum_tarihi"
              name="dogum_tarihi"
              type="date"
              disabled={isPending}
              defaultValue={initialData?.dogum_tarihi ?? ""}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="dogum_yeri">Doğum Yeri</Label>
            <Input
              id="dogum_yeri"
              name="dogum_yeri"
              disabled={isPending}
              value={dogumYeri}
              onChange={(e) => setDogumYeri(isimBasHarfBuyukYap(e.target.value))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cinsiyet">Cinsiyet</Label>
            <Select
              name="cinsiyet"
              disabled={isPending}
              defaultValue={initialData?.cinsiyet ?? ""}
              items={CINSIYET_SECENEKLERI}
            >
              <SelectTrigger id="cinsiyet" className="w-full">
                <SelectValue placeholder="Belirtilmemiş" />
              </SelectTrigger>
              <SelectContent>
                {CINSIYET_SECENEKLERI.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!duzenleMi && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="eposta">Kurumsal E-posta</Label>
              <Input id="eposta" name="eposta" type="email" required disabled={isPending} placeholder="ornek@klinik.com" />
            </div>
          )}
          {duzenleMi && initialData?.eposta && (
            <div className="flex flex-col gap-2">
              <Label>Kurumsal E-posta</Label>
              <p className="flex h-8 items-center text-sm text-muted-foreground">{initialData.eposta} (giriş e-postası değiştirilemez)</p>
            </div>
          )}
          <TelefonGirisi ad="gsm" label="GSM Numarası" varsayilanTelefon={initialData?.kullanici?.telefon} disabled={isPending} />
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-medium">Adres (opsiyonel)</legend>
          <AdresSecici
            prefix="adres"
            disabled={isPending}
            defaultIl={initialData?.il}
            defaultIlce={initialData?.ilce}
            defaultMahalle={initialData?.mahalle}
          />
          <div className="flex flex-col gap-2">
            <Label htmlFor="adres">Sokak / Cadde, Bina No, Daire</Label>
            <textarea
              id="adres"
              name="adres"
              rows={2}
              disabled={isPending}
              defaultValue={initialData?.adres ?? ""}
              className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-medium">Acil Durum Kişisi (opsiyonel)</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="acil_ad_soyad">Ad Soyad</Label>
              <Input
                id="acil_ad_soyad"
                name="acil_ad_soyad"
                disabled={isPending}
                value={acilAdSoyad}
                onChange={(e) => setAcilAdSoyad(isimBasHarfBuyukYap(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="acil_yakinlik">Yakınlık</Label>
              <Input
                id="acil_yakinlik"
                name="acil_yakinlik"
                disabled={isPending}
                value={acilYakinlik}
                onChange={(e) => setAcilYakinlik(isimBasHarfBuyukYap(e.target.value))}
              />
            </div>
            <TelefonGirisi ad="acil_telefon" label="Telefon" varsayilanTelefon={initialAcilKisi?.telefon} disabled={isPending} />
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-3 rounded-lg border border-amber-500/30 p-3">
          <legend className="mb-1 text-sm font-medium text-amber-600 dark:text-amber-400">
            Hassas Kimlik Bilgisi (şifreli saklanır)
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tc_kimlik_no">T.C. Kimlik No</Label>
              <Input id="tc_kimlik_no" name="tc_kimlik_no" inputMode="numeric" maxLength={11} disabled={isPending} />
              <p className="text-xs text-muted-foreground">{hassasIpucu(maskeliHassas, "tc_kimlik")}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pasaport_no">Pasaport No</Label>
              <Input id="pasaport_no" name="pasaport_no" disabled={isPending} />
              <p className="text-xs text-muted-foreground">{hassasIpucu(maskeliHassas, "pasaport")}</p>
            </div>
          </div>
        </fieldset>
      </div>

      {/* Adım 2: İş Bilgileri */}
      <div ref={(el) => { adimRefleri.current[2] = el; }} className={adim === 2 ? "grid gap-4 sm:grid-cols-2" : "hidden"}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="unvan">Unvan / Branş</Label>
          <Input
            id="unvan"
            name="unvan"
            required
            disabled={isPending}
            placeholder="Fizyoterapist, Resepsiyon..."
            value={unvan}
            onChange={(e) => setUnvan(isimBasHarfBuyukYap(e.target.value))}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="departman">Departman</Label>
          <Input
            id="departman"
            name="departman"
            disabled={isPending}
            value={departman}
            onChange={(e) => setDepartman(isimBasHarfBuyukYap(e.target.value))}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ise_giris_tarihi">İşe Başlama Tarihi</Label>
          <Input id="ise_giris_tarihi" name="ise_giris_tarihi" type="date" disabled={isPending} defaultValue={initialData?.ise_giris_tarihi ?? ""} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="calisma_tipi">Çalışma Tipi</Label>
          <Select
            name="calisma_tipi"
            disabled={isPending}
            defaultValue={initialData?.calisma_tipi ?? ""}
            items={CALISMA_TIPI_SECENEKLERI}
          >
            <SelectTrigger id="calisma_tipi" className="w-full">
              <SelectValue placeholder="Belirtilmemiş" />
            </SelectTrigger>
            <SelectContent>
              {CALISMA_TIPI_SECENEKLERI.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="sgk_sicil_no">SGK Sicil No</Label>
          <Input id="sgk_sicil_no" name="sgk_sicil_no" disabled={isPending} defaultValue={initialData?.sgk_sicil_no ?? ""} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="uzmanlik_tescil_no">Uzmanlık / Diploma / Tescil No</Label>
          <Input
            id="uzmanlik_tescil_no"
            name="uzmanlik_tescil_no"
            disabled={isPending}
            value={uzmanlikTescilNo}
            onChange={(e) => setUzmanlikTescilNo(isimBasHarfBuyukYap(e.target.value))}
          />
        </div>
      </div>

      {/* Adım 3: Sistem Yetkileri */}
      <div ref={(el) => { adimRefleri.current[3] = el; }} className={adim === 3 ? "flex flex-col gap-4" : "hidden"}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="rol">Rol</Label>
          <Select name="rol" disabled={isPending} value={rol} onValueChange={(v) => setRol(v as KullaniciRol)} items={ROL_SECENEKLERI}>
            <SelectTrigger id="rol" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROL_SECENEKLERI.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Rol &quot;Terapist&quot; seçilirse bir sonraki adımda mesleki belge bilgileri istenir.
          </p>
        </div>
      </div>

      {/* Adım 4: Mesleki Belgeler (sadece terapist) */}
      {meslekiVar && (
        <div ref={(el) => { adimRefleri.current[4] = el; }} className={adim === 4 ? "grid gap-4 sm:grid-cols-2" : "hidden"}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="diploma_no">Diploma No</Label>
            <Input id="diploma_no" name="diploma_no" disabled={isPending} defaultValue={initialMesleki?.diploma_no ?? ""} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="uzmanlik_belge_no">Uzmanlık Belge No</Label>
            <Input id="uzmanlik_belge_no" name="uzmanlik_belge_no" disabled={isPending} defaultValue={initialMesleki?.uzmanlik_belge_no ?? ""} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="meslek_odasi_sicil_no">Meslek Odası Sicil No</Label>
            <Input id="meslek_odasi_sicil_no" name="meslek_odasi_sicil_no" disabled={isPending} defaultValue={initialMesleki?.meslek_odasi_sicil_no ?? ""} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="saglik_bakanligi_tescil_no">Sağlık Bakanlığı Tescil No</Label>
            <Input id="saglik_bakanligi_tescil_no" name="saglik_bakanligi_tescil_no" disabled={isPending} defaultValue={initialMesleki?.saglik_bakanligi_tescil_no ?? ""} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="e_imza_sertifika_seri_no">E-imza Sertifika Seri No</Label>
            <Input id="e_imza_sertifika_seri_no" name="e_imza_sertifika_seri_no" disabled={isPending} defaultValue={initialMesleki?.e_imza_sertifika_seri_no ?? ""} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="e_imza_gecerlilik_tarihi">E-imza Geçerlilik Tarihi</Label>
            <Input id="e_imza_gecerlilik_tarihi" name="e_imza_gecerlilik_tarihi" type="date" disabled={isPending} defaultValue={initialMesleki?.e_imza_gecerlilik_tarihi ?? ""} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sigorta_police_no">Mali Sorumluluk Sigortası Poliçe No</Label>
            <Input id="sigorta_police_no" name="sigorta_police_no" disabled={isPending} defaultValue={initialMesleki?.mali_sorumluluk_sigorta_police_no ?? ""} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sigorta_bitis_tarihi">Sigorta Bitiş Tarihi</Label>
            <Input id="sigorta_bitis_tarihi" name="sigorta_bitis_tarihi" type="date" disabled={isPending} defaultValue={initialMesleki?.mali_sorumluluk_sigorta_bitis_tarihi ?? ""} />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="kase_dosya">Kaşe Görseli {initialMesleki?.kase_gorsel_url && "(kayıtlı görsel var, seçilirse değişir)"}</Label>
            <input id="kase_dosya" name="kase_dosya" type="file" accept="image/png,image/jpeg,image/webp" disabled={isPending} className={inputClass} />
          </div>
        </div>
      )}

      {durum && (
        <p role="alert" className={`text-sm ${durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
          {durum.message}
          {durum.geciciSifre && (
            <>
              {" "}
              Geçici şifre: <span className="font-mono font-semibold">{durum.geciciSifre}</span> — personele
              iletin, bir daha gösterilmeyecek.
            </>
          )}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="outline" disabled={isPending || adim === 1} onClick={geri}>
          ‹ Geri
        </Button>
        {adim < sonAdim ? (
          <Button type="button" onClick={ileri} disabled={isPending}>
            İleri ›
          </Button>
        ) : (
          <Button type="button" onClick={() => formRef.current?.requestSubmit()} disabled={isPending}>
            {isPending ? "Kaydediliyor..." : duzenleMi ? "Kaydet" : "Personel hesabı oluştur"}
          </Button>
        )}
      </div>
    </form>
  );
}
