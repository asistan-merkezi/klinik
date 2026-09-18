"use client";

import { Briefcase } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { IsBasvurusu } from "@/types/personel";
import type { Pozisyon } from "@/types/pozisyon";
import { BasvuruSatiri } from "./basvuru-satiri";

export function BasvuruListesi({
  basvurular,
  pozisyonlar,
}: {
  basvurular: IsBasvurusu[];
  pozisyonlar: Pozisyon[];
}) {
  if (basvurular.length === 0) {
    return <EmptyState icon={Briefcase} title="Kayıt yok." compact />;
  }

  return (
    <ul className="flex flex-col gap-2">
      {basvurular.map((b) => (
        <BasvuruSatiri key={b.id} basvuru={b} pozisyonlar={pozisyonlar} />
      ))}
    </ul>
  );
}
