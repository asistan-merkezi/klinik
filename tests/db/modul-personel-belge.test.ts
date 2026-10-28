// Personel belgeleri (izin belgesi + kaşe) yetkili sunum route'ları: tenant + rol + sahiplik, path traversal koruması. Gerçek route kodu + gerçek Postgres.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ortamKur, personelKur, hastaKur, superBaglan, tenantBaglami, tenantdaCalistir } from "./yardimci";
import { oturum, oturumAc, oturumKapat } from "./oturum-durumu";
import { rpc, withTenant } from "@/lib/db";

vi.mock("@/lib/auth/oturum", async (orijinal) => ({
  ...(await orijinal<typeof import("@/lib/auth/oturum")>()),
  getSessionContext: async () => oturum.ctx,
}));

import { GET as izinGet } from "@/app/api/personel-belge/izin/[talepId]/route";
import { GET as kaseGet } from "@/app/api/personel-belge/kase/[personelId]/route";

const istek = () => new Request("http://x/");
const izin = (talepId: string) => izinGet(istek(), { params: Promise.resolve({ talepId }) });
const kase = (personelId: string) => kaseGet(istek(), { params: Promise.resolve({ personelId }) });

let B: string; // test kliniği
let K2: Record<string, string>;
let kok: string;
let admin: string, muhasebe: string, resepsiyon: string, sahip: string, diger: string, admin2: string;
let PSAHIP: string, PDIGER: string, TALEP: string;
const PDF = Buffer.from("%PDF-1.4 izin belgesi icerigi");
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("kase")]);

async function sql<T = Record<string, unknown>>(q: string, p: unknown[] = []): Promise<T[]> {
  const c = await superBaglan();
  try {
    return (await c.query(q, p)).rows as T[];
  } finally {
    await c.end();
  }
}
const as = (userId: string, klinikId: string, rol: "klinik_admin" | "muhasebe" | "resepsiyon" | "terapist") => oturumAc({ userId, klinikId, rol });

beforeAll(async () => {
  const o = ortamKur();
  K2 = o.ids.k2;
  kok = mkdtempSync(join(tmpdir(), "dosya-"));
  process.env.DOSYA_KOKU = kok;
  B = randomUUID();
  await tenantdaCalistir(B, (c) => c.query("insert into klinik(id, ad, qr_kisa_kod) values ($1, 'belge-deneme', 'belgedeneme')", [B]));
  admin = (await personelKur({ klinikId: B, rol: "klinik_admin" })).id;
  muhasebe = (await personelKur({ klinikId: B, rol: "muhasebe" })).id;
  resepsiyon = (await personelKur({ klinikId: B, rol: "resepsiyon" })).id;
  sahip = (await personelKur({ klinikId: B, rol: "terapist" })).id;
  diger = (await personelKur({ klinikId: B, rol: "terapist" })).id;
  admin2 = (await personelKur({ klinikId: K2.klinik, rol: "klinik_admin" })).id;
  [PSAHIP, PDIGER] = [randomUUID(), randomUUID()];
  for (const [p, k, ad] of [[PSAHIP, sahip, "Sahip"], [PDIGER, diger, "Diger"]] as const) {
    await tenantdaCalistir(B, (c) => c.query("insert into personel(id, klinik_id, kullanici_id, ad_soyad, gorev) values ($1,$2,$3,$4,'Fizyoterapist')", [p, B, k, ad]));
  }
  // İzin talebi (sahibi: PSAHIP) + diskte belge
  const yol = `${B}/izin/${PSAHIP}/1700000000000.pdf`;
  mkdirSync(join(kok, "personel-belge", B, "izin", PSAHIP), { recursive: true });
  writeFileSync(join(kok, "personel-belge", B, "izin", PSAHIP, "1700000000000.pdf"), PDF);
  const r = await withTenant(tenantBaglami({ klinik: B, kullanici: sahip }), (t) =>
    rpc<{ personel_izin_talep_olustur: string }>(t, "personel_izin_talep_olustur", { p_personel_id: PSAHIP, p_tip: "mazeret", p_baslangic_tarih: "2026-12-01", p_bitis_tarih: "2026-12-02", p_gerekce: null, p_belge_url: yol })
  );
  TALEP = r[0].personel_izin_talep_olustur;
  // Kaşe (yalnız PSAHIP için)
  mkdirSync(join(kok, "personel-belge", B, PSAHIP), { recursive: true });
  writeFileSync(join(kok, "personel-belge", B, PSAHIP, "kase.png"), PNG);
  await tenantdaCalistir(B, (c) => c.query("insert into personel_mesleki_belge(personel_id, kase_gorsel_url) values ($1,$2)", [PSAHIP, `${B}/${PSAHIP}/kase.png`]));
  // Klinik dışı dosya: path traversal denemesinin okumaya çalışacağı hedef
  writeFileSync(join(kok, "gizli.txt"), "KLINIK-DISI-GIZLI");
});
afterAll(() => {
  rmSync(kok, { recursive: true, force: true });
  delete process.env.DOSYA_KOKU;
});

describe("izin belgesi", () => {
  it("oturumsuz 401; hasta ve geçici şifreli oturum 403", async () => {
    oturumKapat();
    expect((await izin(TALEP)).status).toBe(401);
    const h = await hastaKur({ klinikId: B });
    oturumAc({ userId: h.kullaniciId, klinikId: B, rol: "hasta", hastaId: h.hastaId });
    expect((await izin(TALEP)).status).toBe(403);
    as(admin, B, "klinik_admin");
    oturum.ctx!.sifreDegistirmeli = true;
    expect((await izin(TALEP)).status).toBe(403);
  });

  it("talebin sahibi ve klinik yöneticisi belgeyi görür (doğru tür + güvenlik başlıkları); resepsiyon, muhasebe ve başka terapist göremez", async () => {
    for (const [kim, rol] of [[sahip, "terapist"], [admin, "klinik_admin"]] as const) {
      as(kim, B, rol);
      const y = await izin(TALEP);
      expect(y.status, rol).toBe(200);
      expect(y.headers.get("content-type")).toBe("application/pdf");
      expect(y.headers.get("x-content-type-options")).toBe("nosniff");
      expect(y.headers.get("cache-control")).toBe("private, no-store");
      expect(y.headers.get("content-security-policy")).toContain("sandbox");
      expect(Buffer.from(await y.arrayBuffer()).equals(PDF)).toBe(true);
    }
    // Yetkisiz roller: ya kod kuralı (403) ya da RLS satırı hiç göstermez (404) — hiçbirinde içerik dönmez.
    for (const [kim, rol] of [[resepsiyon, "resepsiyon"], [diger, "terapist"], [muhasebe, "muhasebe"]] as const) {
      as(kim, B, rol);
      const y = await izin(TALEP);
      expect([403, 404], rol).toContain(y.status);
      expect(Buffer.from(await y.arrayBuffer()).equals(PDF)).toBe(false);
    }
  });

  it("başka kliniğin kullanıcısı erişemez (404: varlık sızdırılmaz); geçersiz kimlik 404", async () => {
    as(admin2, K2.klinik, "klinik_admin");
    expect((await izin(TALEP)).status).toBe(404);
    as(admin, B, "klinik_admin");
    expect((await izin("../../etc/passwd")).status).toBe(404);
    expect((await izin(randomUUID())).status).toBe(404);
  });

  it("veritabanındaki yol bozuk/kötü niyetli olsa bile dosya sistemi okunmaz (path traversal, başka tenant, başka kişi)", async () => {
    as(admin, B, "klinik_admin");
    const kotu = [
      `${B}/izin/${PSAHIP}/../../../gizli.txt`,
      `../gizli.txt`,
      `${randomUUID()}/izin/${PSAHIP}/1700000000000.pdf`, // başka tenant'a işaret eder
      `${B}/izin/${PDIGER}/1700000000000.pdf`, // başka kişiye işaret eder
      `${B}/izin/${PSAHIP}/..%2f..%2fgizli.txt`,
      `/${B}/izin/${PSAHIP}/1700000000000.pdf`,
      `${B}\\izin\\${PSAHIP}\\1700000000000.pdf`,
    ];
    for (const yol of kotu) {
      await sql("update personel_izin_talebi set belge_url = $2 where id = $1", [TALEP, yol]);
      const y = await izin(TALEP);
      expect(y.status, yol).toBe(404);
      expect(await y.text(), yol).not.toContain("KLINIK-DISI-GIZLI");
    }
    await sql("update personel_izin_talebi set belge_url = $2 where id = $1", [TALEP, `${B}/izin/${PSAHIP}/1700000000000.pdf`]);
    expect((await izin(TALEP)).status).toBe(200);
    await sql("update personel_izin_talebi set belge_url = null where id = $1", [TALEP]);
    expect((await izin(TALEP)).status).toBe(404);
    await sql("update personel_izin_talebi set belge_url = $2 where id = $1", [TALEP, `${B}/izin/${PSAHIP}/1700000000000.pdf`]);
  });
});

describe("kaşe görseli: YALNIZ klinik yöneticisi", () => {
  it("yönetici görür; muhasebe, resepsiyon, sahibi terapist ve hasta GÖREMEZ", async () => {
    as(admin, B, "klinik_admin");
    const y = await kase(PSAHIP);
    expect(y.status).toBe(200);
    expect(y.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await y.arrayBuffer()).equals(PNG)).toBe(true);
    for (const [kim, rol] of [[muhasebe, "muhasebe"], [resepsiyon, "resepsiyon"], [sahip, "terapist"]] as const) {
      as(kim, B, rol);
      expect((await kase(PSAHIP)).status, rol).toBe(403);
    }
    const h = await hastaKur({ klinikId: B });
    oturumAc({ userId: h.kullaniciId, klinikId: B, rol: "hasta", hastaId: h.hastaId });
    expect((await kase(PSAHIP)).status).toBe(403);
    oturumKapat();
    expect((await kase(PSAHIP)).status).toBe(401);
  });

  it("başka kliniğin yöneticisi erişemez; kaşesi olmayan personel ve bozuk yol 404", async () => {
    as(admin2, K2.klinik, "klinik_admin");
    expect((await kase(PSAHIP)).status).toBe(404);
    as(admin, B, "klinik_admin");
    expect((await kase(PDIGER)).status).toBe(404);
    expect((await kase("../x")).status).toBe(404);
    for (const yol of [`${B}/${PSAHIP}/../../gizli.txt`, `${B}/${PDIGER}/kase.png`, `${randomUUID()}/${PSAHIP}/kase.png`, `${B}/${PSAHIP}/kase.png.exe`]) {
      await sql("update personel_mesleki_belge set kase_gorsel_url = $2 where personel_id = $1", [PSAHIP, yol]);
      const y = await kase(PSAHIP);
      expect(y.status, yol).toBe(404);
      expect(await y.text()).not.toContain("KLINIK-DISI-GIZLI");
    }
  });
});
