// Mali yazma işlemlerinde çift gönderim koruması (migration 0012). `tx` ledger yazımıyla AYNI transaction olmalıdır: anahtar ve yazım birlikte
// kaydedilir/geri alınır. Anahtar yoksa (eski istemci) koruma uygulanmaz — işlem normal akar.
import { sql } from "drizzle-orm";
import type { Tx } from "@/lib/db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** FormData'dan `islem_anahtari` alanını okur; geçersizse null. */
export function islemAnahtariniOku(formData: FormData): string | null {
  const v = formData.get("islem_anahtari");
  return typeof v === "string" && UUID.test(v) ? v : null;
}

/**
 * Anahtarı bu klinik için ilk kez kaydeder. true → işlem YENİ, devam et; false → aynı anahtar daha önce işlendi, YAZMADAN başarıyla dön.
 * Eşzamanlı iki istek: PK çakışmasında ikincisi birincinin commit'ini bekler ve false alır.
 */
export async function islemAnahtariniKaydet(tx: Tx, klinikId: string, anahtar: string | null, islem: string, kullaniciId: string): Promise<boolean> {
  if (!anahtar) return true;
  const r = await tx.execute(
    sql`insert into islem_anahtari (klinik_id, anahtar, islem, kullanici_id) values (${klinikId}, ${anahtar}, ${islem}, ${kullaniciId}) on conflict do nothing returning 1 as yeni`
  );
  return r.rows.length > 0;
}
