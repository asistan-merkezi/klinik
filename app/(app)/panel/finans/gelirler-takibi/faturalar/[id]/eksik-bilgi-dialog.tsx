"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { faturaHastaBilgisiTamamla } from "../actions";

const KIMLIK_TIPLERI = [
  { value: "tc", label: "T.C. Kimlik No" },
  { value: "pasaport", label: "Pasaport No" },
];

/**
 * Faturaya engel olan eksik hasta bilgisini (e-posta, TC/pasaport, adres)
 * sayfadan ayrılmadan tamamlatır. YALNIZ eksik alanlar gösterilir; kaydedince
 * sayfa sunucudan yenilenir, eksik listesi boşalır ve "Fatura Kes" açılır.
 */
export function EksikBilgiDialog({
  hastaId,
  eksikAlanlar,
  mevcutKimlikTipi,
}: {
  hastaId: string;
  eksikAlanlar: string[];
  mevcutKimlikTipi: string | null;
}) {
  const router = useRouter();
  const [acik, setAcik] = useState(false);
  // Kapatma/yenileme effect yerine action içinde (set-state-in-effect kuralı):
  // başarıda diyalog kapanır, sunucu sayfası yeniden çekilir → eksik listesi
  // boşalır ve "Fatura Kes" açılır.
  const [durum, formAction, isPending] = useActionState(
    async (onceki: Parameters<typeof faturaHastaBilgisiTamamla>[1], formData: FormData) => {
      const sonuc = await faturaHastaBilgisiTamamla(hastaId, onceki, formData);
      if (sonuc?.success) {
        setAcik(false);
        router.refresh();
      }
      return sonuc;
    },
    null
  );

  const eksikMi = (alan: string) => eksikAlanlar.includes(alan);

  return (
    <>
      <Button type="button" variant="outline" className="w-fit" onClick={() => setAcik(true)}>
        <UserPen className="size-4" aria-hidden />
        Eksik Bilgileri Tamamla
      </Button>

      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Fatura Bilgilerini Tamamla</DialogTitle>
            <DialogDescription>
              Bu bilgiler hastanın kartına kaydedilir; kaydedince fatura kesebilirsiniz.
            </DialogDescription>
          </DialogHeader>

          <form action={formAction} className="flex flex-col gap-4">
            {eksikMi("eposta") && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fatura-eposta">E-posta</Label>
                <Input id="fatura-eposta" name="eposta" type="email" disabled={isPending} autoComplete="off" />
              </div>
            )}

            {eksikMi("kimlik_no") && (
              <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="fatura-kimlik-tipi">Kimlik Türü</Label>
                  <Select
                    name="kimlik_no_tipi"
                    disabled={isPending}
                    defaultValue={mevcutKimlikTipi === "pasaport" ? "pasaport" : "tc"}
                    items={KIMLIK_TIPLERI}
                  >
                    <SelectTrigger id="fatura-kimlik-tipi" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {KIMLIK_TIPLERI.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="fatura-kimlik-no">Kimlik No</Label>
                  <Input
                    id="fatura-kimlik-no"
                    name="kimlik_no"
                    inputMode="numeric"
                    disabled={isPending}
                    autoComplete="off"
                    className="tabular"
                  />
                </div>
              </div>
            )}

            {eksikMi("adres") && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fatura-adres">Adres</Label>
                <Textarea id="fatura-adres" name="adres" rows={3} disabled={isPending} autoComplete="off" />
              </div>
            )}

            {durum && !durum.success && (
              <p role="alert" className="text-sm text-destructive">
                {durum.message}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={isPending} onClick={() => setAcik(false)}>
                Vazgeç
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Kaydediliyor..." : "Kaydet"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
