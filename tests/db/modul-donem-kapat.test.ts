// Modül 7 — otomatik dönem kapama (bakım betiği çekirdeği) ile ELLE "Dönem Kapat" aynı fixture'da AYNI hakedişi yazar;
// eski seans sayımı / maaş geçmişi sürümleri ile yeni (Drizzle) sürümler aynı fixture'da aynı sonucu verir; idempotency.
import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { ortamKur, personelKur, superBaglan, tenantBaglami, tenantdaCalistir, reddedilmeli } from "./yardimci";
import { oturumAc } from "./oturum-durumu";
import { rpc, withTenant } from "@/lib/db";
import { bakimOturumuAc, type BakimOturumu } from "@/lib/db/bakim";
import { donemKapat } from "@/app/(app)/panel/personel/puantaj-cetveli/actions";
import { hedefAylar, klinikDonemleriniKapat } from "@/lib/personel/donem-kapat";
import { donemMaasi, maasGecmisiGetirTx } from "@/lib/personel/donem-maasi";
import { seansSayilariniGetirTx } from "@/lib/personel/seans-sayisi";

let D: string;
let admin: string;
let oturum: BakimOturumu;
const ODA = Array.from({ length: 4 }, () => randomUUID());
// Çift 1 (A: elle, B: betik): tam ay, geçmişsiz. Çift 2 (C: elle, E: betik): 20 Eylül'de işten çıkış + maaş geçmişi (Ekim'de zam).
const K = { A: randomUUID(), B: randomUUID(), C: randomUUID(), E: randomUUID() } as const;
const T = { A: randomUUID(), B: randomUUID(), C: randomUUID(), E: randomUUID() } as const;
type Ad = keyof typeof K;

async function sql<T = Record<string, unknown>>(q: string, p: unknown[] = []): Promise<T[]> {
  const c = await superBaglan();
  try {
    return (await c.query(q, p)).rows as T[];
  } finally {
    await c.end();
  }
}
const yaz = (q: string, p: unknown[] = []) => tenantdaCalistir(D, (c) => c.query(q, p));

beforeAll(async () => {
  ortamKur();
  D = randomUUID();
  await tenantdaCalistir(D, (c) => c.query("insert into klinik(id, ad, qr_kisa_kod) values ($1, 'donem-deneme', 'donemdeneme')", [D]));
  admin = (await personelKur({ klinikId: D, rol: "klinik_admin" })).id;
  oturum = bakimOturumuAc();
  const hasta = randomUUID();
  await yaz("insert into hasta(id, klinik_id, ad_soyad, telefon) values ($1,$2,'Hasta','5550001111')", [hasta, D]);
  for (const [i, ad] of (["A", "B", "C", "E"] as Ad[]).entries()) {
    const cikis = ad === "C" || ad === "E" ? "'2026-09-20'" : "null";
    const maas = ad === "C" || ad === "E" ? 40000 : 30000;
    await yaz(`insert into personel(id, klinik_id, ad_soyad, gorev, maas, ise_giris_tarihi, isten_cikis_tarihi) values ($1,$2,$3,'Fizyoterapist',${maas},'2025-01-01',${cikis})`, [K[ad], D, `Terapist ${ad}`]);
    await yaz("insert into terapist(id, klinik_id, personel_id, prim_sabit_tutar) values ($1,$2,$3,12.35)", [T[ad], D, K[ad]]);
    await yaz("insert into oda(id, klinik_id, ad) values ($1,$2,$3)", [ODA[i], D, `Oda ${ad}`]);
    if (ad === "C" || ad === "E") {
      await yaz("insert into personel_ucret(klinik_id, personel_id, gecerlilik_tarihi, maas) values ($1,$2,'2026-01-01',25000), ($1,$2,'2026-10-15',40000)", [D, K[ad]]);
    }
    // Seans fixture'ı: İstanbul ay sınırları (30.09 23:30 → Eylül, 01.10 00:30 → Ekim), sayılmayan durumlar, çıkıştan sonraki seans.
    const seanslar: [string, string][] = [
      ["2026-08-31 23:30+03", "tamamlandi"], // Ağustos
      ["2026-09-02 10:00+03", "tamamlandi"],
      ["2026-09-03 10:00+03", "geldi"],
      ["2026-09-04 10:00+03", "gecikmeli_geldi"],
      ["2026-09-05 10:00+03", "planlandi"], // sayılmaz
      ["2026-09-06 10:00+03", "iptal"], // sayılmaz
      ["2026-09-25 10:00+03", "tamamlandi"], // çıkıştan (20.09) sonra: çıkışlıda sayılmaz
      ["2026-09-30 23:30+03", "tamamlandi"], // Eylül (UTC'de de Eylül)
      ["2026-10-01 00:30+03", "tamamlandi"], // İstanbul'da EKİM (UTC'de Eylül'dü): sayılmamalı
    ];
    for (const [zaman, durum] of seanslar) {
      await yaz("insert into randevu(klinik_id, hasta_id, terapist_id, oda_id, baslangic, bitis, durum) values ($1,$2,$3,$4,$5::timestamptz,$5::timestamptz + interval '30 minutes',$6)", [D, hasta, T[ad], ODA[i], zaman, durum]);
    }
  }
});

// Eski sürümler silinmeden ÖNCE aynı fixture'da yeni sürümlerle karşılaştırıldı ve birebir aynı sonucu verdi (2026-10-28);
// o sonuçlar aşağıda altın değer olarak sabitlendi: değişirse hakediş kuralı değişmiş demektir.
describe("hakediş girdileri (eski sürümle doğrulanmış altın değerler)", () => {
  it("seans sayımı: İstanbul ay sınırı (30.09 23:30 Eylül, 01.10 00:30 Ekim), planlandi/iptal sayılmaz, işten çıkıştan sonraki seans sayılmaz", async () => {
    const terapistler = (["A", "C"] as Ad[]).map((ad) => ({ terapistId: T[ad], personelId: K[ad], istenCikisTarihi: ad === "C" ? "2026-09-20" : null }));
    const yeni = await withTenant(tenantBaglami({ klinik: D, kullanici: admin }), (tx) => seansSayilariniGetirTx(tx, terapistler, "2026-09"));
    expect(Object.fromEntries(yeni)).toEqual({ [K.A]: 5, [K.C]: 3 }); // A: 02,03,04,25,30(23:30) · C: 02,03,04
  });

  it("maaş geçmişi + dönem maaşı: Eylül dönemi zamdan ÖNCEKİ maaşla (25.000) hesaplanır; geçmişsiz personelde güncel maaş", async () => {
    const yeni = await withTenant(tenantBaglami({ klinik: D, kullanici: admin }), (tx) => maasGecmisiGetirTx(tx, [K.C, K.A]));
    const sade = (m: Map<string, { gecerlilik_tarihi: string; maas: number }[]>) => Object.fromEntries([...m].map(([k, v]) => [k, v.map((x) => [x.gecerlilik_tarihi, x.maas]).sort()]));
    expect(sade(yeni)[K.C]).toEqual([["2026-01-01", 25000], ["2026-10-15", 40000]]);
    expect(sade(yeni)[K.A]).toBeUndefined();
    expect(donemMaasi(yeni.get(K.C), 40000, "2026-10-01")).toBe(25000);
    expect(donemMaasi(yeni.get(K.A), 30000, "2026-10-01")).toBe(30000);
  });
});

describe("otomatik kapama (betik çekirdeği) == elle Dönem Kapat; idempotent", () => {
  const hareketler = (personel: string) =>
    sql<{ tur: string; tutar: string }>("select tur, tutar::text from personel_hesap_hareket where personel_id = $1 and tur in ('hakedis','prim') and kaynak_id in (select id from personel_puantaj_donem where personel_id = $1 and yil = 2026 and ay = 9) order by tur", [personel]);

  beforeAll(async () => {
    oturumAc({ userId: admin, klinikId: D, rol: "klinik_admin" });
    expect((await donemKapat(K.A, 2026, 9))?.success).toBe(true);
    expect((await donemKapat(K.C, 2026, 9))?.success).toBe(true);
  });

  it("betik yalnız kapalı olmayan dönemleri kapatır; elle kapatılanlar 'zaten kapalı' sayılır ve çoğalmaz", async () => {
    const sonuc = await klinikDonemleriniKapat((is) => oturum.klinikte(D, is), ["2026-09"]);
    const eylul = sonuc.find((s) => s.donem === "2026-09")!;
    expect(eylul).toMatchObject({ kapatildi: 2, zatenKapali: 2, hata: 0 }); // B ve E betikle · A ve C elle (+ admin personel yok)
  });

  it("aynı fixture → aynı hakediş ve prim (kuruş kuruşa): tam ay çifti (A/B) ve çıkışlı + maaş geçmişli çift (C/E)", async () => {
    expect(await hareketler(K.A)).toEqual([{ tur: "hakedis", tutar: "30000.00" }, { tur: "prim", tutar: "61.75" }]); // 5 seans × 12,35
    expect(await hareketler(K.B)).toEqual(await hareketler(K.A));
    const c = await hareketler(K.C);
    expect(c.find((x) => x.tur === "prim")!.tutar).toBe("37.05"); // 3 seans (çıkıştan sonraki sayılmaz)
    expect(Number(c.find((x) => x.tur === "hakedis")!.tutar)).toBeLessThan(25000); // 25.000 (zamdan önceki) × kısmi ay oranı; 40.000 DEĞİL
    expect(await hareketler(K.E)).toEqual(c);
  });

  it("ikinci çalışma çift kayıt yazmaz (idempotent) ve hata vermez", async () => {
    const once = (await sql<{ n: string }>("select count(*)::text n from personel_hesap_hareket where klinik_id = $1", [D]))[0].n;
    const sonuc = await klinikDonemleriniKapat((is) => oturum.klinikte(D, is), ["2026-09"]);
    expect(sonuc[0]).toMatchObject({ kapatildi: 0, hata: 0 });
    expect((await sql<{ n: string }>("select count(*)::text n from personel_hesap_hareket where klinik_id = $1", [D]))[0].n).toBe(once);
  });

  it("kapalı ama hakedişi yazılmamış dönem (yarım kalmış önceki çalışma) yeniden denenir", async () => {
    await sql("delete from personel_hesap_hareket where kaynak_id in (select id from personel_puantaj_donem where personel_id = $1 and yil = 2026 and ay = 9)", [K.B]);
    expect(await hareketler(K.B)).toEqual([]);
    const sonuc = await klinikDonemleriniKapat((is) => oturum.klinikte(D, is), ["2026-09"]);
    expect(sonuc[0].kapatildi).toBe(1);
    expect(await hareketler(K.B)).toEqual(await hareketler(K.A));
  });

  it("işe girişten önceki ay kapatılmaz; hedef aylar son 3 ay", async () => {
    await yaz("update personel set ise_giris_tarihi = '2026-09-16' where id = $1", [K.B]);
    const once = (await sql<{ n: string }>("select count(*)::text n from personel_puantaj_donem where personel_id = $1", [K.B]))[0].n;
    await klinikDonemleriniKapat((is) => oturum.klinikte(D, is), ["2026-08"]);
    expect((await sql<{ n: string }>("select count(*)::text n from personel_puantaj_donem where personel_id = $1", [K.B]))[0].n).toBe(once);
    expect(hedefAylar("2026-10").map((a) => a.param)).toEqual(["2026-09", "2026-08", "2026-07"]);
  });

  it("başka kliniğin personeline dokunmaz: betik bağlamı tek kliniğe kilitli", async () => {
    const baska = (await sql<{ id: string }>("select id from personel where klinik_id <> $1 limit 1", [D]))[0];
    if (!baska) return; // diğer test dosyalarının personeli yoksa anlamsız
    await reddedilmeli(oturum.klinikte(D, (tx) => rpc(tx, "personel_puantaj_donem_kapat", { p_personel_id: baska.id, p_yil: 2026, p_ay: 9 })), /personel_bulunamadi/);
  });
});
