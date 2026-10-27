// vitest.db.config.ts setupFiles: Next'e özgü çağrıları ve OTURUM ÇÖZÜMÜNÜ taklit eder (bkz. oturum-durumu.ts). Her test dosyasında otomatik geçerlidir.
import { vi } from "vitest";
import { tenantBaglami } from "./yardimci";
import { oturum } from "./oturum-durumu";

export const beklemedekiler: Promise<unknown>[] = [];

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn() }));
vi.mock("next/server", async (orijinal) => ({
  ...(await orijinal<typeof import("next/server")>()),
  // after(): isteğin sonrasında çalışacak iş — testte hemen başlatılır, `sonrasiniBekle()` ile beklenir.
  after: (fn: () => unknown) => {
    (globalThis as { __afterIsleri?: Promise<unknown>[] }).__afterIsleri ??= [];
    (globalThis as { __afterIsleri: Promise<unknown>[] }).__afterIsleri.push(Promise.resolve().then(fn));
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (yol: string) => {
    throw new Error(`NEXT_REDIRECT:${yol}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

function kapi(roller: readonly string[]) {
  const c = oturum.ctx;
  if (!c) throw new Error("NEXT_REDIRECT:/giris");
  const yetkili = c.tur === "personel" && (c.rol === "super_admin" || roller.includes(c.rol));
  return { ctx: c, yetkili, klinikId: c.tenantId, bag: c.tenantId ? tenantBaglami({ klinik: c.tenantId, kullanici: c.userId }) : null };
}

vi.mock("@/lib/auth/yetki", async (orijinal) => ({
  ...(await orijinal<typeof import("@/lib/auth/yetki")>()),
  eylemYetkisi: async (roller: readonly string[]) => kapi(roller),
  panelBaglami: async () => {
    const k = kapi([]);
    if (k.ctx.tur !== "personel" || !k.bag) throw new Error("NEXT_REDIRECT:/giris");
    return { ctx: k.ctx, bag: k.bag };
  },
}));
vi.mock("@/lib/auth/gecerli-kullanici", async (orijinal) => ({
  ...(await orijinal<typeof import("@/lib/auth/gecerli-kullanici")>()),
  oturumBaglami: async () => oturum.ctx,
}));
