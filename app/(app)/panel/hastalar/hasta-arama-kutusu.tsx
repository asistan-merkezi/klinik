"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
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
    <div className="relative max-w-sm">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        name="q"
        type="search"
        placeholder="Ad soyad veya telefon ile ara"
        value={deger}
        onChange={(e) => degistir(e.target.value)}
        className="h-11 pl-8 focus-visible:ring-ring/50"
      />
    </div>
  );
}
