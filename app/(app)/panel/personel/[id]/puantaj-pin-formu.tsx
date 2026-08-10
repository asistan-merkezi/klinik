"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { personelPuantajPinBelirle, personelPuantajPinSifirla } from "./actions";

/**
 * Puantaj PIN'i — kendisi kendi PIN'ini belirler/değiştirir, admin sadece
 * sıfırlayabilir (yeniden belirleme her zaman personelin kendisine ait).
 * Yetki kontrolü asıl olarak ilgili RPC'lerin içinde (bkz. actions.ts), bu
 * bileşen sadece hangi formun gösterileceğini belirliyor.
 */
export function PuantajPinFormu({
  personelId,
  guncellemeTarihi,
  yonetici,
  kendisi,
}: {
  personelId: string;
  guncellemeTarihi: string | null;
  yonetici: boolean;
  kendisi: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        {guncellemeTarihi
          ? `PIN son güncelleme: ${new Date(guncellemeTarihi).toLocaleDateString("tr-TR")}`
          : "PIN henüz belirlenmemiş."}
      </p>
      {kendisi && <BelirleFormu personelId={personelId} />}
      {yonetici && !kendisi && <SifirlaButonu personelId={personelId} />}
    </div>
  );
}

function BelirleFormu({ personelId }: { personelId: string }) {
  const action = personelPuantajPinBelirle.bind(null, personelId);
  const [durum, formAction, isPending] = useActionState(action, null);
  const [pin, setPin] = useState("");
  const [tekrar, setTekrar] = useState("");

  const uyusmuyor = tekrar.length > 0 && pin !== tekrar;

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="pin">Yeni PIN (6 hane)</Label>
          <Input
            id="pin"
            name="pin"
            type="password"
            inputMode="numeric"
            maxLength={6}
            pattern="\d{6}"
            required
            disabled={isPending}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="pin_tekrar">PIN (Tekrar)</Label>
          <Input
            id="pin_tekrar"
            type="password"
            inputMode="numeric"
            maxLength={6}
            required
            disabled={isPending}
            value={tekrar}
            onChange={(e) => setTekrar(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />
        </div>
      </div>

      {uyusmuyor && <p className="text-sm text-destructive">PIN&apos;ler uyuşmuyor.</p>}
      {durum && (
        <p role="alert" className={`text-sm ${durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
          {durum.message}
        </p>
      )}

      <Button
        type="submit"
        size="sm"
        className="w-fit"
        disabled={isPending || pin.length !== 6 || tekrar.length !== 6 || uyusmuyor}
      >
        {isPending ? "Kaydediliyor..." : "PIN'i Kaydet"}
      </Button>
    </form>
  );
}

function SifirlaButonu({ personelId }: { personelId: string }) {
  const [isPending, startTransition] = useTransition();
  const [sonuc, setSonuc] = useState<{ success: boolean; message: string } | null>(null);
  const [onayBekliyor, setOnayBekliyor] = useState(false);

  function sifirla() {
    startTransition(async () => {
      const r = await personelPuantajPinSifirla(personelId);
      setSonuc(r);
      setOnayBekliyor(false);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {onayBekliyor ? (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">PIN sıfırlansın mı?</span>
          <Button type="button" size="sm" variant="destructive" disabled={isPending} onClick={sifirla}>
            Evet, sıfırla
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => setOnayBekliyor(false)}>
            Vazgeç
          </Button>
        </div>
      ) : (
        <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => setOnayBekliyor(true)}>
          PIN&apos;i Sıfırla
        </Button>
      )}
      {sonuc && (
        <p role="alert" className={`text-sm ${sonuc.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
          {sonuc.message}
        </p>
      )}
    </div>
  );
}
