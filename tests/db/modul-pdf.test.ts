// PDF route'ları: kimlik/rol/tenant kapısı (gerçek route kodu + gerçek Postgres + gerçek Chrome). Başka kliniğin kaydı için PDF üretilemez.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { ortamKur, personelKur, hastaKur, superBaglan } from "./yardimci";
import { oturum, oturumAc, oturumKapat } from "./oturum-durumu";
import { chromiumVarMi } from "@/lib/pdf/browser";

// Route'lar getSessionContext(headers) çağırır (Better Auth oturumu); testte oturum çözümü taklit edilir, geri kalan her şey GERÇEKTİR.
vi.mock("@/lib/auth/oturum", async (orijinal) => ({
  ...(await orijinal<typeof import("@/lib/auth/oturum")>()),
  getSessionContext: async () => oturum.ctx,
}));

import { GET as cariGet } from "@/app/api/hasta-cari-hareketler/pdf/route";
import { GET as kayitGet } from "@/app/api/hasta-kayit-formu/pdf/route";
import { GET as basvuruGet } from "@/app/api/is-basvuru-formu/pdf/route";

let K1: Record<string, string>, K2: Record<string, string>;
let admin1: string, resepsiyon1: string, terapist1: string, muhasebe1: string, sa: string;
const istek = (yol: string) => new Request(`http://x${yol}`);
const chrome = chromiumVarMi();

beforeAll(async () => {
  const o = ortamKur();
  K1 = o.ids.k1;
  K2 = o.ids.k2;
  admin1 = K1.kullanici;
  resepsiyon1 = (await personelKur({ klinikId: K1.klinik, rol: "resepsiyon" })).id;
  terapist1 = (await personelKur({ klinikId: K1.klinik, rol: "terapist" })).id;
  muhasebe1 = (await personelKur({ klinikId: K1.klinik, rol: "muhasebe" })).id;
  sa = randomUUID();
  const s = await superBaglan();
  try {
    await s.query("insert into kimlik_kullanici(id, eposta) values ($1, $2)", [sa, `sa-${sa}@deneme.test`]);
    await s.query("insert into kullanici(id, klinik_id, rol, ad_soyad) values ($1, null, 'super_admin', 'SA')", [sa]);
  } finally {
    await s.end();
  }
});

describe("PDF route kapısı", () => {
  it("oturum yok → 401; hasta oturumu → 403; geçici şifreli oturum → 403; üç route için de", async () => {
    oturumKapat();
    for (const r of [() => kayitGet(istek("/")), () => basvuruGet(istek("/")), () => cariGet(istek(`/?hastaId=${K1.hasta}`))]) expect((await r()).status).toBe(401);
    const h = await hastaKur({ klinikId: K1.klinik });
    oturumAc({ userId: h.kullaniciId, klinikId: K1.klinik, rol: "hasta", hastaId: h.hastaId });
    for (const r of [() => kayitGet(istek("/")), () => basvuruGet(istek("/")), () => cariGet(istek(`/?hastaId=${K1.hasta}`))]) expect((await r()).status).toBe(403);
    oturumAc({ userId: admin1, klinikId: K1.klinik, rol: "klinik_admin" });
    oturum.ctx!.sifreDegistirmeli = true;
    expect((await kayitGet(istek("/"))).status).toBe(403);
  });

  it("cari döküm finans verisidir: terapist 403; super_admin KLİNİK BAĞLAMI (destek) olmadan 403", async () => {
    oturumAc({ userId: terapist1, klinikId: K1.klinik, rol: "terapist" });
    expect((await cariGet(istek(`/?hastaId=${K1.hasta}`))).status).toBe(403);
    oturumAc({ userId: sa, klinikId: null, rol: "super_admin" });
    expect((await kayitGet(istek("/"))).status).toBe(403);
    expect((await cariGet(istek(`/?hastaId=${K1.hasta}`))).status).toBe(403);
  });

  it("hastaId geçersiz → 400; olmayan hasta → 404; BAŞKA KLİNİĞİN hastası → 404 (PDF üretilmez, Chrome hiç başlamaz)", async () => {
    oturumAc({ userId: admin1, klinikId: K1.klinik, rol: "klinik_admin" });
    expect((await cariGet(istek("/?hastaId=../../etc/passwd"))).status).toBe(400);
    expect((await cariGet(istek("/"))).status).toBe(400);
    expect((await cariGet(istek(`/?hastaId=${randomUUID()}`))).status).toBe(404);
    const baska = await cariGet(istek(`/?hastaId=${K2.hasta}`)); // K1 yöneticisi, K2'nin gerçek hastası
    expect(baska.status).toBe(404);
    expect(baska.headers.get("content-type")).not.toMatch(/pdf/);
    expect(await baska.json()).toEqual({ error: "Hasta bulunamadı." });
  });
});

describe.skipIf(!chrome)("PDF üretimi (gerçek Chrome)", () => {
  it("yetkili roller kendi kliniğinin PDF'ini alır: application/pdf, indirme başlığı, önbelleksiz", async () => {
    for (const [id, rol] of [[admin1, "klinik_admin"], [resepsiyon1, "resepsiyon"], [muhasebe1, "muhasebe"]] as const) {
      oturumAc({ userId: id, klinikId: K1.klinik, rol });
      const r = await cariGet(istek(`/?hastaId=${K1.hasta}`));
      expect(r.status, rol).toBe(200);
      expect(r.headers.get("content-type")).toBe("application/pdf");
      expect(r.headers.get("content-disposition")).toContain("cari-hareketler.pdf");
      expect(r.headers.get("cache-control")).toBe("private, no-store");
      expect(Buffer.from(await r.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
    }
    oturumAc({ userId: terapist1, klinikId: K1.klinik, rol: "terapist" });
    expect((await kayitGet(istek("/"))).status).toBe(200); // boş form: tüm personel
    expect((await basvuruGet(istek("/"))).status).toBe(200);
  }, 180_000);

  it("destek bağlamındaki super_admin yalnız bağlam kliniğinin hastası için PDF alır; başka klinik 404", async () => {
    const s = await superBaglan();
    try {
      await s.query("insert into destek_baglami(kullanici_id, klinik_id, gerekce, bitis) values ($1, $2, 'pdf destek testi', now() + interval '10 minutes')", [sa, K1.klinik]);
    } finally {
      await s.end();
    }
    oturumAc({ userId: sa, klinikId: K1.klinik, rol: "super_admin" });
    expect((await cariGet(istek(`/?hastaId=${K1.hasta}`))).status).toBe(200);
    expect((await cariGet(istek(`/?hastaId=${K2.hasta}`))).status).toBe(404);
  }, 120_000);
});
