"use client";

import { useActionState, useId, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  BOLUM_ETIKET,
  KANAL_ETIKET,
  type MesajKanal,
  type MesajKrediHareketi,
  type MesajKullanimOzetSatir,
} from "@/types/mesajlasma";

type SonucDurumu = { success: boolean; message: string } | null;
type KrediYuklemeAction = (onceki: SonucDurumu, formData: FormData) => Promise<SonucDurumu>;

const tarihFormat = (tarih: string) => new Date(tarih).toLocaleDateString("tr-TR");
const tarihSaatFormat = (tarih: string) => new Date(tarih).toLocaleString("tr-TR");

export function KrediDetay({
  kanal,
  bakiye,
  sonSenkronZamani,
  superAdminMi,
  hareketler,
  kullanimOzet,
  action,
}: {
  kanal: MesajKanal;
  bakiye: number;
  sonSenkronZamani: string | null;
  superAdminMi: boolean;
  hareketler: MesajKrediHareketi[];
  kullanimOzet: MesajKullanimOzetSatir[];
  action: KrediYuklemeAction;
}) {
  const idOnEki = useId();
  const [durum, formAction, isPending] = useActionState(action, null);
  const [miktar, setMiktar] = useState("");

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">Güncel Bakiye — {KANAL_ETIKET[kanal]}</p>
          <p className="text-3xl font-semibold tabular-nums">{bakiye}</p>
          <p className="text-xs text-muted-foreground">
            {sonSenkronZamani ? `Merkezle son senkron: ${tarihSaatFormat(sonSenkronZamani)}` : "Henüz merkezle senkronize edilmedi."}
          </p>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-1 text-sm font-semibold">{superAdminMi ? "Kredi Yükle" : "Kredi Talebi"}</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          {superAdminMi
            ? "Merkeze doğrudan kredi yükleme isteği gönderir."
            : "Kredi yükleme yetkisi platform yöneticisine ait — bu formu gönderdiğinizde krediniz hemen eklenmez, bir talep kaydı oluşur ve onaylandığında kliniğinize eklenir."}
        </p>
        <form action={formAction} className="flex max-w-sm flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${idOnEki}-miktar`}>Kredi Miktarı</Label>
            <Input
              id={`${idOnEki}-miktar`}
              name="miktar"
              type="number"
              min={1}
              step={1}
              required
              disabled={isPending}
              value={miktar}
              onChange={(e) => setMiktar(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${idOnEki}-odeme-referansi`}>Ödeme Referansı</Label>
            <Input
              id={`${idOnEki}-odeme-referansi`}
              name="odeme_referansi"
              required
              disabled={isPending}
              placeholder="Örn. dekont no, sipariş no"
            />
          </div>

          {durum && (
            <p role="alert" className={cn("text-sm", durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
              {durum.message}
            </p>
          )}

          <Button type="submit" disabled={isPending || !miktar} className="w-fit">
            {isPending ? "Gönderiliyor..." : superAdminMi ? "Kredi Yükle" : "Kredi Talebi Gönder"}
          </Button>
        </form>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold">Kullanım Raporu</h2>
        <KullanimRaporu kullanimOzet={kullanimOzet} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold">Kredi Yükleme Geçmişi</h2>
        {hareketler.length === 0 ? (
          <p className="text-sm text-muted-foreground">Henüz kredi yüklemesi yok.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {hareketler.map((hareket) => (
              <li key={hareket.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                <div className="flex flex-col">
                  {hareket.aciklama && <span className="text-muted-foreground">{hareket.aciklama}</span>}
                  <span className="text-xs text-muted-foreground">{tarihSaatFormat(hareket.created_at)}</span>
                </div>
                <span className="tabular-nums font-medium text-emerald-600 dark:text-emerald-400">+{hareket.miktar}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Her ay ayrı, katlanır bir bölümde kendi günlük listesini gösterir — İş
 * Başvurusu arşivindeki (BasvuruArsivi/ArsivGrubu) ay/yıl gruplama deseniyle
 * birebir aynı yaklaşım, sabit bir gün aralığı filtresi yerine.
 */
function KullanimRaporu({ kullanimOzet }: { kullanimOzet: MesajKullanimOzetSatir[] }) {
  const aylar = useMemo(() => {
    const map = new Map<string, { etiket: string; satirlar: MesajKullanimOzetSatir[]; toplam: number }>();
    for (const satir of kullanimOzet) {
      const tarih = new Date(satir.tarih);
      const anahtar = `${tarih.getFullYear()}-${String(tarih.getMonth() + 1).padStart(2, "0")}`;
      const etiket = tarih.toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
      if (!map.has(anahtar)) map.set(anahtar, { etiket, satirlar: [], toplam: 0 });
      const grup = map.get(anahtar)!;
      grup.satirlar.push(satir);
      grup.toplam += satir.toplam_adet;
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([anahtar, grup]) => ({
        anahtar,
        ...grup,
        satirlar: grup.satirlar.sort((a, b) => b.tarih.localeCompare(a.tarih)),
      }));
  }, [kullanimOzet]);

  if (aylar.length === 0) {
    return <p className="text-sm text-muted-foreground">Henüz gönderim kaydı yok.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {aylar.map((ay) => (
        <AyGrubu key={ay.anahtar} etiket={ay.etiket} satirlar={ay.satirlar} toplam={ay.toplam} />
      ))}
    </div>
  );
}

function AyGrubu({
  etiket,
  satirlar,
  toplam,
}: {
  etiket: string;
  satirlar: MesajKullanimOzetSatir[];
  toplam: number;
}) {
  const [acik, setAcik] = useState(false);

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setAcik((a) => !a)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm font-medium"
        aria-expanded={acik}
      >
        <span className="capitalize">{etiket}</span>
        <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
          {toplam} gönderim
          <ChevronDown className={cn("size-4 transition-transform", acik && "rotate-180")} aria-hidden />
        </span>
      </button>
      {acik && (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Tarih</th>
                <th className="px-3 py-2 text-left font-medium">Bölüm</th>
                <th className="px-3 py-2 text-right font-medium">Adet</th>
              </tr>
            </thead>
            <tbody>
              {satirlar.map((s) => (
                <tr key={`${s.tarih}-${s.bolum}`} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 text-muted-foreground">{tarihFormat(s.tarih)}</td>
                  <td className="px-3 py-2">{BOLUM_ETIKET[s.bolum]}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.toplam_adet}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
