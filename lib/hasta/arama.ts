import type { SupabaseClient } from "@supabase/supabase-js";
import { telefonYerelHaneleriCikar } from "@/lib/utils";

/**
 * YEDEK arama filtresi (PostgREST `.or()`): `hasta_ara` RPC'si canlıda yoksa
 * kullanılır (bkz. hastaAra). Türkçe harf duyarsız/yazım hatası toleranslı DEĞİL.
 *
 * - PostgREST sözdizimini bozan karakterler (`,()`) ve ILIKE joker karakterleri
 *   (`%_\`) aramadan çıkarılır.
 * - Telefon, kayıt biçiminden bağımsız bulunsun diye rakamlara indirgenir:
 *   "0532 123 45 67" / "+90 532..." → "5321234567" (kayıtlı değer "0532...",
 *   "+90532..." ya da "532..." olabilir, hepsi bu alt dizeyi içerir).
 */
export function hastaAramaFiltresi(arama: string): string | null {
  const metin = arama.replace(/[,()%_\*]/g, " ").replace(/\s+/g, " ").trim();
  if (!metin) return null;

  const kosullar = [`ad_soyad.ilike.%${metin}%`];
  const rakamlar = metin.replace(/\D/g, "");
  if (rakamlar.length >= 3) {
    const yerel = rakamlar.length >= 10 ? telefonYerelHaneleriCikar(rakamlar) : rakamlar.replace(/^0+/, "");
    if (yerel) kosullar.push(`telefon.ilike.%${yerel}%`);
  }
  return kosullar.join(",");
}

/**
 * Hasta listesi ve hızlı aramanın TEK giriş noktası. Önce Türkçe uyumlu,
 * yazım hatasına toleranslı `hasta_ara` RPC'si (migration 20261005150000:
 * "sahin" → "Şahin", "mehemt" → "Mehmet", telefon rakamları); RPC yoksa
 * (migration uygulanmadan deploy) eski ILIKE filtresine düşer.
 * `select` embed içerebilir (RPC `SETOF hasta` döndüğü için PostgREST embed'i çalışır).
 */
export async function hastaAra<T>(
  supabase: SupabaseClient,
  arama: string,
  select: string,
  limit: number
): Promise<{ data: T[]; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc("hasta_ara", { p_sorgu: arama, p_limit: limit }).select(select);
  if (!error) return { data: (data ?? []) as T[], error: null };
  if (error.code !== "PGRST202" && error.code !== "42883") return { data: [], error };

  const filtre = hastaAramaFiltresi(arama);
  if (!filtre) return { data: [], error: null };
  const yedek = await supabase.from("hasta").select(select).or(filtre).order("ad_soyad").limit(limit);
  return { data: (yedek.data ?? []) as T[], error: yedek.error };
}
