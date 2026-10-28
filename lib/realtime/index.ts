// Süreç başına tekil dağıtıcı + dinleyici (Next dev HMR'ında çoğalmasın diye globalThis'te tutulur).
import { baglantiAdresi } from "@/lib/db/ortam";
import { Dagitici } from "./dagitici";
import { PgDinleyici } from "./dinleyici";

const ANAHTAR = Symbol.for("klinik.canli.tekil");
const PING_MS = 25_000;
const KULLANICI_BASINA_BAGLANTI = 5;

type Tekil = { dagitici: Dagitici; dinleyici: PgDinleyici };

/** İlk çağrıda dinleyiciyi başlatır (tembel: yalnız biri SSE'ye bağlandığında Postgres bağlantısı açılır). */
export function canliTekil(): Tekil {
  const g = globalThis as unknown as Record<symbol, Tekil | undefined>;
  let t = g[ANAHTAR];
  if (!t) {
    const dagitici = new Dagitici(KULLANICI_BASINA_BAGLANTI);
    const dinleyici = new PgDinleyici(dagitici, { baglantiAdresi: baglantiAdresi("DATABASE_URL") });
    const ping = setInterval(() => dagitici.ping(), PING_MS);
    ping.unref?.();
    t = g[ANAHTAR] = { dagitici, dinleyici };
  }
  t.dinleyici.baslat();
  return t;
}

export { Dagitici, type AboneMesaji } from "./dagitici";
export { PgDinleyici } from "./dinleyici";
export * from "./olay";
export { sseYaniti, SSE_BASLIKLARI, SSE_OMUR_MS, OTURUM_BITTI_OLAYI } from "./sse";
