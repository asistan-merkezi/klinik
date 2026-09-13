"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

type CariOzetSatiri = {
  hasta_id: string;
  ad_soyad: string;
  toplam_bakiye: number;
  tahsil_edilen: number;
  kalan_bakiye: number;
};

const paraFormat = (tutar: number) => tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

export function CariAlacaklarListesi({ satirlar }: { satirlar: CariOzetSatiri[] }) {
  const [arama, setArama] = useState("");

  const filtrelenmis = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr");
    if (!q) return satirlar;
    return satirlar.filter((s) => s.ad_soyad.toLocaleLowerCase("tr").includes(q));
  }, [satirlar, arama]);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          placeholder="Hasta ismi ile ara"
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          className="h-11 pl-8 focus-visible:ring-ring/50"
        />
      </div>

      {filtrelenmis.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aramayla eşleşen hasta bulunamadı.</p>
      ) : (
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Hasta</TableHead>
              <TableHead className="text-right">Toplam Bakiye</TableHead>
              <TableHead className="text-right">Tahsil Edilen</TableHead>
              <TableHead className="text-right">Kalan Bakiye</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtrelenmis.map((s) => {
              const href = `/panel/hastalar/${s.hasta_id}/cari`;
              return (
                <TableRow key={s.hasta_id}>
                  <TableCell className="p-0">
                    <Link href={href} className="block px-4 py-3.5 font-medium">
                      {s.ad_soyad}
                    </Link>
                  </TableCell>
                  <TableCell className="p-0">
                    <Link href={href} className="block px-4 py-3.5 text-right tabular-nums">
                      {paraFormat(s.toplam_bakiye)}
                    </Link>
                  </TableCell>
                  <TableCell className="p-0">
                    <Link
                      href={href}
                      className="block px-4 py-3.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400"
                    >
                      {paraFormat(s.tahsil_edilen)}
                    </Link>
                  </TableCell>
                  <TableCell className="p-0">
                    <Link
                      href={href}
                      className={`block px-4 py-3.5 text-right tabular-nums font-semibold ${
                        s.kalan_bakiye > 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"
                      }`}
                    >
                      {paraFormat(s.kalan_bakiye)}
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
