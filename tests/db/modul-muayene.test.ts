// Modül 3 — kaynaklar (oda/cihaz), tedavi protokolleri, tablet ayarları ve tablet veri şekli: gerçek eylem kodu + gerçek Postgres.
import { beforeAll, describe, expect, it } from "vitest";
import { ortamKur, personelKur, superBaglan, tenantBaglami, tenantdaCalistir } from "./yardimci";
import { oturumAc } from "./oturum-durumu";
import { kaynakAktifDurumDegistir, kaynakAdGuncelle, kaynakOlustur } from "@/app/(app)/panel/kaynaklar/actions";
import { tedaviProtokoluGuncelle, tedaviProtokoluOlustur } from "@/app/(app)/panel/tedavi-protokolleri/actions";
import { tabletAyarlariGuncelle } from "@/app/(app)/panel/tablet/ayarlar/actions";
import { tabletRandevulariGetir } from "@/lib/randevu/sorgular";
import { YETKISIZ_MESAJI } from "@/lib/auth/yetki";

let K1: Record<string, string>;
let K2: Record<string, string>;
let admin1: string, resepsiyon1: string, terapist1: string, admin2: string;
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const as = (id: string, k: string, rol: "klinik_admin" | "resepsiyon" | "terapist") => oturumAc({ userId: id, klinikId: k, rol });
async function sql<T = Record<string, unknown>>(q: string, p: unknown[] = []): Promise<T[]> {
  const c = await superBaglan();
  try {
    return (await c.query(q, p)).rows as T[];
  } finally {
    await c.end();
  }
}

beforeAll(async () => {
  const o = ortamKur();
  K1 = o.ids.k1;
  K2 = o.ids.k2;
  admin1 = (await personelKur({ klinikId: K1.klinik, rol: "klinik_admin" })).id;
  resepsiyon1 = (await personelKur({ klinikId: K1.klinik, rol: "resepsiyon" })).id;
  terapist1 = (await personelKur({ klinikId: K1.klinik, rol: "terapist" })).id;
  admin2 = (await personelKur({ klinikId: K2.klinik, rol: "klinik_admin" })).id;
});

describe("kaynaklar (oda / cihaz)", () => {
  it("resepsiyon ekler/yeniden adlandırır; terapist ekleyemez; başka klinik başkasının odasını değiştiremez", async () => {
    as(terapist1, K1.klinik, "terapist");
    expect(await kaynakOlustur("oda", null, fd({ ad: "Yeni Oda", kapasite: "2" }))).toEqual({ success: false, message: YETKISIZ_MESAJI });
    as(resepsiyon1, K1.klinik, "resepsiyon");
    expect((await kaynakOlustur("oda", null, fd({ ad: "yeni oda", kapasite: "2" })))?.success).toBe(true);
    expect((await kaynakOlustur("cihaz", null, fd({ ad: "lazer", adet: "3" })))?.success).toBe(true);
    expect((await kaynakOlustur("oda", null, fd({ ad: "x" })))?.success).toBe(false);
    const oda = (await sql<{ id: string; ad: string; kapasite: number }>("select id, ad, kapasite from oda where klinik_id = $1 and kapasite = 2", [K1.klinik]))[0];
    expect(oda.ad).toBe("Yeni Oda");
    as(admin2, K2.klinik, "klinik_admin");
    expect((await kaynakAdGuncelle("oda", oda.id, "Ele Geçirildi"))?.success).toBe(false);
    expect((await kaynakAktifDurumDegistir("oda", oda.id, false))?.success).toBe(false);
    as(resepsiyon1, K1.klinik, "resepsiyon");
    expect((await kaynakAdGuncelle("oda", oda.id, "Oda Bir"))?.success).toBe(true);
    expect((await sql<{ ad: string }>("select ad from oda where id = $1", [oda.id]))[0].ad).toBe("Oda Bir");
  });

  it("gelecek randevusu olan oda pasife alınamaz; boş oda alınır", async () => {
    as(admin1, K1.klinik, "klinik_admin");
    const dolu = await kaynakAktifDurumDegistir("oda", K1.oda, false);
    expect(dolu?.success).toBe(false);
    expect(dolu?.message).toMatch(/gelecek randevu var/);
    const bos = (await sql<{ id: string }>("select id from oda where klinik_id = $1 and ad = 'Oda Bir'", [K1.klinik]))[0].id;
    expect(await kaynakAktifDurumDegistir("oda", bos, false)).toBeNull();
    expect((await sql<{ aktif: boolean }>("select aktif from oda where id = $1", [bos]))[0].aktif).toBe(false);
  });
});

describe("tedavi protokolleri", () => {
  const adimlar = (...ids: string[]) => JSON.stringify(ids.map((id) => ({ islem_tanimi_id: id, not: "" })));

  it("yalnız klinik_admin; protokol + adımlar tek transaction; başka kliniğin tedavisi reddedilir ve hiçbir şey yazılmaz", async () => {
    as(resepsiyon1, K1.klinik, "resepsiyon");
    expect((await tedaviProtokoluOlustur(null, fd({ ad: "Protokol A", adimlar_json: adimlar(K1.islem) })))?.message).toBe(YETKISIZ_MESAJI);
    as(admin1, K1.klinik, "klinik_admin");
    const once = (await sql<{ n: number }>("select count(*)::int n from tedavi_protokolu where klinik_id = $1", [K1.klinik]))[0].n;
    expect((await tedaviProtokoluOlustur(null, fd({ ad: "Çapraz", adimlar_json: adimlar(K2.islem) })))?.message).toBe("Seçilen tedavi bulunamadı.");
    expect((await sql<{ n: number }>("select count(*)::int n from tedavi_protokolu where klinik_id = $1", [K1.klinik]))[0].n).toBe(once);
    expect((await tedaviProtokoluOlustur(null, fd({ ad: "Protokol A", adimlar_json: adimlar(K1.islem, K1.islem) })))?.success).toBe(true);
    const p = (await sql<{ id: string }>("select id from tedavi_protokolu where klinik_id = $1 and ad = 'Protokol A'", [K1.klinik]))[0].id;
    expect((await sql<{ n: number }>("select count(*)::int n from tedavi_protokolu_adimi where tedavi_protokolu_id = $1", [p]))[0].n).toBe(2);
    expect((await tedaviProtokoluGuncelle(p, null, fd({ ad: "Protokol A2", adimlar_json: adimlar(K1.islem) })))?.success).toBe(true);
    expect((await sql<{ n: number }>("select count(*)::int n from tedavi_protokolu_adimi where tedavi_protokolu_id = $1", [p]))[0].n).toBe(1);
    // hatalı güncelleme (başka kliniğin tedavisi) eski adımları korur
    expect((await tedaviProtokoluGuncelle(p, null, fd({ ad: "Bozuk", adimlar_json: adimlar(K2.islem) })))?.success).toBe(false);
    expect((await sql<{ n: number }>("select count(*)::int n from tedavi_protokolu_adimi where tedavi_protokolu_id = $1", [p]))[0].n).toBe(1);
    as(admin2, K2.klinik, "klinik_admin");
    expect((await tedaviProtokoluGuncelle(p, null, fd({ ad: "Ele Geçirildi", adimlar_json: adimlar(K2.islem) })))?.message).toBe("Tedavi protokolü bulunamadı.");
  });
});

describe("tablet", () => {
  it("görünüm ayarları yalnız klinik_admin; diğer ayar anahtarları korunur", async () => {
    await tenantdaCalistir(K1.klinik, (c) => c.query(`insert into klinik_ayarlar(klinik_id, ayarlar) values ($1, '{"baska":1}') on conflict (klinik_id) do update set ayarlar = excluded.ayarlar`, [K1.klinik]));
    const f = fd({ hasta_adi_goster: "on", terapist_adi_goster: "on", tema: "koyu" });
    as(resepsiyon1, K1.klinik, "resepsiyon");
    expect((await tabletAyarlariGuncelle(null, f))?.message).toBe(YETKISIZ_MESAJI);
    as(admin1, K1.klinik, "klinik_admin");
    expect((await tabletAyarlariGuncelle(null, f))?.success).toBe(true);
    const a = (await sql<{ ayarlar: Record<string, unknown> }>("select ayarlar from klinik_ayarlar where klinik_id = $1", [K1.klinik]))[0].ayarlar;
    expect(a).toMatchObject({ baska: 1, tablet: { tema: "koyu", hasta_adi_goster: true, islem_adi_goster: false } });
  });

  it("tablet verisi DAR: tanı/açıklama/finans alanı yok; başka kliniğin odası boş döner", async () => {
    const { withTenant } = await import("@/lib/db");
    await sql("update randevu set tani = 'gizli-tani' where id = $1", [K1.randevu]);
    const aralik = { baslangic: new Date(Date.now() - 86400e3).toISOString(), bitis: new Date(Date.now() + 10 * 86400e3).toISOString(), odaId: K1.oda };
    const k1 = await withTenant(tenantBaglami({ klinik: K1.klinik, kullanici: admin1 }), (tx) => tabletRandevulariGetir(tx, aralik));
    expect(k1.length).toBeGreaterThan(0);
    expect(JSON.stringify(k1)).not.toContain("gizli-tani");
    expect(Object.keys(k1[0]).sort()).toEqual(["baslangic", "bitis", "durum", "hasta", "hasta_id", "id", "islem_tanimi", "oda", "terapist"]);
    const k2 = await withTenant(tenantBaglami({ klinik: K2.klinik, kullanici: admin2 }), (tx) => tabletRandevulariGetir(tx, aralik));
    expect(k2).toHaveLength(0);
  });
});
