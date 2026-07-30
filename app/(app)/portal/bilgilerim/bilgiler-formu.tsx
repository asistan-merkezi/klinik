"use client";

import { useActionState } from "react";
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
import type { HastaDetay } from "@/types/hasta";
import type { HastaHassasSatir } from "@/types/hasta-hassas";
import { bilgileriGuncelle } from "../actions";

const CINSIYET_SECENEKLERI = [
  { value: "kadin", label: "Kadın" },
  { value: "erkek", label: "Erkek" },
  { value: "belirtilmemis", label: "Belirtilmemiş" },
];

const KIMLIK_TIPI_SECENEKLERI = [
  { value: "tc", label: "T.C. Kimlik No" },
  { value: "pasaport", label: "Pasaport No" },
];

const textareaClass =
  "rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function BilgilerFormu({
  hasta,
  hassas,
}: {
  hasta: HastaDetay;
  hassas: HastaHassasSatir | null;
}) {
  const [durum, formAction, isPending] = useActionState(bilgileriGuncelle, null);
  const saglikRizaVarMi = Boolean(hasta.ozel_nitelikli_veri_onay_tarihi);

  return (
    <form
      action={formAction}
      key={`${hasta.cinsiyet}-${hasta.eposta}-${JSON.stringify(hassas)}`}
      className="flex flex-col gap-5"
    >
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
          <Input
            id="referans_kanali"
            name="referans_kanali"
            defaultValue={hasta.referans_kanali ?? ""}
            disabled={isPending}
          />
        </div>
        <div />
        <div className="flex flex-col gap-2">
          <Label htmlFor="kimlik_no_tipi">Kimlik Türü</Label>
          <Select
            name="kimlik_no_tipi"
            disabled={isPending}
            defaultValue={hassas?.kimlik_no_tipi ?? "tc"}
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
          <Input id="kimlik_no" name="kimlik_no" defaultValue={hassas?.kimlik_no ?? ""} disabled={isPending} />
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
            className={textareaClass}
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

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Sağlık Geçmişi</legend>
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950">
          <input
            id="saglik_riza"
            name="saglik_riza"
            type="checkbox"
            defaultChecked={saglikRizaVarMi}
            disabled={isPending || saglikRizaVarMi}
            className="mt-0.5 h-4 w-4 rounded border-input"
          />
          <Label htmlFor="saglik_riza" className="font-normal">
            Sağlık verilerimin (kronik hastalık, ilaç, alerji, ameliyat geçmişi) klinik tarafından tedavi amacıyla
            işlenmesine açık rıza veriyorum.
            {saglikRizaVarMi && (
              <span className="block text-emerald-700 dark:text-emerald-500">
                Onay {new Date(hasta.ozel_nitelikli_veri_onay_tarihi!).toLocaleDateString("tr-TR")} tarihinde
                alındı.
              </span>
            )}
          </Label>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="alerjiler" className="text-destructive">
            ⚠ Alerjiler
          </Label>
          <textarea
            id="alerjiler"
            name="alerjiler"
            rows={2}
            placeholder="İlaç, lateks, anestezi vb."
            defaultValue={hassas?.alerjiler ?? ""}
            disabled={isPending}
            className={`${textareaClass} border-red-300`}
          />
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-red-300 px-3 py-2">
          <input
            id="kan_sulandirici_kullanimi"
            name="kan_sulandirici_kullanimi"
            type="checkbox"
            defaultChecked={hassas?.kan_sulandirici_kullanimi ?? false}
            disabled={isPending}
            className="h-4 w-4 rounded border-input"
          />
          <Label htmlFor="kan_sulandirici_kullanimi" className="font-normal text-destructive">
            ⚠ Kan sulandırıcı kullanıyor
          </Label>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="kronik_hastaliklar">Kronik Hastalıklar</Label>
          <textarea
            id="kronik_hastaliklar"
            name="kronik_hastaliklar"
            rows={2}
            defaultValue={hassas?.kronik_hastaliklar ?? ""}
            disabled={isPending}
            className={textareaClass}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="surekli_ilaclar">Sürekli Kullanılan İlaçlar</Label>
          <textarea
            id="surekli_ilaclar"
            name="surekli_ilaclar"
            rows={2}
            defaultValue={hassas?.surekli_ilaclar ?? ""}
            disabled={isPending}
            className={textareaClass}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="gecirilmis_ameliyatlar">Geçirilmiş Ameliyatlar</Label>
          <textarea
            id="gecirilmis_ameliyatlar"
            name="gecirilmis_ameliyatlar"
            rows={2}
            defaultValue={hassas?.gecirilmis_ameliyatlar ?? ""}
            disabled={isPending}
            className={textareaClass}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="gelis_sebebi">Geliş Sebebi / Şikayeti</Label>
          <textarea
            id="gelis_sebebi"
            name="gelis_sebebi"
            rows={2}
            defaultValue={hassas?.gelis_sebebi ?? ""}
            disabled={isPending}
            className={textareaClass}
          />
        </div>
      </fieldset>

      <div className="flex items-center gap-2">
        <input
          id="ticari_ileti_onay"
          name="ticari_ileti_onay"
          type="checkbox"
          defaultChecked={Boolean(hasta.ticari_ileti_onay_tarihi)}
          disabled={isPending}
          className="h-4 w-4 rounded border-input"
        />
        <Label htmlFor="ticari_ileti_onay" className="font-normal">
          Kampanya/bilgilendirme (SMS-e-posta) almak istiyorum
        </Label>
      </div>

      {durum && (
        <p role="alert" className={`text-sm ${durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
          {durum.message}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? "Kaydediliyor..." : "Bilgilerimi kaydet"}
      </Button>
    </form>
  );
}
