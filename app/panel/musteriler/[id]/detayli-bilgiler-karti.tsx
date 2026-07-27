"use client";

import { useActionState, useTransition } from "react";
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
import type { MusteriDetay } from "@/types/musteri";
import type { MusteriHassasSatir } from "@/types/musteri-hassas";
import { detayliBilgileriGuncelle, ozelNitelikliOnayVer } from "./actions";

const CINSIYET_SECENEKLERI = [
  { value: "kadin", label: "Kadın" },
  { value: "erkek", label: "Erkek" },
  { value: "belirtilmemis", label: "Belirtilmemiş" },
];

const KIMLIK_TIPI_SECENEKLERI = [
  { value: "tc", label: "T.C. Kimlik No" },
  { value: "pasaport", label: "Pasaport No" },
];

export function DetayliBilgilerKarti({
  musteri,
  hassas,
}: {
  musteri: MusteriDetay;
  hassas: MusteriHassasSatir | null;
}) {
  const guncelleAction = detayliBilgileriGuncelle.bind(null, musteri.id);
  const [durum, formAction, isPending] = useActionState(guncelleAction, null);
  const [onayPending, startOnayTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-sm">
        <span>
          Sağlık verisi işleme onayı:{" "}
          {musteri.ozel_nitelikli_veri_onay_tarihi ? (
            <span className="text-emerald-600">
              {new Date(musteri.ozel_nitelikli_veri_onay_tarihi).toLocaleDateString("tr-TR")}
            </span>
          ) : (
            <span className="text-zinc-500">Alınmadı</span>
          )}
        </span>
        {!musteri.ozel_nitelikli_veri_onay_tarihi && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={onayPending}
            onClick={() =>
              startOnayTransition(async () => {
                await ozelNitelikliOnayVer(musteri.id);
              })
            }
          >
            Onay al (kağıt form imzalandıysa)
          </Button>
        )}
      </div>

      <form
        action={formAction}
        key={`${musteri.id}-${musteri.cinsiyet}-${musteri.eposta}-${musteri.referans_kanali}-${JSON.stringify(hassas)}`}
        className="flex flex-col gap-5"
      >
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-medium">Kimlik & İletişim</legend>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cinsiyet">Cinsiyet</Label>
            <Select
              name="cinsiyet"
              disabled={isPending}
              defaultValue={musteri.cinsiyet ?? undefined}
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
            <Input id="eposta" name="eposta" type="email" defaultValue={musteri.eposta ?? ""} disabled={isPending} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="referans_kanali">Bizi Nereden Duydunuz?</Label>
            <Input
              id="referans_kanali"
              name="referans_kanali"
              placeholder="Sosyal medya, tavsiye, Google..."
              defaultValue={musteri.referans_kanali ?? ""}
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

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Adres</legend>
          <textarea
            name="adres"
            rows={2}
            defaultValue={hassas?.adres ?? ""}
            disabled={isPending}
            className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
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
          <legend className="mb-1 text-sm font-medium">Tıbbi Ön Geçmiş</legend>
          <div className="flex flex-col gap-2">
            <Label htmlFor="alerjiler" className="text-red-600">
              ⚠ Alerjiler
            </Label>
            <textarea
              id="alerjiler"
              name="alerjiler"
              rows={2}
              placeholder="İlaç, lateks, anestezi vb."
              defaultValue={hassas?.alerjiler ?? ""}
              disabled={isPending}
              className="rounded-lg border border-red-300 bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="kronik_hastaliklar">Kronik Hastalıklar</Label>
            <textarea
              id="kronik_hastaliklar"
              name="kronik_hastaliklar"
              rows={2}
              defaultValue={hassas?.kronik_hastaliklar ?? ""}
              disabled={isPending}
              className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
              className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
              className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
              className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
        </fieldset>

        {durum && (
          <p role="alert" className={`text-sm ${durum.success ? "text-emerald-600" : "text-red-600"}`}>
            {durum.message}
          </p>
        )}

        <Button type="submit" disabled={isPending} className="w-fit">
          {isPending ? "Kaydediliyor..." : "Detaylı bilgileri kaydet"}
        </Button>
      </form>
    </div>
  );
}
