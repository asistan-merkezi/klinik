// vitest globalSetup: iki klinikli test kümesini bir kez kurar; bağlantı bilgilerini testlere `provide` ile iletir.
import type { TestProject } from "vitest/node";

type Duzenek = { kume: { port: number }; ids: Record<string, Record<string, string>>; durdur: () => Promise<void> };
let duzenek: Duzenek | undefined;

declare module "vitest" {
  export interface ProvidedContext {
    dbPort: number;
    dbIds: Record<string, Record<string, string>>;
  }
}

export default async function kur(project: TestProject) {
  const { testKumesiKur } = (await import("../../scripts/dev/test-kur.mjs")) as unknown as { testKumesiKur: () => Promise<Duzenek> };
  duzenek = await testKumesiKur();
  project.provide("dbPort", duzenek.kume.port);
  project.provide("dbIds", duzenek.ids);
  return async () => {
    await duzenek?.durdur();
  };
}
