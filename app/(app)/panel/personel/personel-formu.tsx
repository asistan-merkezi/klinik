"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { AdresSecici } from "@/components/ui/AdresSecici";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TelefonGirisi } from "@/components/ui/TelefonGirisi";
import { ModulAgaci } from "@/components/panel/modul-agaci";
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
  type BasvuruPrefill,
  type KullaniciRol,
  type PersonelAcilKisi,
  type PersonelDetay,
  type PersonelEgitim,
  type PersonelHassasMaskeli,
  type PersonelMeslekiBelge,
} from "@/types/personel";
import type { Pozisyon } from "@/types/pozisyon";
import { isimBasHarfBuyukYap } from "@/lib/utils";
import { personelHesabiOlustur, personelBilgileriGuncelle } from "./actions";

type Props =
  | { mod: "olustur"; basvuru?: BasvuruPrefill; pozisyonlar: Pozisyon[]; onBasarili?: () => void }
  | {
      mod: "duzenle";
      personelId: string;
      initialData: PersonelDetay;
      initialAcilKisi: PersonelAcilKisi | null;
      initialMesleki: PersonelMeslekiBelge | null;
      initialEgitim: PersonelEgitim[];
      maskeliHassas: PersonelHassasMaskeli | null;
      pozisyonlar: Pozisyon[];
      onBasarili?: () => void;
    };

const inputClass =
  "flex h-8 w-full min-w-0 rounded-lg border border-input bg-input-bg px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type EgitimSatiri = { derece: string; okul: string; bolum: string; yil: string };

function hassasIpucu(maskeli: PersonelHassasMaskeli | null, alan: "tc_kimlik" | "pasaport"): string {
  if (!maskeli) return "Boş bırakılırsa mevcut kayıt değişmez.";
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
  const initialEgitim = duzenleMi ? props.initialEgitim : [];
  const maskeliHassas = duzenleMi ? props.maskeliHassas : null;
  // Olumlu bulunan bir İş Başvurusu'ndan "Personel Ekle"ye geçildiğinde
  // adayın bilgileriyle formu önceden dolduran kaynak — sadece mod=olustur'da.
  const basvuru = duzenleMi ? undefined : props.basvuru;

  const action = duzenleMi
    ? personelBilgileriGuncelle.bind(null, props.personelId)
    : personelHesabiOlustur.bind(null, basvuru?.id ?? null);
  const [durum, formAction, isPending] = useActionState(action, null);

  const [adim, setAdim] = useState(1);
  const [rol, setRol] = useState<KullaniciRol>(initialData?.kullanici?.rol ?? "terapist");
  const meslekiVar = rol === "terapist";
  const sonAdim = meslekiVar ? 4 : 3;

  const [ozelYetkiAcik, setOzelYetkiAcik] = useState(initialData?.kullanici?.custom_permissions_enabled ?? false);
  const [ozelModuller, setOzelModuller] = useState<string[]>(initialData?.kullanici?.allowed_modules ?? []);

  const [adSoyad, setAdSoyad] = useState(initialData?.ad_soyad ?? basvuru?.ad_soyad ?? "");
  const [dogumYeri, setDogumYeri] = useState(initialData?.dogum_yeri ?? "");
  const [acilAdSoyad, setAcilAdSoyad] = useState(initialAcilKisi?.ad_soyad ?? "");
  const [acilYakinlik, setAcilYakinlik] = useState(initialAcilKisi?.yakinlik ?? "");
  const [pozisyonId, setPozisyonId] = useState(initialData?.pozisyon_id ?? props.pozisyonlar[0]?.id ?? "");
  // Departman artık serbest metin değil — seçilen Pozisyon'un grubundan (Ayarlar →
  // Personel Tanımlama / Yetkilendirme'deki AYNI kaynak) otomatik türetilir, elle girilemez.
  const departman = props.pozisyonlar.find((p) => p.id === pozisyonId)?.grup ?? "";
  const [imzaYetkilisiMi, setImzaYetkilisiMi] = useState(initialData?.imza_yetkilisi_mi ?? false);
  const [egitimSatirlari, setEgitimSatirlari] = useState<EgitimSatiri[]>(
    initialEgitim.map((e) => ({ derece: e.derece ?? "", okul: e.okul ?? "", bolum: e.bolum ?? "", yil: e.yil ?? "" }))
  );

  function egitimSatiriEkle() {
    setEgitimSatirlari((satirlar) => [...satirlar, { derece: "", okul: "", bolum: "", yil: "" }]);
  }

  function egitimSatiriSil(index: number) {
    setEgitimSatirlari((satirlar) => satirlar.filter((_, i) => i !== index));
  }

  function egitimSatiriGuncelle(index: number, alan: keyof EgitimSatiri, deger: string) {
    setEgitimSatirlari((satirlar) => satirlar.map((satir, i) => (i === index ? { ...satir, [alan]: deger } : satir)));
  }

  const adimRefleri = useRef<Record<number, HTMLDivElement | null>>({});
  const formRef = useRef<HTMLFormElement>(null);

  // Not: oluşturma modunda dialog'u başarı sonrası kapatmıyoruz — geçici şifre
  // sadece bir kez gösteriliyor, admin'in kopyalayabilmesi için ekranda kalmalı
  // (bu yüzden dialog'u KAPATMAK caller'ın işi değil — sadece bildiriliyor).
  // Düzenleme modunda gösterilecek gizli bir bilgi olmadığı için otomatik kapanır.
  // Başvurudan aktarım akışında (mod=olustur + basvuru) da bildiriliyor ki
  // çağıran taraf (İş Başvurusu listesi) satırı "aktarıldı" olarak işaretleyip
  // aynı başvurudan tekrar personel oluşturulmasını engelleyebilsin — dialog
  // yine kapanmıyor, şifre gösterimini etkilemiyor.
  // `uyari: true` olduğunda ÇAĞIRMIYORUZ — success olsa da kullanıcının
  // mutlaka görmesi gereken bir kısmi hata mesajı var (ör. T.C. Kimlik
  // şifreleme anahtarı kurulu değil); dialog hemen kapanırsa bu mesaj hiç
  // okunamadan kayboluyordu (gerçek bir kullanıcı raporuyla bulundu).
  useEffect(() => {
    if (durum?.success && !durum.uyari && (duzenleMi || basvuru)) {
      props.onBasarili?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durum]);

  // Mesleki Belgeler artık Sistem Yetkileri'nden ÖNCE gösteriliyor — sıra
  // kasıtlı olarak değiştirildi. Mesleki Belgeler varsa sabit 3. adım, Sistem
  // Yetkileri ise ona göre 3. ya da 4. adım olur.
  const meslekiAdimNo = 3;
  const sistemYetkileriAdimNo = meslekiVar ? 4 : 3;

  // Rol seçimi (Sistem Yetkileri) değiştikçe adım sayısı büyüyüp küçülebiliyor
  // (Mesleki Belgeler yalnız terapist'te var) — `adim` bunu geriye doğru takip
  // etmeyebilir (ör. terapist'ten başka role geçilince Sistem Yetkileri 4'ten
  // 3'e kayar), o yüzden gösterim/doğrulama hep bu türetilmiş değeri kullanır.
  const aktifAdim = Math.min(adim, sonAdim);

  function ileri() {
    const kapsayici = adimRefleri.current[aktifAdim];
    if (kapsayici) {
      const elemanlar = Array.from(kapsayici.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select"));
      const gecersiz = elemanlar.find((el) => !el.checkValidity());
      if (gecersiz) {
        gecersiz.reportValidity();
        return;
      }
    }
    setAdim(Math.min(aktifAdim + 1, sonAdim));
  }

  function geri() {
    setAdim(Math.max(aktifAdim - 1, 1));
  }

  const ADIM_BASLIKLARI = meslekiVar
    ? ["Kişisel Bilgiler", "İş Bilgileri", "Mesleki Belgeler", "Sistem Yetkileri"]
    : ["Kişisel Bilgiler", "İş Bilgileri", "Sistem Yetkileri"];

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      {basvuru && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-xs text-primary">
          <strong>{basvuru.ad_soyad}</strong> adlı iş başvurusundan aktarılıyor — bilgileri gözden geçirip
          tamamlayın.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {ADIM_BASLIKLARI.slice(0, sonAdim).map((baslik, i) => {
          const n = i + 1;
          return (
            <span
              key={baslik}
              className={`rounded-full px-2.5 py-1 font-medium ${
                n === aktifAdim
                  ? "bg-primary text-primary-foreground"
                  : n < aktifAdim
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
      <div ref={(el) => { adimRefleri.current[1] = el; }} className={aktifAdim === 1 ? "flex flex-col gap-4" : "hidden"}>
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
              defaultValue={initialData?.dogum_tarihi ?? basvuru?.dogum_tarihi ?? ""}
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
              <Input
                id="eposta"
                name="eposta"
                type="email"
                required
                disabled={isPending}
                placeholder="ornek@klinik.com"
                defaultValue={basvuru?.eposta ?? ""}
              />
              {basvuru?.eposta && (
                <p className="text-xs text-muted-foreground">
                  Adayın başvuruda verdiği e-posta önceden dolduruldu — kurumsal e-posta farklıysa değiştirin.
                </p>
              )}
            </div>
          )}
          {duzenleMi && initialData?.eposta && (
            <div className="flex flex-col gap-2">
              <Label>Kurumsal E-posta</Label>
              <p className="flex h-8 items-center text-sm text-muted-foreground">{initialData.eposta} (giriş e-postası değiştirilemez)</p>
            </div>
          )}
          <TelefonGirisi
            ad="gsm"
            label="GSM Numarası"
            varsayilanTelefon={initialData?.kullanici?.telefon ?? basvuru?.telefon}
            disabled={isPending}
          />
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
              defaultValue={initialData?.adres ?? basvuru?.adres ?? ""}
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
            Hassas Kimlik Bilgisi
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tc_kimlik_no">T.C. Kimlik No</Label>
              <Input
                id="tc_kimlik_no"
                name="tc_kimlik_no"
                inputMode="numeric"
                maxLength={11}
                disabled={isPending}
                defaultValue={basvuru?.tc_kimlik_no ?? ""}
              />
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
      <div ref={(el) => { adimRefleri.current[2] = el; }} className={aktifAdim === 2 ? "flex flex-col gap-4" : "hidden"}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="sgk_sicil_no">SGK Sicil No</Label>
            <Input id="sgk_sicil_no" name="sgk_sicil_no" disabled={isPending} defaultValue={initialData?.sgk_sicil_no ?? ""} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ise_giris_tarihi">İşe Başlama Tarihi</Label>
            <Input id="ise_giris_tarihi" name="ise_giris_tarihi" type="date" disabled={isPending} defaultValue={initialData?.ise_giris_tarihi ?? ""} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="isten_cikis_tarihi">İşten Çıkış Tarihi</Label>
            <Input id="isten_cikis_tarihi" name="isten_cikis_tarihi" type="date" disabled={isPending} defaultValue={initialData?.isten_cikis_tarihi ?? ""} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pozisyon_id">Pozisyon</Label>
            <Select
              name="pozisyon_id"
              disabled={isPending || props.pozisyonlar.length === 0}
              value={pozisyonId}
              onValueChange={(v) => {
                if (!v) return;
                setPozisyonId(v);
                const secilen = props.pozisyonlar.find((p) => p.id === v);
                if (secilen) setRol(secilen.varsayilan_rol);
              }}
              items={props.pozisyonlar.map((p) => ({ value: p.id, label: p.ad }))}
            >
              <SelectTrigger id="pozisyon_id" className="w-full">
                <SelectValue placeholder="Pozisyon seçin" />
              </SelectTrigger>
              <SelectContent>
                {props.pozisyonlar.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.ad}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {props.pozisyonlar.length === 0 && (
              <p className="text-xs text-destructive">
                Önce Ayarlar → Personel Tanımlama&apos;dan en az bir aktif pozisyon eklenmeli.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="departman">Departman</Label>
            <Input id="departman" disabled value={departman || "—"} />
            <p className="text-xs text-muted-foreground">
              Pozisyon&apos;a göre otomatik belirlenir (Ayarlar → Personel Tanımlama&apos;daki grup).
            </p>
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
        </div>
      </div>

      {/* Mesleki Belgeler (sadece terapist) — Sistem Yetkileri'nden önce, sabit 3. adım */}
      {meslekiVar && (
        <div ref={(el) => { adimRefleri.current[meslekiAdimNo] = el; }} className={aktifAdim === meslekiAdimNo ? "flex flex-col gap-4" : "hidden"}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="diploma_no">Diploma No</Label>
              <Input id="diploma_no" name="diploma_no" disabled={isPending} defaultValue={initialMesleki?.diploma_no ?? ""} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="meslek_odasi_sicil_no">Meslek Odası Sicil No</Label>
              <Input id="meslek_odasi_sicil_no" name="meslek_odasi_sicil_no" disabled={isPending} defaultValue={initialMesleki?.meslek_odasi_sicil_no ?? ""} />
            </div>
          </div>

          <label className="flex items-center gap-2 border-t border-border pt-4 text-sm">
            <input
              type="checkbox"
              name="imza_yetkilisi_mi"
              disabled={isPending}
              checked={imzaYetkilisiMi}
              onChange={(e) => setImzaYetkilisiMi(e.target.checked)}
              className="size-4 rounded border-input"
            />
            Resmî sağlık lisansı / imza yetkilisi
          </label>

          {imzaYetkilisiMi && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="uzmanlik_belge_no">Uzmanlık Belge No</Label>
                <Input id="uzmanlik_belge_no" name="uzmanlik_belge_no" disabled={isPending} defaultValue={initialMesleki?.uzmanlik_belge_no ?? ""} />
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

          <fieldset className="flex flex-col gap-3 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <legend className="text-sm font-medium">Eğitim Bilgileri</legend>
              <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={egitimSatiriEkle}>
                + Yeni Eğitim Ekle
              </Button>
            </div>
            {egitimSatirlari.length === 0 && (
              <p className="text-xs text-muted-foreground">Henüz eğitim kaydı eklenmedi.</p>
            )}
            {egitimSatirlari.map((satir, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_6rem_auto] sm:items-end">
                <div className="flex flex-col gap-1">
                  {i === 0 && <Label htmlFor={`egitim_derece_${i}`}>Derece</Label>}
                  <Input
                    id={`egitim_derece_${i}`}
                    placeholder="Lisans, Yüksek Lisans, Sertifika..."
                    disabled={isPending}
                    value={satir.derece}
                    onChange={(e) => egitimSatiriGuncelle(i, "derece", e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  {i === 0 && <Label htmlFor={`egitim_okul_${i}`}>Okul</Label>}
                  <Input
                    id={`egitim_okul_${i}`}
                    disabled={isPending}
                    value={satir.okul}
                    onChange={(e) => egitimSatiriGuncelle(i, "okul", isimBasHarfBuyukYap(e.target.value))}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  {i === 0 && <Label htmlFor={`egitim_bolum_${i}`}>Branş / Bölüm</Label>}
                  <Input
                    id={`egitim_bolum_${i}`}
                    disabled={isPending}
                    value={satir.bolum}
                    onChange={(e) => egitimSatiriGuncelle(i, "bolum", isimBasHarfBuyukYap(e.target.value))}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  {i === 0 && <Label htmlFor={`egitim_yil_${i}`}>Yıl</Label>}
                  <Input
                    id={`egitim_yil_${i}`}
                    inputMode="numeric"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    placeholder="2020"
                    disabled={isPending}
                    value={satir.yil}
                    onChange={(e) => egitimSatiriGuncelle(i, "yil", e.target.value)}
                  />
                </div>
                <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => egitimSatiriSil(i)}>
                  Sil
                </Button>
              </div>
            ))}
            <input type="hidden" name="egitim_json" value={JSON.stringify(egitimSatirlari)} />
          </fieldset>
        </div>
      )}

      {/* Sistem Yetkileri — Mesleki Belgeler varsa 4., yoksa 3. adım */}
      <div ref={(el) => { adimRefleri.current[sistemYetkileriAdimNo] = el; }} className={aktifAdim === sistemYetkileriAdimNo ? "flex flex-col gap-4" : "hidden"}>
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
            Rol &quot;Terapist&quot; seçilirse Mesleki Belgeler adımı da gösterilir.
          </p>
        </div>

        {/* klinik_admin zaten pozisyon mirasıyla "*" (tüm modüller) alır —
            self-escalation kaygısıyla tutarlı, bu rolde override sunulmuyor. */}
        {rol !== "klinik_admin" && (
          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <label className="flex items-center justify-between gap-2 text-sm">
              <span>Pozisyondan Farklı Özel Yetki Tanımla</span>
              <Switch
                checked={ozelYetkiAcik}
                disabled={isPending}
                onCheckedChange={(acik) => {
                  setOzelYetkiAcik(acik);
                  if (acik && ozelModuller.length === 0) {
                    const secilenPozisyon = props.pozisyonlar.find((p) => p.id === pozisyonId);
                    setOzelModuller(secilenPozisyon?.allowed_modules ?? []);
                  }
                }}
              />
            </label>
            {ozelYetkiAcik ? (
              <ModulAgaci value={ozelModuller} onValueChange={setOzelModuller} disabled={isPending} />
            ) : (
              <p className="text-xs text-muted-foreground">
                Kapalıyken bu personel bağlı olduğu pozisyonun izinlerini kullanır.
              </p>
            )}
          </div>
        )}
        <input type="hidden" name="custom_permissions_enabled" value={rol !== "klinik_admin" && ozelYetkiAcik ? "on" : ""} />
        <input type="hidden" name="allowed_modules_json" value={JSON.stringify(ozelModuller)} />
      </div>

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
        <Button type="button" variant="outline" disabled={isPending || aktifAdim === 1} onClick={geri}>
          ‹ Geri
        </Button>
        {aktifAdim < sonAdim ? (
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
