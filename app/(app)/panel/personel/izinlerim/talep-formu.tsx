"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { IZIN_TIP_SECENEKLERI } from "@/types/izin";
import { izinTalebiOlustur } from "./actions";

export function TalepFormu() {
  const [durum, formAction, isPending] = useActionState(izinTalebiOlustur, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [baslangic, setBaslangic] = useState("");
  const [bitis, setBitis] = useState("");
  const [gunSayisi, setGunSayisi] = useState<number | null>(null);
  const [sayaçYukleniyor, setSayaçYukleniyor] = useState(false);
  const sonIstekRef = useRef(0);

  // Render sırasında karşılaştırma — useEffect+setState yerine (bkz. proje
  // konvansiyonu: react-hooks/set-state-in-effect tuzağına düşmemek için
  // BorcDuzenleDialog'daki "prop değişimini render sırasında karşılaştır" deseni).
  // formRef.current?.reset() BURADA çağrılamaz (render sırasında ref okumak/
  // yazmak react-hooks/refs tarafından reddediliyor) — o yüzden sadece bir
  // sayaç artırılıp asıl reset ayrı, setState İÇERMEYEN bir effect'e bırakıldı.
  const [sonDurum, setSonDurum] = useState(durum);
  const [resetSayaci, setResetSayaci] = useState(0);
  if (durum !== sonDurum) {
    setSonDurum(durum);
    if (durum?.success) {
      setBaslangic("");
      setBitis("");
      setGunSayisi(null);
      setResetSayaci((n) => n + 1);
    }
  }

  useEffect(() => {
    if (resetSayaci > 0) formRef.current?.reset();
  }, [resetSayaci]);

  function tarihDegisti(yeniBaslangic: string, yeniBitis: string) {
    setBaslangic(yeniBaslangic);
    setBitis(yeniBitis);
    setGunSayisi(null);

    if (!yeniBaslangic || !yeniBitis || yeniBitis < yeniBaslangic) return;

    const istekNo = ++sonIstekRef.current;
    setSayaçYukleniyor(true);
    const zamanlayici = setTimeout(async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("personel_izin_is_gunu_sayisi", {
        p_baslangic: yeniBaslangic,
        p_bitis: yeniBitis,
      });
      if (istekNo !== sonIstekRef.current) return; // eskimiş istek, yok say
      setSayaçYukleniyor(false);
      if (!error) setGunSayisi(data as number);
    }, 300);

    return () => clearTimeout(zamanlayici);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Yeni İzin Talebi</CardTitle>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="tip">İzin Türü</Label>
              <Select name="tip" required disabled={isPending} defaultValue="yillik" items={IZIN_TIP_SECENEKLERI}>
                <SelectTrigger id="tip" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IZIN_TIP_SECENEKLERI.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="belge">Belge (opsiyonel)</Label>
              <Input id="belge" name="belge" type="file" accept=".pdf,.jpg,.jpeg,.png" disabled={isPending} />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="baslangic_tarih">Başlangıç</Label>
              <Input
                id="baslangic_tarih"
                name="baslangic_tarih"
                type="date"
                required
                disabled={isPending}
                value={baslangic}
                onChange={(e) => tarihDegisti(e.target.value, bitis)}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="bitis_tarih">Bitiş</Label>
              <Input
                id="bitis_tarih"
                name="bitis_tarih"
                type="date"
                required
                disabled={isPending}
                value={bitis}
                onChange={(e) => tarihDegisti(baslangic, e.target.value)}
              />
            </div>
          </div>

          {baslangic && bitis && (
            <p className="text-sm text-muted-foreground">
              {sayaçYukleniyor
                ? "Hesaplanıyor..."
                : gunSayisi === null
                  ? bitis < baslangic
                    ? "Bitiş tarihi başlangıçtan önce olamaz."
                    : ""
                  : `${new Date(baslangic).toLocaleDateString("tr-TR")} – ${new Date(bitis).toLocaleDateString("tr-TR")} → ${gunSayisi} iş günü`}
            </p>
          )}

          <div className="flex flex-col gap-1">
            <Label htmlFor="gerekce">Gerekçe</Label>
            <textarea
              id="gerekce"
              name="gerekce"
              rows={2}
              disabled={isPending}
              placeholder="Opsiyonel"
              className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          {durum && (
            <p role="alert" className={`text-sm ${durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
              {durum.message}
            </p>
          )}

          <Button type="submit" disabled={isPending || gunSayisi === 0} className="w-fit">
            {isPending ? "Gönderiliyor..." : "Talep Gönder"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
