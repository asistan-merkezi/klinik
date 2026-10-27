// Server action testlerinde "oturum açmış kullanıcı"yı temsil eder. Gerçek eylemler (app/**/actions.ts) Next istek bağlamı (headers/cookies) ister;
// testlerde yalnız OTURUM ÇÖZÜMÜ (lib/auth/yetki, gecerli-kullanici) taklit edilir — eylemlerin kendisi, Drizzle sorguları, RPC'ler ve RLS GERÇEKTİR.
import type { OturumBaglami, OturumRolu } from "@/lib/auth/oturum";

export const oturum: { ctx: OturumBaglami | null } = { ctx: null };

export function oturumAc(g: { userId: string; klinikId: string | null; rol: OturumRolu; hastaId?: string | null }): void {
  const hasta = g.rol === "hasta";
  oturum.ctx = {
    userId: g.userId,
    tenantId: g.klinikId,
    rol: g.rol,
    tur: hasta ? "hasta" : "personel",
    hastaId: g.hastaId ?? null,
    adSoyad: "Test Kullanıcı",
    eposta: "test@deneme.test",
    sifreDegistirmeli: false,
    cihazKimligi: null,
  };
}
export const oturumKapat = () => {
  oturum.ctx = null;
};

/** `after()` ile başlatılan arka plan işlerinin bitmesini bekler (mesaj kuyruğu vb.). */
export async function sonrasiniBekle(): Promise<void> {
  const liste = (globalThis as { __afterIsleri?: Promise<unknown>[] }).__afterIsleri ?? [];
  while (liste.length) await Promise.allSettled(liste.splice(0));
}
