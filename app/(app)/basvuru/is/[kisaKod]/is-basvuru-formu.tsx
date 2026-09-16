"use client";

import { useActionState, useState } from "react";
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
import { isimBasHarfBuyukYap } from "@/lib/utils";
import { isBasvurusuOlustur } from "./actions";

const CALISMA_SEKLI_SECENEKLERI = [
  { value: "tam_zamanli", label: "Tam Zamanlı" },
  { value: "yari_zamanli", label: "Yarı Zamanlı" },
];

const inputSinifi =
  "flex w-full rounded-lg border border-input bg-input-bg px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function DeneyimSatiri({ sira }: { sira: number }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <Input name={`deneyim${sira}_sirket`} placeholder="Şirket Adı" />
      <Input name={`deneyim${sira}_gorev`} placeholder="Görev" />
      <Input name={`deneyim${sira}_sure`} placeholder="Süre (Başlangıç - Bitiş)" />
    </div>
  );
}

function ReferansSatiri({ sira }: { sira: number }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <Input name={`referans${sira}_ad_soyad`} placeholder="Ad Soyad" />
      <Input name={`referans${sira}_telefon`} type="tel" placeholder="Telefon" />
      <Input name={`referans${sira}_baglanti`} placeholder="Bağlantı (Yönetici, İş Arkadaşı vb.)" />
    </div>
  );
}

// Bilinçli tercih: PDF'teki (yazdırılan) İş Başvuru Formu ile birebir aynı
// alanlar — kullanıcı kararı "webteki formla pdf aynı olsun". Alan sırası,
// bölüm başlıkları ve İş Deneyimi/Referanslar satır sayıları (3/2) PDF'teki
// lib/pdf/is-basvuru-formu-sablon.ts ile eşleşecek şekilde tutuldu.
export function IsBasvuruFormu({ klinikId }: { klinikId: string }) {
  const [durum, formAction, isPending] = useActionState(isBasvurusuOlustur, null);
  const [adSoyad, setAdSoyad] = useState("");

  if (durum?.success) {
    return (
      <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
        {durum.message}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="klinik_id" value={klinikId} />

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold">Kişisel Bilgiler</legend>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ad_soyad">Ad Soyad</Label>
          <Input
            id="ad_soyad"
            name="ad_soyad"
            value={adSoyad}
            onChange={(e) => setAdSoyad(isimBasHarfBuyukYap(e.target.value))}
            required
            disabled={isPending}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="telefon">Telefon</Label>
            <Input id="telefon" name="telefon" type="tel" placeholder="05xx xxx xx xx" required disabled={isPending} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="eposta">E-posta (opsiyonel)</Label>
            <Input id="eposta" name="eposta" type="email" disabled={isPending} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="dogum_tarihi">Doğum Tarihi (opsiyonel)</Label>
            <Input id="dogum_tarihi" name="dogum_tarihi" type="date" disabled={isPending} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tc_kimlik_no">T.C. Kimlik No (opsiyonel)</Label>
            <Input id="tc_kimlik_no" name="tc_kimlik_no" inputMode="numeric" maxLength={11} disabled={isPending} />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="adres">Adres (opsiyonel)</Label>
          <textarea id="adres" name="adres" rows={2} disabled={isPending} className={inputSinifi} />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold">Başvuru Bilgileri</legend>
        <div className="flex flex-col gap-2">
          <Label htmlFor="pozisyon">Başvurulan Pozisyon (opsiyonel)</Label>
          <Input id="pozisyon" name="pozisyon" disabled={isPending} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="bizi_nereden_duydunuz">Bizi Nereden Duydunuz? (opsiyonel)</Label>
            <Input id="bizi_nereden_duydunuz" name="bizi_nereden_duydunuz" disabled={isPending} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="calismaya_baslama_tarihi">Çalışmaya Başlayabileceğiniz Tarih (opsiyonel)</Label>
            <Input id="calismaya_baslama_tarihi" name="calismaya_baslama_tarihi" type="date" disabled={isPending} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="calisma_sekli">Tercih Edilen Çalışma Şekli (opsiyonel)</Label>
            <Select name="calisma_sekli" disabled={isPending} items={CALISMA_SEKLI_SECENEKLERI}>
              <SelectTrigger id="calisma_sekli" className="w-full">
                <SelectValue placeholder="Belirtilmemiş" />
              </SelectTrigger>
              <SelectContent>
                {CALISMA_SEKLI_SECENEKLERI.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="beklenen_ucret">Beklenen Ücret (opsiyonel)</Label>
            <Input id="beklenen_ucret" name="beklenen_ucret" disabled={isPending} />
          </div>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold">Eğitim Bilgisi</legend>
        <div className="flex flex-col gap-2">
          <Label htmlFor="egitim_okul_bolum">Son Mezun Olunan Okul / Bölüm (opsiyonel)</Label>
          <Input id="egitim_okul_bolum" name="egitim_okul_bolum" disabled={isPending} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="egitim_mezuniyet_yili">Mezuniyet Yılı (opsiyonel)</Label>
            <Input id="egitim_mezuniyet_yili" name="egitim_mezuniyet_yili" inputMode="numeric" disabled={isPending} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="egitim_sertifikalar">Sertifika / Belgeler (opsiyonel)</Label>
            <Input id="egitim_sertifikalar" name="egitim_sertifikalar" disabled={isPending} />
          </div>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">İş Deneyimi (varsa, son 3 iş yeri)</legend>
        <DeneyimSatiri sira={1} />
        <DeneyimSatiri sira={2} />
        <DeneyimSatiri sira={3} />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">Referanslar</legend>
        <ReferansSatiri sira={1} />
        <ReferansSatiri sira={2} />
      </fieldset>

      <div className="flex items-start gap-2">
        <input
          id="kvkk_onay"
          name="kvkk_onay"
          type="checkbox"
          required
          disabled={isPending}
          className="mt-0.5 h-4 w-4 rounded border-input"
        />
        <Label htmlFor="kvkk_onay" className="font-normal">
          Bu formda paylaştığım kişisel verilerin, başvurumun değerlendirilmesi ve mülakat süreçlerinin
          yürütülmesi amacıyla işlenmesini kabul ediyorum. (Zorunlu)
        </Label>
      </div>

      {durum && !durum.success && (
        <p role="alert" className="text-sm text-destructive">
          {durum.message}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Gönderiliyor..." : "Başvurumu Gönder"}
      </Button>
    </form>
  );
}
