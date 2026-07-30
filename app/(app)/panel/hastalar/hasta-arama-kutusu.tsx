"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";

export function HastaAramaKutusu({ baslangic }: { baslangic: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [deger, setDeger] = useState(baslangic);
  const zamanlayiciRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function degistir(yeniDeger: string) {
    setDeger(yeniDeger);

    if (zamanlayiciRef.current) {
      clearTimeout(zamanlayiciRef.current);
    }

    zamanlayiciRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (yeniDeger.trim()) {
        params.set("q", yeniDeger);
      } else {
        params.delete("q");
      }
      router.replace(`${pathname}?${params.toString()}`);
    }, 250);
  }

  return (
    <Input
      name="q"
      type="search"
      placeholder="Ad soyad veya telefon ile ara"
      value={deger}
      onChange={(e) => degistir(e.target.value)}
      className="max-w-sm"
    />
  );
}
