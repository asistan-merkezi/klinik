// Modül 6 — destek & yönetim: destek bağlamı (super_admin), audit_log görünürlüğü ve hassas alan temizliği, gelmeme analizi (RLS altında performans),
// talep/şikayetler. Gerçek eylem kodu + gerçek Postgres (FORCE RLS). Performans testleri 100k satırlık fixture ile EXPLAIN eder.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { ortamKur, personelKur, superBaglan, tenantBaglami, duzenekOlustur, tenantdaCalistir } from "./yardimci";
import { oturumAc } from "./oturum-durumu";
import { pgHata, rpc, sema, withKullanici, withTenant } from "@/lib/db";
import { kullaniciBaglamiUret } from "@/lib/db/baglam-uretici";
import { YETKISIZ_MESAJI } from "@/lib/auth/yetki";
import { destekBaglamiAc, destekBaglamiKapat } from "@/app/(app)/panel/yonetim/destek-baglami/actions";
import { talepDurumGuncelle, talepOlustur } from "@/app/(app)/panel/destek/talep-sikayetler/actions";
import { denetimSayfasiGetir, denetimSorgusuKur, DENETIM_SAYFA_BOYUTU } from "@/lib/denetim/sorgu";
import { denetimOzetiOlustur } from "@/lib/denetim/gorunum";

let K1: Record<string, string>, K2: Record<string, string>;
const PERF_KLINIKLER: string[] = [];
let RANDEVU_ONCEKI: string[] = [];
let ADMIN1: string, ADMIN2: string, RESEP1: string, TERAPIST1: string, MUHASEBE1: string, SA: string;
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
async function sql<T = Record<string, unknown>>(q: string, p: unknown[] = []): Promise<T[]> {
  const c = await superBaglan();
  try {
    return (await c.query(q, p)).rows as T[];
  } finally {
    await c.end();
  }
}
const bag = (klinik: string, kullanici: string) => tenantBaglami({ klinik, kullanici });
async function yonlendirme(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "";
  } catch (e) {
    return (e as Error).message;
  }
}

beforeAll(async () => {
  const o = ortamKur();
  K1 = o.ids.k1;
  K2 = o.ids.k2;
  ADMIN1 = K1.kullanici;
  ADMIN2 = K2.kullanici;
  RESEP1 = (await personelKur({ klinikId: K1.klinik, rol: "resepsiyon" })).id;
  TERAPIST1 = (await personelKur({ klinikId: K1.klinik, rol: "terapist" })).id;
  MUHASEBE1 = (await personelKur({ klinikId: K1.klinik, rol: "muhasebe" })).id;
  SA = randomUUID();
  const s = await superBaglan();
  try {
    await s.query("insert into kimlik_kullanici(id, eposta) values ($1, $2)", [SA, `sa-${SA}@deneme.test`]);
    await s.query("insert into kullanici(id, klinik_id, rol, ad_soyad) values ($1, null, 'super_admin', 'Destek Yetkilisi')", [SA]);
  } finally {
    await s.end();
  }
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
describe("destek bağlamı (super_admin yüzeyi)", () => {
  it("klinik_admin ve diğer roller eylemi VE veritabanı fonksiyonunu kullanamaz", async () => {
    for (const [id, rol, klinik] of [[ADMIN1, "klinik_admin", K1.klinik], [RESEP1, "resepsiyon", K1.klinik], [TERAPIST1, "terapist", K1.klinik], [MUHASEBE1, "muhasebe", K1.klinik]] as const) {
      oturumAc({ userId: id, klinikId: klinik, rol });
      const r = await destekBaglamiAc(null, fd({ klinik_id: K2.klinik, gerekce: "yetkisiz deneme gerekçesi", dakika: "30" }));
      expect(r?.success, rol).toBe(false);
      expect(r?.message, rol).toBe(YETKISIZ_MESAJI);
      await expect(withKullanici(kullaniciBaglamiUret(id), (t) => rpc(t, "destek_baglami_ac", { p_klinik_id: K2.klinik, p_gerekce: "yetkisiz deneme gerekçesi", p_dakika: 30 })), rol).rejects.toThrow();
    }
    expect(await sql("select 1 from destek_baglami where klinik_id = $1", [K2.klinik])).toHaveLength(0);
  });

  it("geçersiz girdiler reddedilir: kısa gerekçe, süre sınırı aşımı, olmayan klinik", async () => {
    oturumAc({ userId: SA, klinikId: null, rol: "super_admin" });
    expect((await destekBaglamiAc(null, fd({ klinik_id: K1.klinik, gerekce: "kısa", dakika: "30" })))?.message).toMatch(/en az 10/);
    expect((await destekBaglamiAc(null, fd({ klinik_id: K1.klinik, gerekce: "yeterince uzun gerekçe", dakika: "500" })))?.message).toBe("Süre geçersiz.");
    expect((await destekBaglamiAc(null, fd({ klinik_id: randomUUID(), gerekce: "yeterince uzun gerekçe", dakika: "30" })))?.message).toBe("Klinik bulunamadı.");
    // DB doğrudan: 120 dk üstü reddedilir
    const dbHata = await withKullanici(kullaniciBaglamiUret(SA), (t) => rpc(t, "destek_baglami_ac", { p_klinik_id: K1.klinik, p_gerekce: "yeterince uzun gerekçe", p_dakika: 121 })).then(() => "", (e) => pgHata(e).mesaj);
    expect(dbHata).toMatch(/sure_gecersiz/);
    expect(await sql("select 1 from destek_baglami where kullanici_id = $1", [SA])).toHaveLength(0);
  });

  it("açma: kayıt + denetim satırı yazılır, süre ≤ 120 dk; klinik_admin kendi denetim geçmişinde görür; aynı anda tek aktif bağlam", async () => {
    oturumAc({ userId: SA, klinikId: null, rol: "super_admin" });
    expect(await yonlendirme(destekBaglamiAc(null, fd({ klinik_id: K1.klinik, gerekce: "Randevu çizelgesi hatası incelemesi", dakika: "30" })))).toBe("NEXT_REDIRECT:/panel");
    const b = await sql<{ klinik_id: string; dk: number; kapatildi: string | null }>("select klinik_id, round(extract(epoch from (bitis - baslangic)) / 60)::int dk, kapatildi from destek_baglami where kullanici_id = $1", [SA]);
    expect(b).toEqual([{ klinik_id: K1.klinik, dk: 30, kapatildi: null }]);

    const denetim = await withTenant(bag(K1.klinik, ADMIN1), (t) => denetimSayfasiGetir(t, { klinikId: K1.klinik, gun: 7, grup: "hepsi", eylem: "destek", sayfa: 1 }));
    expect(denetim.satirlar).toHaveLength(1);
    expect(denetim.satirlar[0].eylem).toBe("destek_baglami_ac");
    expect(denetim.satirlar[0].kullanici).toBeNull(); // super_admin kaydı klinik kullanıcı listesinde yok → arayüz "Destek yetkilisi (platform)" yazar
    expect(denetimOzetiOlustur(denetim.satirlar[0]).satirlar.find((x) => x.alan === "gerekce")?.yeni).toBe("Randevu çizelgesi hatası incelemesi");

    // ikinci açılış öncekini kapatır (tek aktif)
    expect(await yonlendirme(destekBaglamiAc(null, fd({ klinik_id: K2.klinik, gerekce: "ikinci klinik incelemesi", dakika: "15" })))).toBe("NEXT_REDIRECT:/panel");
    expect(await sql("select klinik_id from destek_baglami where kullanici_id = $1 and kapatildi is null", [SA])).toEqual([{ klinik_id: K2.klinik }]);
  });

  it("bağlamdaki super_admin YALNIZ o kliniğin verisini görür; süresi dolunca/kapatılınca veritabanı erişimi keser", async () => {
    // şu an aktif bağlam: K2 (önceki testten)
    const k1denetim = await withTenant(bag(K1.klinik, SA), (t) => t.select({ id: sema.auditLog.id }).from(sema.auditLog));
    expect(k1denetim, "bağlam K2 iken K1 tenant'ı reddedilir").toHaveLength(0);
    const hastalarK1 = await withTenant(bag(K1.klinik, SA), (t) => t.select({ id: sema.hasta.id }).from(sema.hasta));
    expect(hastalarK1).toHaveLength(0);

    const k2denetim = await withTenant(bag(K2.klinik, SA), (t) => t.select({ klinik: sema.auditLog.klinikId, eylem: sema.auditLog.eylem }).from(sema.auditLog));
    expect(k2denetim.length).toBeGreaterThan(0);
    expect(new Set(k2denetim.map((x) => x.klinik))).toEqual(new Set([K2.klinik]));
    expect((await withTenant(bag(K2.klinik, SA), (t) => t.select({ id: sema.hasta.id }).from(sema.hasta))).length).toBeGreaterThan(0);

    // aktif bağlam sorgusu yalnız kendi kaydını döndürür; başka kullanıcı için boş
    const aktif = await withKullanici(kullaniciBaglamiUret(SA), (t) => rpc<{ klinik_id: string }>(t, "destek_baglami_aktif", {}));
    expect(aktif.map((x) => x.klinik_id)).toEqual([K2.klinik]);
    expect(await withKullanici(kullaniciBaglamiUret(ADMIN2), (t) => rpc(t, "destek_baglami_aktif", {}))).toEqual([]);

    // süre doldu → DB düzeyinde erişim kesilir (uygulama bir şey yapmasa bile)
    await sql("update destek_baglami set baslangic = now() - interval '2 hours', bitis = now() - interval '1 hour' where kullanici_id = $1", [SA]);
    expect(await withTenant(bag(K2.klinik, SA), (t) => t.select({ id: sema.hasta.id }).from(sema.hasta))).toHaveLength(0);
    expect(await withKullanici(kullaniciBaglamiUret(SA), (t) => rpc(t, "destek_baglami_aktif", {}))).toEqual([]);
  });

  it("kapatma: denetim satırı yazılır, bağlam biter; bağlamsız super_admin kapatma çağrısı zararsız", async () => {
    oturumAc({ userId: SA, klinikId: null, rol: "super_admin" });
    expect(await yonlendirme(destekBaglamiAc(null, fd({ klinik_id: K1.klinik, gerekce: "kapatma denemesi için bağlam", dakika: "15" })))).toBe("NEXT_REDIRECT:/panel");
    expect((await withTenant(bag(K1.klinik, SA), (t) => t.select({ id: sema.hasta.id }).from(sema.hasta))).length).toBeGreaterThan(0);
    expect(await yonlendirme(destekBaglamiKapat())).toBe("NEXT_REDIRECT:/panel/yonetim/destek-baglami");
    expect(await withTenant(bag(K1.klinik, SA), (t) => t.select({ id: sema.hasta.id }).from(sema.hasta))).toHaveLength(0);
    const kayitlar = await sql<{ eylem: string }>("select eylem from audit_log where klinik_id = $1 and hedef_tablo = 'klinik' and kullanici_id = $2 order by created_at", [K1.klinik, SA]);
    expect(kayitlar.map((x) => x.eylem)).toEqual(["destek_baglami_ac", "destek_baglami_ac", "destek_baglami_kapat"]);
    expect(await yonlendirme(destekBaglamiKapat())).toBe("NEXT_REDIRECT:/panel/yonetim/destek-baglami"); // açık bağlam yok: hata yok
    oturumAc({ userId: ADMIN1, klinikId: K1.klinik, rol: "klinik_admin" });
    await destekBaglamiKapat(); // klinik_admin: sessizce hiçbir şey yapmaz (super_admin değil)
  });

  it("klinik OLUŞTURMA web yüzeyinde yok: uygulama rolü klinik INSERT yapamaz (super_admin dahil); kodda klinik INSERT yok", async () => {
    await sql("insert into destek_baglami(kullanici_id, klinik_id, gerekce, bitis) values ($1, $2, 'klinik olusturma denemesi', now() + interval '10 minutes')", [SA, K1.klinik]);
    const hata = await withTenant(bag(K1.klinik, SA), (t) => t.insert(sema.klinik).values({ id: randomUUID(), ad: "Kaçak Klinik", qrKisaKod: "kacak-klinik" })).then(() => "", (e) => pgHata(e).mesaj);
    expect(hata).toMatch(/permission denied/);
    await sql("update destek_baglami set kapatildi = now() where kullanici_id = $1 and kapatildi is null", [SA]);
    // kaynak taraması: uygulama kodunda sema.klinik'e insert yok
    const kok = process.cwd();
    const bulunan: string[] = [];
    const gez = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (["node_modules", ".next", ".git", "tests", "scripts"].includes(e.name)) continue;
        const y = path.join(d, e.name);
        if (e.isDirectory()) gez(y);
        else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) && /insert\(\s*sema\.klinik\s*\)/.test(fs.readFileSync(y, "utf8"))) bulunan.push(y);
      }
    };
    for (const d of ["app", "lib", "components"]) gez(path.join(kok, d));
    expect(bulunan).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
describe("audit_log görünürlüğü ve hassas alan temizliği", () => {
  it("klinik_admin kendi kliniğini görür; başka klinik yöneticisi, resepsiyon, terapist, muhasebe ve bağlamsız super_admin HİÇBİR satır görmez", async () => {
    await sql("insert into audit_log(klinik_id, kullanici_id, eylem, hedef_tablo) values ($1, $2, 'insert', 'hasta')", [K1.klinik, ADMIN1]);
    const sayim = (b: ReturnType<typeof bag>) => withTenant(b, (t) => t.select({ id: sema.auditLog.id }).from(sema.auditLog).where(eq(sema.auditLog.klinikId, K1.klinik)));
    expect((await sayim(bag(K1.klinik, ADMIN1))).length).toBeGreaterThan(0);
    for (const [id, ad] of [[RESEP1, "resepsiyon"], [TERAPIST1, "terapist"], [MUHASEBE1, "muhasebe"]] as const) expect(await sayim(bag(K1.klinik, id)), ad).toHaveLength(0);
    expect(await sayim(bag(K2.klinik, ADMIN2)), "başka klinik yöneticisi").toHaveLength(0);
    // K2 yöneticisi K1 kimliğini taklit etmeye çalışsa bile (tenant bağlamı DB'de kullanıcıdan türer)
    expect(await sayim(bag(K1.klinik, ADMIN2))).toHaveLength(0);
    // bağlamı olmayan super_admin: tenant yok → hiçbir klinik denetimi görünmez (eski "OR is_super_admin()" kaldırıldı)
    expect(await withKullanici(kullaniciBaglamiUret(SA), (t) => t.select({ id: sema.auditLog.id }).from(sema.auditLog))).toHaveLength(0);
    // yazma: tenant dışı klinik adına denetim satırı yazılamaz
    const yaz = await withTenant(bag(K1.klinik, ADMIN1), (t) => t.insert(sema.auditLog).values({ klinikId: K2.klinik, eylem: "sahte", hedefTablo: "hasta" })).then(() => "", (e) => pgHata(e).mesaj);
    expect(yaz).toMatch(/row-level security|permission denied/);
  });

  it("audit_log'a uygulama rolü UPDATE/DELETE yapamaz (ekleme-yalnız)", async () => {
    const hata = await withTenant(bag(K1.klinik, ADMIN1), (t) => t.update(sema.auditLog).set({ eylem: "silindi" }).where(eq(sema.auditLog.klinikId, K1.klinik))).then(() => "", (e) => pgHata(e).mesaj);
    expect(hata).toMatch(/permission denied/);
  });

  it("audit_detay_temizle: maaş, T.C. kimlik, pasaport, IBAN, sağlık notu, parola/jeton DEĞERLERİ (iç içe dahil) yazılırken silinir; masum alanlar kalır", async () => {
    const [{ r }] = await sql<{ r: Record<string, unknown> }>(
      `select audit_detay_temizle($1::jsonb) r`,
      [JSON.stringify({ ad_soyad: "Ayşe", telefon: "5321112233", maas: 30000, tc_kimlik: "12345678901", pasaport_no: "U123", iban: "TR330006100519786457841326", agri_oykusu: "bel fıtığı", ilk_degerlendirme_notu: "özel", iade_istisna_gerekcesi: "arşivden aktarılan ödeme", gerekce: "rapor: grip", sifre: "x", yeni: { maas: 35000, telefon: "5320000000", tc_kimlik_no: "10987654321" }, notlar: null })]
    );
    expect(r).toMatchObject({ ad_soyad: "Ayşe", telefon: "5321112233", iade_istisna_gerekcesi: "arşivden aktarılan ödeme" });
    for (const k of ["maas", "tc_kimlik", "pasaport_no", "iban", "agri_oykusu", "ilk_degerlendirme_notu", "gerekce", "sifre"]) expect(r[k], k).toBe("[gizli]");
    expect(r.yeni).toMatchObject({ maas: "[gizli]", tc_kimlik_no: "[gizli]", telefon: "5320000000" });
    expect(r.notlar).toBeNull();
    expect(JSON.stringify(r)).not.toMatch(/30000|35000|12345678901|10987654321|TR33|fıtığı/);
  });

  it("gerçek tetikleyici yolu: hasta_anamnez (v1) denetim kaydında şikayet/ağrı öyküsü DÜZ METİN saklanmaz", async () => {
    const hasta = K1.hasta;
    await tenantdaCalistir(K1.klinik, (c) =>
      c.query("insert into hasta_anamnez(klinik_id, hasta_id, basvuru_sikayeti, agri_oykusu, ilk_degerlendirme_notu) values ($1, $2, 'sol diz ağrısı şikayeti', 'gece ağrısı var', 'özel not')", [K1.klinik, hasta])
    );
    const [satir] = await sql<{ detay: Record<string, unknown> }>("select detay from audit_log where klinik_id = $1 and hedef_tablo = 'hasta_anamnez' order by created_at desc limit 1", [K1.klinik]);
    expect(satir.detay.basvuru_sikayeti).toBe("[gizli]");
    expect(satir.detay.agri_oykusu).toBe("[gizli]");
    expect(satir.detay.ilk_degerlendirme_notu).toBe("[gizli]");
    expect(JSON.stringify(satir.detay)).not.toMatch(/diz ağrısı|gece ağrısı|özel not/);
    expect(satir.detay.hasta_id).toBe(hasta); // bağlam korunur
  });

  it("gerçek tetikleyici yolu (v2): güncellemede değişen alanlar doğru tespit edilir (ham değerle), hassas değer yazılmaz", async () => {
    await tenantdaCalistir(K1.klinik, (c) => c.query("update hasta set telefon = $2 where id = $1", [K1.hasta, "5559998877"]));
    const [satir] = await sql<{ detay: { degisen_alanlar: string[]; yeni: Record<string, unknown> } }>("select detay from audit_log where klinik_id = $1 and hedef_tablo = 'hasta' and eylem = 'update' order by created_at desc limit 1", [K1.klinik]);
    expect(satir.detay.degisen_alanlar).toContain("telefon");
    expect(satir.detay.yeni.telefon).toBe("5559998877");
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
describe("talep ve şikayetler", () => {
  const sayfaBilgi = async (b: ReturnType<typeof bag>) => withTenant(b, (t) => t.select({ id: sema.destekTalebi.id, konu: sema.destekTalebi.konu }).from(sema.destekTalebi));

  it("her personel rolü talep açar; kullanıcı/klinik oturumdan gelir (istemci alanları yok sayılır); kontrol/yönlendirme karakterleri temizlenir", async () => {
    oturumAc({ userId: TERAPIST1, klinikId: K1.klinik, rol: "terapist" });
    const f = fd({ tur: "talep", konu: "Panel yavaş​\u0007", aciklama: "açıklama\r\n<img src=x onerror=alert(1)>‮", klinik_id: K2.klinik, kullanici_id: ADMIN2 });
    expect((await talepOlustur(null, f))?.success).toBe(true);
    const [t] = await sql<{ klinik_id: string; kullanici_id: string; konu: string; aciklama: string }>("select klinik_id, kullanici_id, konu, aciklama from destek_talebi where kullanici_id = $1", [TERAPIST1]);
    expect(t.klinik_id).toBe(K1.klinik);
    expect(t.kullanici_id).toBe(TERAPIST1);
    expect(t.konu).toBe("Panel yavaş");
    expect(t.aciklama).toBe("açıklama\n<img src=x onerror=alert(1)>"); // HTML olduğu gibi VERİ olarak saklanır; gösterimde React kaçışlar (talep-listesi.test.tsx)
    expect((await talepOlustur(null, fd({ tur: "hata", konu: "x", aciklama: "y" })))?.success).toBe(false);
    expect((await talepOlustur(null, fd({ tur: "talep", konu: "", aciklama: "y" })))?.message).toBe("Konu gerekli.");
  });

  it("görünürlük: kendi talebi + klinik_admin kendi kliniğinin hepsi; başka klinik/rol/bağlamsız super_admin göremez", async () => {
    oturumAc({ userId: RESEP1, klinikId: K1.klinik, rol: "resepsiyon" });
    await talepOlustur(null, fd({ tur: "sikayet", konu: "Resepsiyon şikayeti", aciklama: "ayrıntı" }));
    expect((await sayfaBilgi(bag(K1.klinik, TERAPIST1))).map((x) => x.konu)).toEqual(["Panel yavaş"]);
    expect((await sayfaBilgi(bag(K1.klinik, RESEP1))).map((x) => x.konu)).toEqual(["Resepsiyon şikayeti"]);
    expect((await sayfaBilgi(bag(K1.klinik, ADMIN1))).length).toBe(2);
    expect(await sayfaBilgi(bag(K2.klinik, ADMIN2))).toHaveLength(0);
    expect(await withKullanici(kullaniciBaglamiUret(SA), (t) => t.select({ id: sema.destekTalebi.id }).from(sema.destekTalebi))).toHaveLength(0);
  });

  it("durum güncelleme: yalnız klinik_admin; başka kliniğin talebi bulunamaz; geçersiz durum reddedilir", async () => {
    const [{ id }] = await sql<{ id: string }>("select id from destek_talebi where kullanici_id = $1", [TERAPIST1]);
    for (const [uid, rol] of [[TERAPIST1, "terapist"], [RESEP1, "resepsiyon"], [MUHASEBE1, "muhasebe"]] as const) {
      oturumAc({ userId: uid, klinikId: K1.klinik, rol });
      expect((await talepDurumGuncelle(id, "cozuldu"))?.message, rol).toBe(YETKISIZ_MESAJI);
    }
    oturumAc({ userId: ADMIN2, klinikId: K2.klinik, rol: "klinik_admin" });
    expect((await talepDurumGuncelle(id, "cozuldu"))?.message).toBe("Talep bulunamadı.");
    oturumAc({ userId: ADMIN1, klinikId: K1.klinik, rol: "klinik_admin" });
    expect((await talepDurumGuncelle(id, "bozuk" as never))?.message).toBe("Girdi hatalı.");
    expect((await talepDurumGuncelle(id, "cozuldu"))?.success).toBe(true);
    expect((await sql<{ durum: string }>("select durum from destek_talebi where id = $1", [id]))[0].durum).toBe("cozuldu");
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
describe("100k satır fixture: denetim geçmişi sayfalama + EXPLAIN, gelmeme analizi (RLS altında)", () => {
  const SATIR = 100_000;

  it("denetim geçmişi: 100k satırda sayfa sorgusu indeksle çalışır; sayfalama kararlı; RLS açıkken süre makul", async () => {
    const F = randomUUID(); // izole klinik: fixture diğer testleri etkilemesin
    await tenantdaCalistir(F, (c) => c.query("insert into klinik(id, ad, qr_kisa_kod) values ($1, 'Perf Denetim', 'perf-denetim')", [F]));
    PERF_KLINIKLER.push(F);
    const admin = (await personelKur({ klinikId: F, rol: "klinik_admin" })).id;
    await tenantdaCalistir(F, (c) =>
      c.query(
        `insert into audit_log(klinik_id, kullanici_id, eylem, hedef_tablo, hedef_id, detay, created_at)
         select $1, $2, (array['insert','update','delete','select'])[1 + (g % 4)], (array['hasta','hasta_bakiye_hareket','fatura','personel_puantaj'])[1 + (g % 4)], gen_random_uuid(),
                jsonb_build_object('surum', 2, 'degisen_alanlar', jsonb_build_array('tutar'), 'eski', jsonb_build_object('tutar', g), 'yeni', jsonb_build_object('tutar', g + 1)),
                now() - (g * interval '4 seconds')
         from generate_series(1, ${SATIR}) g`,
        [F, admin]
      )
    );
    const c = await superBaglan();
    try {
      await c.query("analyze audit_log");
    } finally {
      await c.end();
    }

    // sayfa 1 + derin sayfa; gün=7 (86.4k satır pencerede: 7*86400/4 = 151k > 100k → hepsi pencere içinde)
    const g = { klinikId: F, gun: 7, grup: "hepsi" as const, eylem: "" as const };
    const t0 = Date.now();
    const s1 = await withTenant(bag(F, admin), (t) => denetimSayfasiGetir(t, { ...g, sayfa: 1 }));
    const sure1 = Date.now() - t0;
    expect(s1.satirlar).toHaveLength(DENETIM_SAYFA_BOYUTU);
    expect(s1.sonrakiVar).toBe(true);
    const s2 = await withTenant(bag(F, admin), (t) => denetimSayfasiGetir(t, { ...g, sayfa: 2 }));
    expect(s2.satirlar[0].id).not.toBe(s1.satirlar[0].id);
    expect(s1.satirlar.map((x) => x.id).filter((i) => s2.satirlar.some((y) => y.id === i))).toEqual([]); // sayfalar ayrık
    const son = await withTenant(bag(F, admin), (t) => denetimSayfasiGetir(t, { ...g, gun: 90, sayfa: 2000 })); // 2000. sayfa = 99.950. satır
    expect(son.satirlar.length).toBe(50);
    expect(son.sonrakiVar).toBe(false);

    // EXPLAIN ANALYZE: gerçek sayfa sorgusu, klinik_uygulama rolü + RLS açık
    const d = duzenekOlustur();
    const istemci = await d.baglanRol("klinik_uygulama");
    const planlar: Record<string, { ms: number; indeks: boolean; satirIslenen: number }> = {};
    try {
      for (const sayfa of [1, 200, 2000]) {
        const { sql: sorgu, params } = await withTenant(bag(F, admin), async (t) => denetimSorgusuKur(t, { ...g, gun: 90, sayfa }).toSQL());
        await istemci.query("BEGIN");
        await istemci.query("select set_config('app.user_id', $1, true), set_config('app.tenant_id', $2, true)", [admin, F]);
        const r = await istemci.query({ text: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sorgu}`, values: params as unknown[] });
        await istemci.query("ROLLBACK");
        const plan = r.rows[0]["QUERY PLAN"][0];
        const metin = JSON.stringify(plan);
        planlar[`sayfa ${sayfa}`] = { ms: Math.round(plan["Execution Time"]), indeks: /Index Scan|Index Only Scan|Bitmap Index Scan/.test(metin) && /klinik_id_created_at_idx|idx_audit_log_klinik_tarih/.test(metin), satirIslenen: Number(/"Actual Rows":(\d+)/.exec(metin)?.[1] ?? 0) };
      }
    } finally {
      await istemci.end();
    }
    console.log("[perf] denetim geçmişi (100k satır, RLS açık):", JSON.stringify({ ilkSayfaUygulamaMs: sure1, ...planlar }));
    for (const [ad, p] of Object.entries(planlar)) {
      // Derin sayfada (offset ~100k = tüm tablo) planlayıcı sıralı tarama yerine toplu sıralamayı seçebilir; önemli olan süresi (gerçek kullanımda ilk sayfalar + 90 gün filtresi).
      if (ad !== "sayfa 2000") expect(p.indeks, `${ad}: (klinik_id, created_at DESC) indeksi kullanılmalı`).toBe(true);
      expect(p.ms, `${ad}: yürütme süresi`).toBeLessThan(1500);
    }
    expect(planlar["sayfa 1"].ms).toBeLessThan(300);
  });

  it("gelmeme analizi: yalnız klinik_admin; toplulaştırma SQL'de (tek kaynak) ve doğrudan SQL ile birebir aynı; RLS altında 65k satırlık pencerede makul sürede", async () => {
    const F = K1.klinik;
    const s = await superBaglan();
    RANDEVU_ONCEKI = (await s.query("select id from randevu where klinik_id = $1", [F])).rows.map((r) => r.id);
    const enumAdi = "randevu_durum_tipi";
    try {
      await s.query("alter table randevu disable trigger user");
      await s.query("begin");
      await s.query("select set_config('app.tenant_id', $1, true)", [F]);
      await s.query(
        `insert into randevu(klinik_id, hasta_id, terapist_id, oda_id, baslangic, bitis, durum)
         select $1, $2, $3, $4, now() - (g * interval '2 minutes'), now() - (g * interval '2 minutes') + interval '1 minute',
                (array['geldi','gecikmeli_geldi','tamamlandi','gelmedi','iptal','ertelendi','planlandi'])[1 + (g % 7)]::${enumAdi}
         from generate_series(10, ${SATIR + 9}) g`,
        [F, K1.hasta, K1.terapist, K1.oda]
      );
      await s.query("commit");
      await s.query("analyze randevu");
    } finally {
      await s.query("alter table randevu enable trigger user").catch(() => {});
      await s.end();
    }

    const bitis = new Date();
    const baslangic = new Date(bitis.getTime() - 90 * 86_400_000);
    const cagir = (b: ReturnType<typeof bag>) => withTenant(b, (t) => rpc<{ boyut: string; anahtar: string; gerceklesen: number; gelmedi: number; iptal: number; isaretlenmemis: number }>(t, "gelmeme_analizi", { p_baslangic: baslangic.toISOString(), p_bitis: bitis.toISOString() }));

    const t0 = Date.now();
    const sonuc = await cagir(bag(F, ADMIN1));
    const ms = Date.now() - t0;
    const toplam = sonuc.find((x) => x.boyut === "toplam")!;
    // doğrudan SQL (aynı pencere, süper kullanıcı = RLS yok): sayılar birebir
    const [d] = await sql<{ gerceklesen: string; gelmedi: string; iptal: string; planli: string }>(
      `select count(*) filter (where durum::text in ('geldi','gecikmeli_geldi','seansta','tamamlandi')) gerceklesen, count(*) filter (where durum::text = 'gelmedi') gelmedi,
              count(*) filter (where durum::text = 'iptal') iptal, count(*) filter (where durum::text = 'planlandi') planli
       from randevu where klinik_id = $1 and baslangic >= $2 and baslangic < least($3::timestamptz, now())`,
      [F, baslangic.toISOString(), bitis.toISOString()]
    );
    expect(toplam.gerceklesen).toBe(Number(d.gerceklesen));
    expect(toplam.gelmedi).toBe(Number(d.gelmedi));
    expect(toplam.iptal).toBe(Number(d.iptal));
    expect(toplam.isaretlenmemis).toBe(Number(d.planli));
    expect(toplam.gerceklesen + toplam.gelmedi).toBeGreaterThan(20_000);
    expect(sonuc.some((x) => x.boyut === "hasta" && x.anahtar === K1.hasta)).toBe(true); // tekrar gelmeyen hasta listesi

    // RLS açıkken ölçüm vs süper kullanıcı (RLS yok)
    const c = await superBaglan();
    let superMs = 0;
    try {
      await c.query("begin");
      await c.query("select set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true)", [F, ADMIN1]);
      const t1 = Date.now();
      await c.query("select * from gelmeme_analizi($1, $2)", [baslangic.toISOString(), bitis.toISOString()]);
      superMs = Date.now() - t1;
      await c.query("rollback");
    } finally {
      await c.end();
    }
    console.log("[perf] gelmeme_analizi (~65k pencere satırı): RLS açık", ms, "ms; süper kullanıcı (RLS yok)", superMs, "ms");
    expect(ms).toBeLessThan(4000);

    // yetki: diğer roller reddedilir, başka klinik yöneticisi yalnız kendi (boş) verisini görür
    for (const [id, ad] of [[RESEP1, "resepsiyon"], [TERAPIST1, "terapist"], [MUHASEBE1, "muhasebe"]] as const) expect(await cagir(bag(F, id)).then(() => "", (e) => pgHata(e).mesaj), ad).toMatch(/yetkisiz/);
    const baska = await cagir(bag(K2.klinik, ADMIN2));
    expect(baska.find((x) => x.boyut === "toplam")!.gerceklesen).toBeLessThan(10); // K2'nin kendi birkaç randevusu; K1 fixture'ı sızmaz
    // bağlamsız super_admin: tenant yok → hiçbir klinik verisi (yalnız sıfırlı toplam satırı)
    const bos = await withKullanici(kullaniciBaglamiUret(SA), (t) => rpc<{ boyut: string; gerceklesen: number; gelmedi: number }>(t, "gelmeme_analizi", { p_baslangic: baslangic.toISOString(), p_bitis: bitis.toISOString() }));
    expect(bos.filter((x) => x.boyut !== "toplam")).toEqual([]);
    expect(bos.find((x) => x.boyut === "toplam")?.gerceklesen ?? 0).toBe(0);
  });
});

// Fixture'lar paylaşılan test kümesini kirletmesin (diğer test dosyaları K1'in randevu/audit sayımlarına bakar).
afterAll(async () => {
  const s = await superBaglan();
  try {
    await s.query("alter table randevu disable trigger user");
    await s.query("delete from randevu where klinik_id = $1 and id <> all($2::uuid[])", [K1.klinik, RANDEVU_ONCEKI]);
    await s.query("alter table randevu enable trigger user");
    for (const f of PERF_KLINIKLER) {
      await s.query("delete from audit_log where klinik_id = $1", [f]);
      await s.query("begin; select set_config('app.tenant_id', $1, true); delete from klinik where id = $1; commit", [f]).catch(() => s.query("rollback"));
    }
  } finally {
    await s.query("alter table randevu enable trigger user").catch(() => {});
    await s.end();
  }
}, 120_000);
