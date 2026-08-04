"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BakiyeSihirbazi } from "./bakiye-sihirbaz";
import { PaketSihirbazi } from "./paket-sihirbaz";

type Bolum = "bakiye" | "paket";

export function OdemePaketSihirbazi({ paketler }: { paketler: { id: string; ad: string }[] }) {
  const [bolum, setBolum] = useState<Bolum>("bakiye");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-2">
        <Button type="button" variant={bolum === "bakiye" ? "default" : "outline"} onClick={() => setBolum("bakiye")}>
          Bakiye Hareketi
        </Button>
        <Button type="button" variant={bolum === "paket" ? "default" : "outline"} onClick={() => setBolum("paket")}>
          Kalan Paket Hakkı
        </Button>
      </div>

      {bolum === "bakiye" ? (
        <BakiyeSihirbazi />
      ) : (
        <PaketSihirbazi paketler={paketler} />
      )}
    </div>
  );
}
