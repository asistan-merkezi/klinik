"use client";

import { useQuery } from "@tanstack/react-query";
import type { BelgeKategori } from "@/types/hasta-belge";
import { hastaBelgeleriGetir, karsilastirmaGruplariGetir, klinikFotoOnamGetir } from "./veri-actions";

export function useHastaBelgeler(hastaId: string, kategori: BelgeKategori, aktif: boolean) {
  return useQuery({
    queryKey: ["hasta_belge", hastaId, kategori],
    enabled: aktif,
    queryFn: () => hastaBelgeleriGetir(hastaId, kategori),
  });
}

export function useKlinikFotoOnam(hastaId: string, aktif: boolean) {
  return useQuery({
    queryKey: ["hasta_onam_klinik_foto", hastaId],
    enabled: aktif,
    queryFn: () => klinikFotoOnamGetir(hastaId),
  });
}

export function useKarsilastirmaGruplari(hastaId: string, aktif: boolean) {
  return useQuery({
    queryKey: ["karsilastirma_gruplari", hastaId],
    enabled: aktif,
    queryFn: () => karsilastirmaGruplariGetir(hastaId),
  });
}
