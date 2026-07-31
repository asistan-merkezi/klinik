"use client";

import { useActionState, useState, useTransition } from "react";
import { AdresSecici } from "@/components/ui/AdresSecici";
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
import { cn, isimBasHarfBuyukYap, resitDegilMi, telefonYerelHaneleriCikar } from "@/lib/utils";
import type { HastaDetay } from "@/types/hasta";
import type { HastaHassasSatir } from "@/types/hasta-hassas";
import { anamnezGuncelle, ozelNitelikliOnayVer, temelBilgileriGuncelle } from "./actions";

const CINSIYET_SECENEKLERI = [
  { value: "kadin", label: "Kadın" },
  { value: "erkek", label: "Erkek" },
  { value: "belirtilmemis", label: "Belirtmek İstemiyor" },
];

const KIMLIK_TIPI_SECENEKLERI = [
  { value: "tc", label: "T.C. Kimlik No" },
  { value: "pasaport", label: "Pasaport No" },
];

const REFERANS_SECENEKLERI_TABAN = [
  { value: "sosyal_medya", label: "Sosyal Medya" },
  { value: "tavsiye", label: "Tavsiye" },
  { value: "google", label: "Google" },
  { value: "reklam", label: "Reklam" },
  { value: "diger", label: "Diğer" },
];

const ONCELIK_SECENEKLERI = [
  { value: "normal", label: "Normal" },
  { value: "oncelikli", label: "Öncelikli" },
  { value: "acil", label: "🔴 Acil" },
];

function textAlaniSinifi(kritikMi?: boolean) {
  return cn(
    "rounded-lg border bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
    kritikMi ? "border-red-300" : "border-input"
  );
}

/** +90 sabit önekli, 10 haneli (başındaki 0 hariç) telefon girişi — hasta/anne/baba/diğer yakını için ortak. */
function TelefonGirisi({
  ad,
  label,
  varsayilanTelefon,
  disabled,
}: {
  ad: string;
  label: string;
  varsayilanTelefon?: string | null;
  disabled?: boolean;
}) {
  const [hane, setHane] = useState(telefonYerelHaneleriCikar(varsayilanTelefon));
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={ad}>{label}</Label>
      <div className="flex items-center gap-2">
        <span className="flex h-8 shrink-0 items-center rounded-lg border border-input bg-muted px-2.5 text-sm text-muted-foreground">
          +90
        </span>
        <Input
          id={ad}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={10}
          placeholder="5xx xxx xx xx"
          value={hane}
          onChange={(e) => setHane(e.target.value.replace(/\D/g, "").replace(/^0/, "").slice(0, 10))}
          disabled={disabled}
        />
      </div>
      <input type="hidden" name={ad} value={hane ? `+90${hane}` : ""} />
      {hane.length > 0 && hane.length < 10 && (
        <p className="text-xs text-destructive">Telefon numarası (başındaki 0 hariç) 10 haneli olmalı.</p>
      )}
    </div>
  );
}

function EvetHayirAlan({
  ad,
  detayAdi,
  baslik,
  detayPlaceholder,
  varDegeri,
  detayDegeri,
  hizliEtiketler,
  kritik,
  disabled,
}: {
  ad: string;
  detayAdi: string;
  baslik: string;
  detayPlaceholder: string;
  varDegeri: boolean | null;
  detayDegeri: string | null;
  hizliEtiketler?: string[];
  kritik?: boolean;
  disabled?: boolean;
}) {
  const [secim, setSecim] = useState<"evet" | "hayir" | null>(
    varDegeri === true ? "evet" : varDegeri === false ? "hayir" : null
  );
  const [detay, setDetay] = useState(detayDegeri ?? "");
  const kritikVeEvet = Boolean(kritik) && secim === "evet";

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3",
        kritikVeEvet ? "border-red-300 bg-red-50 dark:bg-red-950/20" : "border-border"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className={cn("text-sm font-medium", kritikVeEvet && "text-destructive")}>{baslik}</span>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setSecim("evet")}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              secim === "evet"
                ? "border-destructive bg-destructive/10 text-destructive"
                : "border-input text-muted-foreground hover:bg-muted"
            )}
          >
            Evet
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setSecim("hayir")}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              secim === "hayir"
                ? "border-emerald-400 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-input text-muted-foreground hover:bg-muted"
            )}
          >
            Hayır
          </button>
        </div>
      </div>

      <input type="hidden" name={ad} value={secim ?? ""} />

      {secim === "evet" && (
        <div className="flex flex-col gap-1.5">
          <textarea
            name={detayAdi}
            rows={2}
            placeholder={detayPlaceholder}
            value={detay}
            onChange={(e) => setDetay(e.target.value)}
            disabled={disabled}
            className={textAlaniSinifi(kritik)}
          />
          {hizliEtiketler && (
            <div className="flex flex-wrap gap-1.5">
              {hizliEtiketler.map((etiket) => (
                <button
                  key={etiket}
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    setDetay((onceki) => (onceki.trim() ? `${onceki.trim()}, ${etiket}` : etiket))
                  }
                  className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  + {etiket}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Kimlik/iletişim/adres/veli — sadece klinik_admin/resepsiyon (idari veri). */
function TemelBilgilerFormu({ hasta, hassas }: { hasta: HastaDetay; hassas: HastaHassasSatir | null }) {
  const guncelleAction = temelBilgileriGuncelle.bind(null, hasta.id);
  const [durum, formAction, isPending] = useActionState(guncelleAction, null);

  const [adSoyad, setAdSoyad] = useState(hasta.ad_soyad ?? "");
  const [dogumTarihi, setDogumTarihi] = useState(hasta.dogum_tarihi ?? "");
  const [kimlikNoTipi, setKimlikNoTipi] = useState(hassas?.kimlik_no_tipi ?? "tc");
  const [kimlikNo, setKimlikNo] = useState(hassas?.kimlik_no ?? "");
  const [anneAdi, setAnneAdi] = useState(hassas?.anne_adi ?? "");
  const [babaAdi, setBabaAdi] = useState(hassas?.baba_adi ?? "");
  const [digerYakiniAdSoyad, setDigerYakiniAdSoyad] = useState(hassas?.diger_yakini_ad_soyad ?? "");

  const kucukMu = dogumTarihi ? resitDegilMi(dogumTarihi) : false;
  const kimlikNoHaneSayisi = kimlikNo.replace(/\D/g, "").length;
  const kimlikNoUyari = kimlikNoTipi === "tc" && kimlikNo.trim() !== "" && kimlikNoHaneSayisi !== 11;

  const referansSecenekleri =
    !hasta.referans_kanali || REFERANS_SECENEKLERI_TABAN.some((s) => s.value === hasta.referans_kanali)
      ? REFERANS_SECENEKLERI_TABAN
      : [{ value: hasta.referans_kanali, label: hasta.referans_kanali }, ...REFERANS_SECENEKLERI_TABAN];

  return (
    <form
      action={formAction}
      key={`${hasta.id}-${hasta.ad_soyad}-${hasta.telefon}-${hasta.dogum_tarihi}-${hasta.cinsiyet}-${hasta.eposta}-${hasta.referans_kanali}-${JSON.stringify(hassas)}`}
      className="flex flex-col gap-5"
    >
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium">Temel Bilgiler</legend>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ad_soyad">Ad Soyad</Label>
          <Input
            id="ad_soyad"
            name="ad_soyad"
            value={adSoyad}
            onChange={(e) => setAdSoyad(isimBasHarfBuyukYap(e.target.value))}
            disabled={isPending}
          />
        </div>
        <TelefonGirisi ad="telefon" label="Telefon" varsayilanTelefon={hasta.telefon} disabled={isPending} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="dogum_tarihi">Doğum Tarihi</Label>
          <Input
            id="dogum_tarihi"
            name="dogum_tarihi"
            type="date"
            value={dogumTarihi}
            onChange={(e) => setDogumTarihi(e.target.value)}
            disabled={isPending}
          />
        </div>
      </fieldset>

      {kucukMu && (
        <fieldset className="flex flex-col gap-4 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/20">
          <legend className="mb-1 px-1 text-sm font-medium">Veli Bilgileri (18 Yaş Altı)</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="anne_adi">Anne Adı</Label>
              <Input
                id="anne_adi"
                name="anne_adi"
                value={anneAdi}
                onChange={(e) => setAnneAdi(isimBasHarfBuyukYap(e.target.value))}
                disabled={isPending}
              />
            </div>
            <TelefonGirisi
              ad="anne_telefon"
              label="Anne Telefonu"
              varsayilanTelefon={hassas?.anne_telefon}
              disabled={isPending}
            />
            <div className="flex flex-col gap-2">
              <Label htmlFor="baba_adi">Baba Adı</Label>
              <Input
                id="baba_adi"
                name="baba_adi"
                value={babaAdi}
                onChange={(e) => setBabaAdi(isimBasHarfBuyukYap(e.target.value))}
                disabled={isPending}
              />
            </div>
            <TelefonGirisi
              ad="baba_telefon"
              label="Baba Telefonu"
              varsayilanTelefon={hassas?.baba_telefon}
              disabled={isPending}
            />
          </div>

          <div className="grid gap-4 border-t border-amber-200 pt-3 sm:grid-cols-3 dark:border-amber-900">
            <div className="flex flex-col gap-2">
              <Label htmlFor="diger_yakini_ad_soyad">Diğer Yakını Ad Soyad</Label>
              <Input
                id="diger_yakini_ad_soyad"
                name="diger_yakini_ad_soyad"
                value={digerYakiniAdSoyad}
                onChange={(e) => setDigerYakiniAdSoyad(isimBasHarfBuyukYap(e.target.value))}
                disabled={isPending}
              />
            </div>
            <TelefonGirisi
              ad="diger_yakini_telefon"
              label="Diğer Yakını Telefonu"
              varsayilanTelefon={hassas?.diger_yakini_telefon}
              disabled={isPending}
            />
            <div className="flex flex-col gap-2">
              <Label htmlFor="diger_yakini_yakinlik">Yakınlık Derecesi</Label>
              <Input
                id="diger_yakini_yakinlik"
                name="diger_yakini_yakinlik"
                placeholder="Teyze, Amca, Dede..."
                defaultValue={hassas?.diger_yakini_yakinlik ?? ""}
                disabled={isPending}
              />
            </div>
          </div>
        </fieldset>
      )}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium">Kimlik & İletişim</legend>
        <div className="flex flex-col gap-2">
          <Label htmlFor="cinsiyet">Cinsiyet</Label>
          <Select
            name="cinsiyet"
            disabled={isPending}
            defaultValue={hasta.cinsiyet ?? undefined}
            items={CINSIYET_SECENEKLERI}
          >
            <SelectTrigger id="cinsiyet" className="w-full">
              <SelectValue placeholder="Belirtilmedi" />
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
        <div className="flex flex-col gap-2">
          <Label htmlFor="eposta">E-posta</Label>
          <Input id="eposta" name="eposta" type="email" defaultValue={hasta.eposta ?? ""} disabled={isPending} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="referans_kanali">Bizi Nereden Duydunuz?</Label>
          <Select
            name="referans_kanali"
            disabled={isPending}
            defaultValue={hasta.referans_kanali ?? undefined}
            items={referansSecenekleri}
          >
            <SelectTrigger id="referans_kanali" className="w-full">
              <SelectValue placeholder="Seçin" />
            </SelectTrigger>
            <SelectContent>
              {referansSecenekleri.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div />
        <div className="flex flex-col gap-2">
          <Label htmlFor="kimlik_no_tipi">Kimlik Türü</Label>
          <Select
            name="kimlik_no_tipi"
            disabled={isPending}
            value={kimlikNoTipi}
            onValueChange={(v) => setKimlikNoTipi(v as "tc" | "pasaport")}
            items={KIMLIK_TIPI_SECENEKLERI}
          >
            <SelectTrigger id="kimlik_no_tipi" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KIMLIK_TIPI_SECENEKLERI.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="kimlik_no">Kimlik No</Label>
          <Input
            id="kimlik_no"
            name="kimlik_no"
            value={kimlikNo}
            onChange={(e) => setKimlikNo(e.target.value)}
            disabled={isPending}
          />
          {kimlikNoUyari && (
            <p className="text-xs text-destructive">T.C. Kimlik No 11 haneli olmalı ({kimlikNoHaneSayisi} hane girildi).</p>
          )}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">Adres</legend>
        <AdresSecici
          prefix="adres"
          defaultIl={hassas?.il}
          defaultIlce={hassas?.ilce}
          defaultMahalle={hassas?.mahalle}
          disabled={isPending}
        />
        <div className="flex flex-col gap-2">
          <Label htmlFor="adres">Sokak / Cadde, Bina No, Daire</Label>
          <textarea
            id="adres"
            name="adres"
            rows={2}
            defaultValue={hassas?.adres ?? ""}
            disabled={isPending}
            className={textAlaniSinifi()}
          />
        </div>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-medium">Acil Durum Kişisi</legend>
        <div className="flex flex-col gap-2">
          <Label htmlFor="acil_durum_ad_soyad">Ad Soyad</Label>
          <Input
            id="acil_durum_ad_soyad"
            name="acil_durum_ad_soyad"
            defaultValue={hassas?.acil_durum_ad_soyad ?? ""}
            disabled={isPending}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="acil_durum_yakinlik">Yakınlık</Label>
          <Input
            id="acil_durum_yakinlik"
            name="acil_durum_yakinlik"
            defaultValue={hassas?.acil_durum_yakinlik ?? ""}
            disabled={isPending}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="acil_durum_telefon">Telefon</Label>
          <Input
            id="acil_durum_telefon"
            name="acil_durum_telefon"
            defaultValue={hassas?.acil_durum_telefon ?? ""}
            disabled={isPending}
          />
        </div>
      </fieldset>

      {durum && (
        <p role="alert" className={`text-sm ${durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
          {durum.message}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? "Kaydediliyor..." : "Temel bilgileri kaydet"}
      </Button>
    </form>
  );
}

/** Tıbbi ön geçmiş / anamnez — terapist + klinik_admin/resepsiyon. hasta tablosuna dokunmaz. */
function AnamnezFormu({ hasta, hassas }: { hasta: HastaDetay; hassas: HastaHassasSatir | null }) {
  const guncelleAction = anamnezGuncelle.bind(null, hasta.id);
  const [durum, formAction, isPending] = useActionState(guncelleAction, null);

  return (
    <form action={formAction} key={JSON.stringify(hassas)} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Tıbbi Ön Geçmiş</legend>

        <EvetHayirAlan
          ad="alerji_var"
          detayAdi="alerjiler"
          baslik="⚠ Alerji Durumu"
          detayPlaceholder="İlaç, lateks, lokal/genel anestezi, gıda vb. detaylar..."
          varDegeri={hassas?.alerji_var ?? null}
          detayDegeri={hassas?.alerjiler ?? null}
          hizliEtiketler={["Penisilin Alerjisi", "Lateks Alerjisi", "Anestezi Alerjisi", "Gıda Alerjisi"]}
          kritik
          disabled={isPending}
        />

        <EvetHayirAlan
          ad="kan_sulandirici_kullanimi"
          detayAdi="kan_sulandirici_detay"
          baslik="🩸 Kan Sulandırıcı Kullanımı"
          detayPlaceholder="İlaç adı, dozu ve en son ne zaman alındığı..."
          varDegeri={hassas?.kan_sulandirici_kullanimi ?? null}
          detayDegeri={hassas?.kan_sulandirici_detay ?? null}
          kritik
          disabled={isPending}
        />

        <EvetHayirAlan
          ad="kronik_hastalik_var"
          detayAdi="kronik_hastaliklar"
          baslik="Kronik Hastalıklar"
          detayPlaceholder="Hipertansiyon, diyabet, kalp, astım vb. detayı..."
          varDegeri={hassas?.kronik_hastalik_var ?? null}
          detayDegeri={hassas?.kronik_hastaliklar ?? null}
          hizliEtiketler={["Diyabet", "Tansiyon (Hipertansiyon)", "Kalp Hastalığı", "Astım"]}
          disabled={isPending}
        />

        <EvetHayirAlan
          ad="surekli_ilac_var"
          detayAdi="surekli_ilaclar"
          baslik="Sürekli Kullanılan İlaçlar"
          detayPlaceholder="Düzenli alınan tüm ilaçların adları..."
          varDegeri={hassas?.surekli_ilac_var ?? null}
          detayDegeri={hassas?.surekli_ilaclar ?? null}
          disabled={isPending}
        />

        <EvetHayirAlan
          ad="ameliyat_var"
          detayAdi="gecirilmis_ameliyatlar"
          baslik="Geçirilmiş Ameliyatlar"
          detayPlaceholder="Ameliyat türü ve yılları..."
          varDegeri={hassas?.ameliyat_var ?? null}
          detayDegeri={hassas?.gecirilmis_ameliyatlar ?? null}
          disabled={isPending}
        />

        <EvetHayirAlan
          ad="bulasici_hastalik_var"
          detayAdi="bulasici_hastalik_detay"
          baslik="Bulaşıcı / Enfeksiyöz Hastalık"
          detayPlaceholder="Hepatit, HIV, tüberküloz vb. detayı..."
          varDegeri={hassas?.bulasici_hastalik_var ?? null}
          detayDegeri={hassas?.bulasici_hastalik_detay ?? null}
          disabled={isPending}
        />

        <EvetHayirAlan
          ad="protez_implant_var"
          detayAdi="protez_implant_detay"
          baslik="Protez / Kalp Pili / İmplant"
          detayPlaceholder="Vücutta bulunan protez veya tıbbi cihazlar..."
          varDegeri={hassas?.protez_implant_var ?? null}
          detayDegeri={hassas?.protez_implant_detay ?? null}
          disabled={isPending}
        />

        {hasta.cinsiyet === "kadin" && (
          <EvetHayirAlan
            ad="hamilelik_emzirme_var"
            detayAdi="hamilelik_emzirme_detay"
            baslik="Hamilelik / Emzirme Durumu"
            detayPlaceholder="Hafta/ay bilgisi veya özel durumlar..."
            varDegeri={hassas?.hamilelik_emzirme_var ?? null}
            detayDegeri={hassas?.hamilelik_emzirme_detay ?? null}
            disabled={isPending}
          />
        )}

        <EvetHayirAlan
          ad="sigara_alkol_madde_var"
          detayAdi="sigara_alkol_madde_detay"
          baslik="Sigara / Alkol / Madde Kullanımı"
          detayPlaceholder="Tüketim sıklığı ve miktarı..."
          varDegeri={hassas?.sigara_alkol_madde_var ?? null}
          detayDegeri={hassas?.sigara_alkol_madde_detay ?? null}
          disabled={isPending}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Geliş Sebebi & Klinik Notlar</legend>
        <div className="flex flex-col gap-2">
          <Label htmlFor="gelis_sebebi">Şikayet / Geliş Sebebi</Label>
          <textarea
            id="gelis_sebebi"
            name="gelis_sebebi"
            rows={2}
            defaultValue={hassas?.gelis_sebebi ?? ""}
            disabled={isPending}
            className={textAlaniSinifi()}
          />
        </div>
        <div className="flex flex-col gap-2 sm:w-64">
          <Label htmlFor="oncelik_durumu">Öncelik / Aciliyet Durumu</Label>
          <Select
            name="oncelik_durumu"
            disabled={isPending}
            defaultValue={hassas?.oncelik_durumu ?? "normal"}
            items={ONCELIK_SECENEKLERI}
          >
            <SelectTrigger id="oncelik_durumu" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ONCELIK_SECENEKLERI.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </fieldset>

      {durum && (
        <p role="alert" className={`text-sm ${durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
          {durum.message}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? "Kaydediliyor..." : "Tıbbi geçmişi kaydet"}
      </Button>
    </form>
  );
}

export function DetayliBilgilerKarti({
  hasta,
  hassas,
  duzenlenebilir,
}: {
  hasta: HastaDetay;
  hassas: HastaHassasSatir | null;
  duzenlenebilir: boolean;
}) {
  const [onayPending, startOnayTransition] = useTransition();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between text-sm">
        <span>
          Sağlık verisi işleme onayı:{" "}
          {hasta.ozel_nitelikli_veri_onay_tarihi ? (
            <span className="text-emerald-600 dark:text-emerald-400">
              {new Date(hasta.ozel_nitelikli_veri_onay_tarihi).toLocaleDateString("tr-TR")}
            </span>
          ) : (
            <span className="text-muted-foreground">Alınmadı</span>
          )}
        </span>
        {!hasta.ozel_nitelikli_veri_onay_tarihi && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={onayPending}
            onClick={() =>
              startOnayTransition(async () => {
                await ozelNitelikliOnayVer(hasta.id);
              })
            }
          >
            Onay al (kağıt form imzalandıysa)
          </Button>
        )}
      </div>

      {duzenlenebilir && (
        <>
          <TemelBilgilerFormu hasta={hasta} hassas={hassas} />
          <div className="border-t border-border" />
        </>
      )}

      <AnamnezFormu hasta={hasta} hassas={hassas} />
    </div>
  );
}
