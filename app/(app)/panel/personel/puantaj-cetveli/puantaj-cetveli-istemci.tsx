"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { gunEtiket, haftaninGunu } from "@/lib/puantaj";
import type { HakedisSonucu } from "@/lib/personel/hakedis";
import { gunKoduHesapla, GUN_KODU_ETIKETLERI, GUN_KODU_TONLARI, type GunKodu, type PuantajSatirToplami } from "@/lib/personel/puantaj-cetveli";
import type { PersonelPuantajSatir } from "@/types/puantaj";
import { DonemKapatButonu, DonemYenidenAcButonu } from "./donem-kapat-butonu";
import { HucreDuzenleDialog } from "./hucre-duzenle-dialog";

export type PuantajCetveliSatir = {
  personelId: string;
  adSoyad: string;
  pozisyonAdi: string;
  kayitlarByTarih: Record<string, PersonelPuantajSatir>;
  toplam: PuantajSatirToplami;
  hakedis: HakedisSonucu;
  donemKapali: boolean;
};

const paraFormat = (tutar: number) => tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });
const GUN_KISA = ["Pz", "Pt", "Sa", "Ça", "Pe", "Cu", "Ct"];

function csvHucre(deger: string | number): string {
  const s = String(deger);
  if (s.includes(";") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function PuantajCetveliIstemci({
  ay,
  yil,
  ayNum,
  gunler,
  satirlar,
  resmiTatilListesi,
  cumartesiAcikMi,
  pazarAcikMi,
  yonetici,
}: {
  ay: { etiket: string; param: string; oncekiParam: string; sonrakiParam: string };
  yil: number;
  ayNum: number;
  gunler: string[];
  satirlar: PuantajCetveliSatir[];
  resmiTatilListesi: string[];
  cumartesiAcikMi: boolean;
  pazarAcikMi: boolean;
  yonetici: boolean;
}) {
  const resmiTatilSet = useMemo(() => new Set(resmiTatilListesi), [resmiTatilListesi]);
  const [eksikGunAcik, setEksikGunAcik] = useState(false);
  const [seciliHucre, setSeciliHucre] = useState<{
    personelId: string;
    adSoyad: string;
    tarih: string;
    kayit: PersonelPuantajSatir | null;
  } | null>(null);

  const kodHesapla = (satir: PuantajCetveliSatir, tarih: string): { kod: GunKodu; kayit: PersonelPuantajSatir | null } => {
    const kayit = satir.kayitlarByTarih[tarih] ?? null;
    const kod = gunKoduHesapla({ kayit, tarih, resmiTatilSet, cumartesiAcikMi, pazarAcikMi });
    return { kod, kayit };
  };

  const eksikGunler = useMemo(() => {
    const liste: { adSoyad: string; tarih: string; durum: "gelmedi" | "raporlu" }[] = [];
    for (const satir of satirlar) {
      for (const tarih of gunler) {
        const kayit = satir.kayitlarByTarih[tarih];
        if (kayit?.durum === "gelmedi" || kayit?.durum === "raporlu") {
          liste.push({ adSoyad: satir.adSoyad, tarih, durum: kayit.durum });
        }
      }
    }
    return liste.sort((a, b) => a.tarih.localeCompare(b.tarih));
  }, [satirlar, gunler]);

  function csvIndir() {
    const basliklar = [
      "Personel",
      "Pozisyon",
      ...gunler.map((g) => g.slice(8, 10)),
      "Çalışma (sa)",
      "Fazla Mesai (sa)",
      "İzin (gün)",
      "Rapor (gün)",
      "Devamsız (gün)",
      "Eksik Gün",
      "Hakediş (₺)",
    ];
    const satirlarCsv = satirlar.map((s) => {
      const gunKodlari = gunler.map((tarih) => kodHesapla(s, tarih).kod || "-");
      return [
        s.adSoyad,
        s.pozisyonAdi,
        ...gunKodlari,
        s.toplam.calismaSaat.toLocaleString("tr-TR"),
        s.toplam.fazlaMesaiSaat.toLocaleString("tr-TR"),
        String(s.toplam.izinGun),
        String(s.toplam.raporGun),
        String(s.toplam.devamsizGun),
        String(s.toplam.eksikGun),
        s.hakedis.toplam.toLocaleString("tr-TR"),
      ];
    });

    const satirMetni = [basliklar, ...satirlarCsv].map((satir) => satir.map(csvHucre).join(";")).join("\r\n");
    const blob = new Blob(["﻿" + satirMetni], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `puantaj-cetveli-${ay.param}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/panel/personel/puantaj-cetveli?ay=${ay.oncekiParam}`}>‹</Link>} />
          <span className="text-sm font-medium capitalize">{ay.etiket}</span>
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/panel/personel/puantaj-cetveli?ay=${ay.sonrakiParam}`}>›</Link>} />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEksikGunAcik(true)}>
            <ListFilter /> Eksik Gün Listesi {eksikGunler.length > 0 && `(${eksikGunler.length})`}
          </Button>
          <Button variant="outline" size="sm" onClick={csvIndir}>
            <Download /> CSV İndir
          </Button>
        </div>
      </div>

      {satirlar.length === 0 ? (
        <p className="text-sm text-muted-foreground">Puantaj takibine dahil personel yok.</p>
      ) : (
        <div className="overflow-auto rounded-xl border border-border" style={{ maxHeight: "70vh" }}>
          <table className="text-sm">
            <thead>
              <tr className="bg-muted/60 text-xs text-muted-foreground">
                <th className="sticky top-0 left-0 z-20 min-w-[180px] border-b border-r border-border bg-muted/60 px-3 py-2 text-left font-medium">
                  Personel
                </th>
                {gunler.map((tarih) => (
                  <th key={tarih} className="sticky top-0 z-10 min-w-[34px] border-b border-border bg-muted/60 px-1 py-2 text-center font-medium">
                    <div>{tarih.slice(8, 10)}</div>
                    <div className="text-[10px] font-normal">{GUN_KISA[haftaninGunu(tarih)]}</div>
                  </th>
                ))}
                <th className="sticky top-0 z-10 min-w-[70px] border-b border-l border-border bg-muted/60 px-2 py-2 text-right font-medium">Çalışma</th>
                <th className="sticky top-0 z-10 min-w-[60px] border-b border-border bg-muted/60 px-2 py-2 text-right font-medium">FM</th>
                <th className="sticky top-0 z-10 min-w-[50px] border-b border-border bg-muted/60 px-2 py-2 text-right font-medium">İzin</th>
                <th className="sticky top-0 z-10 min-w-[55px] border-b border-border bg-muted/60 px-2 py-2 text-right font-medium">Rapor</th>
                <th className="sticky top-0 z-10 min-w-[65px] border-b border-border bg-muted/60 px-2 py-2 text-right font-medium">Devamsız</th>
                <th className="sticky top-0 z-10 min-w-[60px] border-b border-border bg-muted/60 px-2 py-2 text-right font-medium">Eksik Gün</th>
                <th className="sticky top-0 z-10 min-w-[100px] border-b border-border bg-muted/60 px-2 py-2 text-right font-medium">Hakediş</th>
                {yonetici && <th className="sticky top-0 z-10 min-w-[120px] border-b border-border bg-muted/60 px-2 py-2" />}
              </tr>
            </thead>
            <tbody>
              {satirlar.map((satir) => (
                <tr key={satir.personelId} className="border-b border-border last:border-b-0 hover:bg-muted/20">
                  <td className="sticky left-0 z-10 border-r border-border bg-background px-3 py-2">
                    <div className="font-medium">{satir.adSoyad}</div>
                    <div className="text-xs text-muted-foreground">{satir.pozisyonAdi}</div>
                  </td>
                  {gunler.map((tarih) => {
                    const { kod, kayit } = kodHesapla(satir, tarih);
                    const kilitli = kayit?.kaynak === "izin_talebi";
                    return (
                      <td key={tarih} className="p-0.5 text-center">
                        <button
                          type="button"
                          disabled={!yonetici}
                          onClick={() => setSeciliHucre({ personelId: satir.personelId, adSoyad: satir.adSoyad, tarih, kayit })}
                          title={kod ? GUN_KODU_ETIKETLERI[kod] : "Kayıt yok"}
                          className={`flex h-7 w-full items-center justify-center rounded text-[11px] font-semibold ${
                            kod
                              ? TONE_BG[GUN_KODU_TONLARI[kod]]
                              : "text-muted-foreground/40"
                          } ${yonetici ? "cursor-pointer hover:opacity-80" : "cursor-default"} ${kilitli ? "opacity-70" : ""}`}
                        >
                          {kod || "·"}
                        </button>
                      </td>
                    );
                  })}
                  <td className="border-l border-border px-2 py-2 text-right tabular-nums">{satir.toplam.calismaSaat} sa</td>
                  <td className="px-2 py-2 text-right tabular-nums">{satir.toplam.fazlaMesaiSaat} sa</td>
                  <td className="px-2 py-2 text-right tabular-nums">{satir.toplam.izinGun}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{satir.toplam.raporGun}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{satir.toplam.devamsizGun}</td>
                  <td className="px-2 py-2 text-right font-medium tabular-nums">{satir.toplam.eksikGun}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {paraFormat(satir.hakedis.toplam)}
                    <div className="text-[10px] text-muted-foreground">{satir.hakedis.kaynak === "ledger" ? "kesin" : "tahmini"}</div>
                  </td>
                  {yonetici && (
                    <td className="px-2 py-2 text-right">
                      {satir.donemKapali ? (
                        <DonemYenidenAcButonu personelId={satir.personelId} yil={yil} ay={ayNum} />
                      ) : (
                        <DonemKapatButonu
                          personelId={satir.personelId}
                          yil={yil}
                          ay={ayNum}
                          ayEtiket={ay.etiket}
                          ozet={{
                            netDakika: satir.toplam.calismaSaat * 60,
                            onayliFmDakika: satir.toplam.onayliFmSaat * 60,
                            bekleyenFmDakika: Math.max(0, satir.toplam.fazlaMesaiSaat - satir.toplam.onayliFmSaat) * 60,
                            eksikDakika: 0,
                            izinGun: satir.toplam.izinGun,
                            devamsizlikGun: satir.toplam.devamsizGun,
                            calismaGunSayisi: 0,
                          }}
                        />
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {(Object.keys(GUN_KODU_ETIKETLERI) as Exclude<GunKodu, "">[]).map((kod) => (
          <span key={kod} className="flex items-center gap-1">
            <StatusBadge tone={GUN_KODU_TONLARI[kod]}>{kod}</StatusBadge> {GUN_KODU_ETIKETLERI[kod]}
          </span>
        ))}
      </div>

      {seciliHucre && (
        <HucreDuzenleDialog
          acik={seciliHucre != null}
          onOpenChange={(acik) => !acik && setSeciliHucre(null)}
          personelId={seciliHucre.personelId}
          personelAdi={seciliHucre.adSoyad}
          tarih={seciliHucre.tarih}
          kayit={seciliHucre.kayit}
          planlanan={null}
          yonetici={yonetici}
        />
      )}

      <Dialog open={eksikGunAcik} onOpenChange={setEksikGunAcik}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Eksik Gün Listesi — {ay.etiket}</DialogTitle>
          </DialogHeader>
          {eksikGunler.length === 0 ? (
            <p className="text-sm text-muted-foreground">Bu ay devamsızlık/rapor kaydı yok.</p>
          ) : (
            <ul className="flex max-h-96 flex-col divide-y divide-border overflow-y-auto text-sm">
              {eksikGunler.map((g, i) => (
                <li key={i} className="flex items-center justify-between py-2">
                  <span>{g.adSoyad}</span>
                  <span className="text-muted-foreground">{gunEtiket(g.tarih)}</span>
                  <StatusBadge tone={g.durum === "gelmedi" ? "rose" : "sky"}>
                    {g.durum === "gelmedi" ? "Devamsız" : "Raporlu"}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const TONE_BG: Record<"emerald" | "amber" | "sky" | "rose" | "slate", string> = {
  emerald: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  sky: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  rose: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  slate: "bg-muted text-muted-foreground",
};
