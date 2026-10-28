// Modül 4c (0017): terapistin hasta_bakiye_hareket, odeme*, fatura, paket_satis tablolarına OKUMA erişimi kapalı; çizelge ve hasta listesi DAR görünümlerle çalışır.
import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq, sql as dsql } from "drizzle-orm";
import { ortamKur, personelKur, hastaKur, superBaglan, tenantBaglami, tenantdaCalistir, reddedilmeli } from "./yardimci";
import { rpc, sema, withTenant } from "@/lib/db";
import { randevuSatirlariGetir } from "@/lib/randevu/sorgular";
import { listeEkVerisiGetir } from "@/lib/hasta/liste-sorgular";
import { hastaAktifPaketleriGetir } from "@/app/(app)/panel/randevular/veri-actions";
import { oturumAc } from "./oturum-durumu";

let K1: Record<string, string>;
let K2: Record<string, string>;
let admin: string, resepsiyon: string, muhasebe: string, terapist: string, admin2: string;
let HASTA: string, PAKET: string, PAKET_SATIS: string, ODEME: string;
let R_BORC: string, R_TAHSIL: string, R_PAKET: string, R_ACIK: string;
let portal: { kullaniciId: string; hastaId: string };
const tx = (kullanici: string, klinik = K1.klinik) => tenantBaglami({ klinik, kullanici });

async function sql<T = Record<string, unknown>>(q: string, p: unknown[] = []): Promise<T[]> {
  const c = await superBaglan();
  try {
    return (await c.query(q, p)).rows as T[];
  } finally {
    await c.end();
  }
}
const yaz = (q: string, p: unknown[] = []) => tenantdaCalistir(K1.klinik, (c) => c.query(q, p));

beforeAll(async () => {
  const o = ortamKur();
  K1 = o.ids.k1;
  K2 = o.ids.k2;
  admin = K1.kullanici;
  resepsiyon = (await personelKur({ klinikId: K1.klinik, rol: "resepsiyon" })).id;
  muhasebe = (await personelKur({ klinikId: K1.klinik, rol: "muhasebe" })).id;
  terapist = (await personelKur({ klinikId: K1.klinik, rol: "terapist" })).id;
  admin2 = (await personelKur({ klinikId: K2.klinik, rol: "klinik_admin" })).id;
  portal = await hastaKur({ klinikId: K1.klinik });
  HASTA = portal.hastaId;
  [PAKET, PAKET_SATIS, ODEME] = [randomUUID(), randomUUID(), randomUUID()];
  [R_BORC, R_TAHSIL, R_PAKET, R_ACIK] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];

  await yaz("insert into paket(id, klinik_id, islem_tanimi_id, ad, seans_sayisi, fiyat) values ($1,$2,$3,'Paket 10',10,5000)", [PAKET, K1.klinik, K1.islem]);
  await yaz("insert into odeme(id, klinik_id, hasta_id) values ($1,$2,$3)", [ODEME, K1.klinik, HASTA]);
  await yaz("insert into paket_satis(id, klinik_id, hasta_id, paket_id, odeme_id, kalan_adet) values ($1,$2,$3,$4,$5,7)", [PAKET_SATIS, K1.klinik, HASTA, PAKET, ODEME]);
  await yaz("insert into fatura(klinik_id, odeme_id) values ($1,$2)", [K1.klinik, ODEME]);
  // Dört randevu (ileri bir tarihte; oda/terapist çakışmasın diye farklı saatler): borçla işlenmiş, borç+tahsilatla işlenmiş, paketli, açık
  const gun = "2038-05-0";
  const r = (id: string, saat: number, ek = "") =>
    yaz(`insert into randevu(id, klinik_id, hasta_id, terapist_id, oda_id, baslangic, bitis, durum ${ek ? ", paket_satis_id" : ""}) values ($1,$2,$3,$4,$5,$6::timestamptz,$6::timestamptz + interval '30 minutes','tamamlandi' ${ek ? ", $7" : ""})`, [id, K1.klinik, HASTA, K1.terapist, K1.oda, `${gun}${saat > 9 ? "" : ""}1 ${String(saat).padStart(2, "0")}:00+03`, ...(ek ? [ek] : [])]);
  await r(R_BORC, 9);
  await r(R_TAHSIL, 10);
  await r(R_PAKET, 11, PAKET_SATIS);
  await r(R_ACIK, 12);
  await yaz("insert into hasta_bakiye_hareket(klinik_id, hasta_id, tur, tutar, randevu_id) values ($1,$2,'borc',1500.00,$3)", [K1.klinik, HASTA, R_BORC]);
  await yaz("insert into hasta_bakiye_hareket(klinik_id, hasta_id, tur, tutar, randevu_id) values ($1,$2,'borc',900.00,$3)", [K1.klinik, HASTA, R_TAHSIL]);
  await yaz("insert into hasta_bakiye_hareket(klinik_id, hasta_id, tur, tutar, odeme_yontemi, randevu_id) values ($1,$2,'odeme',900.00,'nakit',$3)", [K1.klinik, HASTA, R_TAHSIL]);
});

describe("terapist finans tablolarını OKUYAMAZ", () => {
  const tablolar = [
    ["hasta_bakiye_hareket", sema.hastaBakiyeHareket],
    ["odeme", sema.odeme],
    ["odeme_kalemi", sema.odemeKalemi],
    ["odeme_satiri", sema.odemeSatiri],
    ["fatura", sema.fatura],
    ["paket_satis", sema.paketSatis],
  ] as const;

  it("veri VARKEN terapist 0 satır görür; klinik_admin, resepsiyon ve muhasebe okumaya devam eder (diğer roller etkilenmez)", async () => {
    // odeme_kalemi / odeme_satiri örneği yoksa ekle (odeme_olustur'un yazdığı biçim)
    await yaz("insert into odeme_kalemi(odeme_id, islem_tanimi_id, aciklama, miktar, birim_fiyat, kdv_orani) values ($1,$2,'x',1,100,20)", [ODEME, K1.islem]);
    await yaz("insert into odeme_satiri(odeme_id, yontem, tutar) values ($1,'nakit',100)", [ODEME]);
    for (const [ad, t] of tablolar) {
      const var_ = Number((await sql<{ n: string }>(`select count(*)::text n from ${ad} where ${ad === "odeme_kalemi" || ad === "odeme_satiri" ? "odeme_id" : "klinik_id"} = $1`, [ad.startsWith("odeme_") ? ODEME : K1.klinik]))[0].n);
      const ter = await withTenant(tx(terapist), (x) => x.select().from(t).limit(5));
      expect(ter, ad).toHaveLength(0);
      expect(var_, `${ad} fixture`).toBeGreaterThan(0);
      for (const [kim, rol] of [[admin, "klinik_admin"], [resepsiyon, "resepsiyon"], [muhasebe, "muhasebe"]] as const) {
        expect((await withTenant(tx(kim), (x) => x.select().from(t).limit(5))).length, `${ad}/${rol}`).toBeGreaterThan(0);
      }
    }
    // ana tablolar için fixture KESİN dolu
    for (const ad of ["hasta_bakiye_hareket", "odeme", "fatura", "paket_satis"]) expect(Number((await sql<{ n: string }>(`select count(*)::text n from ${ad} where klinik_id = $1`, [K1.klinik]))[0].n), ad).toBeGreaterThan(0);
  });

  it("terapist bu tablolara YAZAMAZ da (insert/update reddedilir)", async () => {
    await reddedilmeli(withTenant(tx(terapist), (x) => x.insert(sema.hastaBakiyeHareket).values({ klinikId: K1.klinik, hastaId: HASTA, tur: "odeme", tutar: "1.00", odemeYontemi: "nakit" })), /row-level security|permission denied/);
    await reddedilmeli(withTenant(tx(terapist), (x) => x.update(sema.paketSatis).set({ kalanAdet: 99 }).where(eq(sema.paketSatis.id, PAKET_SATIS))), /row-level security|permission denied/);
    expect(Number((await sql<{ k: number }>("select kalan_adet k from paket_satis where id = $1", [PAKET_SATIS]))[0].k)).toBe(7);
  });

  it("başka kliniğin yöneticisi de göremez (tenant); hasta portalı KENDİ satırlarını görmeye devam eder", async () => {
    expect(await withTenant(tx(admin2, K2.klinik), (x) => x.select().from(sema.hastaBakiyeHareket).where(eq(sema.hastaBakiyeHareket.hastaId, HASTA)))).toHaveLength(0);
    const p = await withTenant(tx(portal.kullaniciId), (x) => x.select({ id: sema.hastaBakiyeHareket.id }).from(sema.hastaBakiyeHareket).where(eq(sema.hastaBakiyeHareket.hastaId, HASTA)));
    expect(p.length).toBeGreaterThan(0);
    const ps = await withTenant(tx(portal.kullaniciId), (x) => x.select({ id: sema.paketSatis.id }).from(sema.paketSatis).where(eq(sema.paketSatis.hastaId, HASTA)));
    expect(ps.length).toBe(1);
  });
});

describe("dar görünümler: yalnız durum/adet, tutar YOK", () => {
  it("v_randevu_kapanis terapist için işlendi / kapanış şekli / paket kalanı verir; kolonlarda tutar yoktur", async () => {
    const satirlar = await withTenant(tx(terapist), (x) => x.select().from(sema.vRandevuKapanis).where(dsql`${sema.vRandevuKapanis.klinikId} = ${K1.klinik} and ${sema.vRandevuKapanis.randevuId} in (${dsql.join([R_BORC, R_TAHSIL, R_PAKET, R_ACIK].map((i) => dsql`${i}::uuid`), dsql`, `)})`));
    const h = new Map(satirlar.map((s) => [s.randevuId, s]));
    expect(h.get(R_BORC)).toMatchObject({ islendi: true, kapanisSekli: "cariye" });
    expect(h.get(R_TAHSIL)).toMatchObject({ islendi: true, kapanisSekli: "tahsil" });
    expect(h.get(R_PAKET)).toMatchObject({ islendi: false, kapanisSekli: "paketten", paketKalanAdet: 7, paketAd: "Paket 10" });
    expect(h.get(R_ACIK)).toMatchObject({ islendi: false, kapanisSekli: null });
    const kolonlar = (await sql<{ column_name: string }>("select column_name from information_schema.columns where table_name = 'v_randevu_kapanis' order by ordinal_position")).map((c) => c.column_name);
    expect(kolonlar).toEqual(["randevu_id", "klinik_id", "islendi", "kapanis_sekli", "paket_kalan_adet", "paket_ad"]);
    expect(JSON.stringify(satirlar)).not.toMatch(/1500|900/);
  });

  it("tenant ve personel kapısı: başka kliniğin yöneticisi ve hasta portalı bu görünümlerden satır GÖREMEZ", async () => {
    for (const bag of [tx(admin2, K2.klinik), tx(portal.kullaniciId)]) {
      expect(await withTenant(bag, (x) => x.select().from(sema.vRandevuKapanis).where(eq(sema.vRandevuKapanis.randevuId, R_BORC)))).toHaveLength(0);
      expect(await withTenant(bag, (x) => x.select().from(sema.vHastaAktifPaket).where(eq(sema.vHastaAktifPaket.hastaId, HASTA)))).toHaveLength(0);
      expect(await withTenant(bag, (x) => x.select().from(sema.vHastaPaketOzet).where(eq(sema.vHastaPaketOzet.hastaId, HASTA)))).toHaveLength(0);
    }
  });

  it("v_hasta_ozet: kalan paket hakkı her rolde doğru (7); bakiye finans rollerinde gerçek, terapistte 0 (kaynak satırlar görünmez)", async () => {
    const oku = (kim: string) => withTenant(tx(kim), async (x) => (await x.select({ k: sema.vHastaOzet.kalanPaketHakki, b: sema.vHastaOzet.bakiye }).from(sema.vHastaOzet).where(eq(sema.vHastaOzet.hastaId, HASTA)))[0]);
    for (const kim of [terapist, admin, resepsiyon, muhasebe]) expect(Number((await oku(kim)).k)).toBe(7);
    expect(Number((await oku(terapist)).b)).toBe(0);
    // Gerçek bakiye: borç 1500 + borç 900 − ödeme 900 (odeme_id NULL) = −1500
    expect(Number((await oku(admin)).b)).toBe(-1500);
    expect(Number((await oku(muhasebe)).b)).toBe(-1500);
  });
});

describe("çizelge ve listeler terapist oturumunda ÇALIŞIR", () => {
  it("randevuSatirlariGetir: terapist ve yönetici AYNI işlendi/paket bilgisini görür; gerçek cari satırı kimliği/tutarı istemciye gitmez", async () => {
    const aralik = { baslangic: "2038-05-01T00:00:00+03:00", bitis: "2038-05-02T00:00:00+03:00" };
    const ter = await withTenant(tx(terapist), (x) => randevuSatirlariGetir(x, aralik));
    const yon = await withTenant(tx(admin), (x) => randevuSatirlariGetir(x, aralik));
    expect(ter.map((s) => s.id).sort()).toEqual([R_BORC, R_TAHSIL, R_PAKET, R_ACIK].sort());
    const bayrak = (s: typeof ter) => Object.fromEntries(s.map((r) => [r.id, [(r.hasta_bakiye_hareket ?? []).some((h) => h.tur === "borc"), r.paket_satis?.kalan_adet ?? null, r.paket_satis?.paket?.ad ?? null]]));
    expect(bayrak(ter)).toEqual(bayrak(yon));
    expect(bayrak(ter)).toMatchObject({ [R_BORC]: [true, null, null], [R_TAHSIL]: [true, null, null], [R_PAKET]: [false, 7, "Paket 10"], [R_ACIK]: [false, null, null] });
    expect(JSON.stringify(ter)).not.toMatch(/1500|900\.00/);
    const gercekId = (await sql<{ id: string }>("select id from hasta_bakiye_hareket where randevu_id = $1 and tur = 'borc'", [R_BORC]))[0].id;
    expect(JSON.stringify(ter)).not.toContain(gercekId);
  });

  it("hasta listesi (kalan/toplam seans) ve randevu formundaki aktif paketler terapist için de dolu", async () => {
    const liste = await withTenant(tx(terapist), (x) => listeEkVerisiGetir(x, [{ id: HASTA } as never]));
    const satir = liste.find((h) => h.id === HASTA);
    expect(satir?.paketIlerleme).toEqual({ kullanilan: 3, toplam: 10 }); // 10 seanslık paketten 7 kalan
    expect(satir?.bakiye).toBe(0); // terapist bakiye göremez
    oturumAc({ userId: terapist, klinikId: K1.klinik, rol: "terapist" });
    const paketler = await hastaAktifPaketleriGetir(HASTA);
    expect(paketler).toHaveLength(1);
    expect(paketler[0]).toMatchObject({ id: PAKET_SATIS, kalan_adet: 7 });
  });

  it("DEFINER akışları bozulmaz: paketsiz randevuda check-in (randevu_gelis_isaretle) paketten hak düşer ve terapist yeni kalanı görünümden görür", async () => {
    const R_YENI = randomUUID();
    await yaz("insert into randevu(id, klinik_id, hasta_id, terapist_id, oda_id, islem_tanimi_id, baslangic, bitis, durum) values ($1,$2,$3,$4,$5,$6,'2038-05-01 14:00+03','2038-05-01 14:30+03','planlandi')", [R_YENI, K1.klinik, HASTA, K1.terapist, K1.oda, K1.islem]);
    await withTenant(tx(resepsiyon), (x) => rpc(x, "randevu_gelis_isaretle", { p_randevu_id: R_YENI }));
    expect(Number((await sql<{ k: number }>("select kalan_adet k from paket_satis where id = $1", [PAKET_SATIS]))[0].k)).toBe(6);
    const g = await withTenant(tx(terapist), (x) => x.select().from(sema.vRandevuKapanis).where(eq(sema.vRandevuKapanis.randevuId, R_YENI)));
    expect(g[0]).toMatchObject({ kapanisSekli: "paketten", paketKalanAdet: 6 });
  });
});

describe("kontrol sorgusu (db/kontrol/bypassrls-kontrol.sql 6f) 4c kuralını gerçekten denetler", () => {
  const govde = (() => {
    const t = fs.readFileSync(path.join(__dirname, "../../db/kontrol/bypassrls-kontrol.sql"), "utf8");
    const parca = t.slice(t.indexOf("-- 6f)"), t.indexOf("-- 7) Bilgi"));
    return parca.slice(parca.indexOf("SELECT 'finans_select_rol_sartsiz'")).trim().replace(/;\s*$/, "");
  })();
  it("temiz şemada bulgu YOK; terapistin de okuyabildiği (rol şartsız) bir SELECT politikası eklenirse HATA bulgusu çıkar (mutasyon kanıtı)", async () => {
    const c = await superBaglan();
    try {
      expect((await c.query(govde)).rows).toEqual([]);
      await c.query("BEGIN");
      await c.query("CREATE POLICY bozuk_deneme ON paket_satis AS PERMISSIVE FOR SELECT TO PUBLIC USING (klinik_id = (SELECT current_klinik_id()))");
      const r = (await c.query(govde)).rows;
      await c.query("ROLLBACK");
      expect(r.map((x) => Object.values(x).join("|"))).toEqual(["paket_satis.bozuk_deneme"]);
    } finally {
      await c.query("ROLLBACK").catch(() => undefined);
      await c.end();
    }
  });
});
