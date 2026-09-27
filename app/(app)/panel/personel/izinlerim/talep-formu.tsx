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

export type PersonelSecenegi = { id: string; adSoyad: string; departman: string };

export type PersonelSecici =
  | { mod: "kendi"; adSoyad: string }
  | { mod: "sec"; personelListesi: PersonelSecenegi[] };

const GUN_SAYISI_SECENEKLERI = Array.from({ length: 60 }, (_, i) => {
  const n = i + 1;
  return { value: String(n), label: `${n} gün` };
});

/** Başlangıçtan itibaren TAKVİM günü sayar (iş günü/hafta tatili ayrımı yok) — RPC'nin döndürdüğü "iş günü" önizlemesi zaten bunun altında ayrıca gösteriliyor. */
function bitisHesapla(baslangic: string, gunSayisi: number): string {
  const d = new Date(`${baslangic}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (gunSayisi - 1));
  return d.toISOString().slice(0, 10);
}

export function TalepFormu({ personelSecici }: { personelSecici: PersonelSecici }) {
  const [durum, formAction, isPending] = useActionState(izinTalebiOlustur, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [baslangic, setBaslangic] = useState("");
  const [gunSayisiSecimi, setGunSayisiSecimi] = useState("1");
  const [isGunuSayisi, setIsGunuSayisi] = useState<number | null>(null);
  const [sayaçYukleniyor, setSayaçYukleniyor] = useState(false);
  const sonIstekRef = useRef(0);
  const [departman, setDepartman] = useState("");
  const [personelId, setPersonelId] = useState("");

  const bitis = baslangic && gunSayisiSecimi ? bitisHesapla(baslangic, Number(gunSayisiSecimi)) : "";

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
      setGunSayisiSecimi("1");
      setIsGunuSayisi(null);
      setDepartman("");
      setPersonelId("");
      setResetSayaci((n) => n + 1);
    }
  }

  useEffect(() => {
    if (resetSayaci > 0) formRef.current?.reset();
  }, [resetSayaci]);

  function isGunuHesapla(yeniBaslangic: string, yeniGunSayisiSecimi: string) {
    setIsGunuSayisi(null);

    if (!yeniBaslangic || !yeniGunSayisiSecimi) return;
    const yeniBitis = bitisHesapla(yeniBaslangic, Number(yeniGunSayisiSecimi));

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
      if (!error) setIsGunuSayisi(data as number);
    }, 300);

    return () => clearTimeout(zamanlayici);
  }

  function vazgec() {
    setBaslangic("");
    setGunSayisiSecimi("1");
    setIsGunuSayisi(null);
    setDepartman("");
    setPersonelId("");
    formRef.current?.reset();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Yeni İzin Talebi</CardTitle>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="flex flex-col gap-3">
          {personelSecici.mod === "kendi" ? (
            <div className="flex flex-col gap-1">
              <Label>Personel</Label>
              <p className="text-sm font-medium">{personelSecici.adSoyad}</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="departman">Departman</Label>
                <Select
                  value={departman}
                  onValueChange={(v) => {
                    setDepartman(v ?? "");
                    setPersonelId("");
                  }}
                  disabled={isPending}
                  items={[...new Set(personelSecici.personelListesi.map((p) => p.departman))].map((d) => ({
                    value: d,
                    label: d,
                  }))}
                >
                  <SelectTrigger id="departman" className="w-full">
                    <SelectValue placeholder="Departman seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {[...new Set(personelSecici.personelListesi.map((p) => p.departman))].map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor="personel_id">Personel</Label>
                <Select
                  name="personel_id"
                  required
                  value={personelId}
                  onValueChange={(v) => setPersonelId(v ?? "")}
                  disabled={isPending || !departman}
                  items={personelSecici.personelListesi
                    .filter((p) => p.departman === departman)
                    .map((p) => ({ value: p.id, label: p.adSoyad }))}
                >
                  <SelectTrigger id="personel_id" className="w-full">
                    <SelectValue placeholder={departman ? "Personel seçin" : "Önce departman seçin"} />
                  </SelectTrigger>
                  <SelectContent>
                    {personelSecici.personelListesi
                      .filter((p) => p.departman === departman)
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.adSoyad}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

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
                onChange={(e) => {
                  setBaslangic(e.target.value);
                  isGunuHesapla(e.target.value, gunSayisiSecimi);
                }}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="gun_sayisi">Gün Sayısı</Label>
              <Select
                value={gunSayisiSecimi}
                onValueChange={(v) => {
                  const yeni = v ?? "1";
                  setGunSayisiSecimi(yeni);
                  isGunuHesapla(baslangic, yeni);
                }}
                disabled={isPending}
                items={GUN_SAYISI_SECENEKLERI}
              >
                <SelectTrigger id="gun_sayisi" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GUN_SAYISI_SECENEKLERI.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="bitis_tarih" value={bitis} />
            </div>
          </div>

          {baslangic && bitis && (
            <p className="text-sm text-muted-foreground">
              {sayaçYukleniyor
                ? "Hesaplanıyor..."
                : isGunuSayisi === null
                  ? ""
                  : `${new Date(baslangic).toLocaleDateString("tr-TR")} – ${new Date(bitis).toLocaleDateString("tr-TR")} → ${isGunuSayisi} iş günü`}
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

          <div className="flex items-center gap-2">
            <Button
              type="submit"
              disabled={isPending || isGunuSayisi === 0 || (personelSecici.mod === "sec" && !personelId)}
              className="w-fit"
            >
              {isPending ? "Gönderiliyor..." : "Talep Gönder"}
            </Button>
            <Button type="button" variant="outline" disabled={isPending} onClick={vazgec} className="w-fit">
              Vazgeç
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
