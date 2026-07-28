"use client";

import { useQuery } from "@tanstack/react-query";
import type { MusteriBelge } from "@/types/musteri-belge";
import { belgeThumbnailUrlAl } from "./actions";

const YENILEME_ARALIGI_MS = 4 * 60 * 1000; // 5dk expiry'den önce sessizce yenile

/**
 * Signed URL client'ta uzun süre cache'lenmez (query cache'i sadece 4dk
 * taze tutulur); süre dolmadan proaktif olarak arka planda yenilenir, bu
 * yüzden kullanıcı 403/expired hatası görmez.
 */
export function useSignedThumbnail(belge: MusteriBelge) {
  const query = useQuery({
    queryKey: ["belge_thumbnail_url", belge.id],
    enabled: belge.dosya_mime !== "application/pdf",
    staleTime: YENILEME_ARALIGI_MS,
    refetchInterval: YENILEME_ARALIGI_MS,
    queryFn: async () => {
      const sonuc = await belgeThumbnailUrlAl(belge.id);
      if ("error" in sonuc) throw new Error(sonuc.error);
      return sonuc.url;
    },
  });

  return { url: query.data ?? null, yukleniyor: query.isLoading };
}
