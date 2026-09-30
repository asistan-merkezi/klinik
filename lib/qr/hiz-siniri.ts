import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Public QR uçları (anon) için hız sınırı — sayaç Postgres'te
 * (`hiz_siniri_kullan` RPC, migration 20260930120000), yalnız service_role
 * çağırabilir; bu yüzden admin client kullanılır.
 *
 * FAIL-OPEN: migration uygulanmamışsa ya da DB hatası varsa istek engellenmez
 * (yalnız loglanır) — aksi halde koruma katmanı kendisi kesinti yaratırdı, ve
 * migration uygulanmadan deploy edilen kod tüm QR formlarını kırardı
 * (bkz. migration_before_push).
 *
 * Klinik ağında tüm hasta/personel aynı çıkış IP'sini paylaşır (NAT); bu yüzden
 * IP limitleri gevşek, asıl kaba güç koruması klinik bazlı toplam limitte.
 */

export type HizSiniriKurali = { anahtar: string; limit: number; pencereSn: number };

const IP_BILINMIYOR = "bilinmiyor";

/** IP'yi düz saklamayız (KVKK); kısa bir hash yeterli. */
async function istemciImzasi(): Promise<string> {
  const h = await headers();
  const ham = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? IP_BILINMIYOR;
  return createHash("sha256").update(ham).digest("hex").slice(0, 16);
}

async function kuralUygula(kural: HizSiniriKurali, artir: boolean): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient().rpc("hiz_siniri_kullan", {
      p_anahtar: kural.anahtar,
      p_limit: kural.limit,
      p_pencere_sn: kural.pencereSn,
      p_artir: artir,
    });
    if (error) {
      console.error("hiz_siniri_kullan çağrısı başarısız:", error.message);
      return true;
    }
    return data !== false;
  } catch (e) {
    console.error("hiz_siniri_kullan çağrısı başarısız:", e);
    return true;
  }
}

/** Kuralların hepsini sayar; biri aşılmışsa false. Her çağrı bir hak tüketir. */
export async function hizSiniriTuket(kurallar: HizSiniriKurali[]): Promise<boolean> {
  const sonuclar = await Promise.all(kurallar.map((k) => kuralUygula(k, true)));
  return sonuclar.every(Boolean);
}

/** Sayaç artırmadan yalnız "limit dolmuş mu" bakar. */
export async function hizSiniriAsildiMi(kurallar: HizSiniriKurali[]): Promise<boolean> {
  const sonuclar = await Promise.all(kurallar.map((k) => kuralUygula(k, false)));
  return !sonuclar.every(Boolean);
}

/** Yalnız sayaç artırır (başarısız deneme kaydı için). */
export async function hizSiniriKaydet(kurallar: HizSiniriKurali[]): Promise<void> {
  await Promise.all(kurallar.map((k) => kuralUygula(k, true)));
}

/** Klinik id'yi anahtara KOYMUYORUZ: saldırgan rastgele klinik_id'lerle anahtar uzayını şişiremesin. */
export async function ipAnahtari(onEk: string): Promise<string> {
  return `${onEk}:ip:${await istemciImzasi()}`;
}

export function klinikAnahtari(onEk: string, klinikId: string): string {
  return `${onEk}:klinik:${klinikId}`;
}

export const HIZ_SINIRI_MESAJI = "Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin.";
