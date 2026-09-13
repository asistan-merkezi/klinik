"use client";

import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const AY_SECENEKLERI = [
  { value: "1", label: "Ocak" },
  { value: "2", label: "Şubat" },
  { value: "3", label: "Mart" },
  { value: "4", label: "Nisan" },
  { value: "5", label: "Mayıs" },
  { value: "6", label: "Haziran" },
  { value: "7", label: "Temmuz" },
  { value: "8", label: "Ağustos" },
  { value: "9", label: "Eylül" },
  { value: "10", label: "Ekim" },
  { value: "11", label: "Kasım" },
  { value: "12", label: "Aralık" },
];

export function DonemSecici({ buAy, buYil }: { buAy: number; buYil: number }) {
  const [ay, setAy] = useState(String(buAy));
  const [yil, setYil] = useState(String(buYil));

  const yilSecenekleri = Array.from({ length: 5 }, (_, i) => {
    const deger = String(buYil - i);
    return { value: deger, label: deger };
  });

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="flex flex-col gap-1">
        <label className="text-sm text-muted-foreground">Ay</label>
        <Select value={ay} onValueChange={(v) => setAy(v as string)} items={AY_SECENEKLERI}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AY_SECENEKLERI.map((secenek) => (
              <SelectItem key={secenek.value} value={secenek.value}>
                {secenek.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm text-muted-foreground">Yıl</label>
        <Select value={yil} onValueChange={(v) => setYil(v as string)} items={yilSecenekleri}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {yilSecenekleri.map((secenek) => (
              <SelectItem key={secenek.value} value={secenek.value}>
                {secenek.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
