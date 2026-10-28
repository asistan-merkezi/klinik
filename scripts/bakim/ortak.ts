// Bakım betiklerinin ortak iskeleti. Her betik bir `calistir(ad, is)` çağrısıdır:
//   - günlük: JSON satırları stdout'a (ve BAKIM_LOG_KLASORU doluysa <klasör>/<ad>.log dosyasına) yazılır; gizli değer/kişisel veri YAZILMAZ,
//   - çıkış kodu: 0 = tamam · 1 = bazı klinikler/kayıtlar hata verdi (diğerleri işlendi) · 2 = betik hiç çalışamadı (yapılandırma/bağlantı/beklenmeyen hata),
//   - HTTP route ve CRON_SECRET YOKTUR: betikler Windows Task Scheduler'dan, bakim.env değişkenleriyle çalışır (docs/sunucu-kurulum.md).
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export type IsSonucu = { ozet: Record<string, unknown>; hataSayisi: number };

export function gunlukYaz(ad: string, seviye: "bilgi" | "uyari" | "hata", mesaj: string, ek: Record<string, unknown> = {}): void {
  const satir = JSON.stringify({ zaman: new Date().toISOString(), is: ad, seviye, mesaj, ...ek });
  (seviye === "hata" ? process.stderr : process.stdout).write(satir + "\n");
  const klasor = process.env.BAKIM_LOG_KLASORU;
  if (klasor) {
    try {
      mkdirSync(klasor, { recursive: true });
      appendFileSync(join(klasor, `${ad}.log`), satir + "\n");
    } catch {
      /* günlük dosyası yazılamıyorsa stdout yeterli; işi bozma */
    }
  }
}

/** Betiği çalıştırır, özetini günlüğe yazar ve process.exitCode'u ayarlar. Havuzları işin kendisi kapatır. */
export async function calistir(ad: string, is: () => Promise<IsSonucu>): Promise<number> {
  gunlukYaz(ad, "bilgi", "başladı");
  try {
    const { ozet, hataSayisi } = await is();
    gunlukYaz(ad, hataSayisi > 0 ? "uyari" : "bilgi", hataSayisi > 0 ? "bitti (hatalarla)" : "bitti", { ...ozet, hataSayisi });
    process.exitCode = hataSayisi > 0 ? 1 : 0;
  } catch (e) {
    gunlukYaz(ad, "hata", "betik çalışamadı", { hata: e instanceof Error ? e.message : String(e) });
    process.exitCode = 2;
  }
  return process.exitCode ?? 0;
}
