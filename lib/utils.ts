import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function gunAraligi(tarih: Date = new Date()) {
  const baslangic = new Date(Date.UTC(tarih.getUTCFullYear(), tarih.getUTCMonth(), tarih.getUTCDate()));
  const bitis = new Date(baslangic);
  bitis.setUTCDate(bitis.getUTCDate() + 1);
  return { baslangic: baslangic.toISOString(), bitis: bitis.toISOString() };
}
