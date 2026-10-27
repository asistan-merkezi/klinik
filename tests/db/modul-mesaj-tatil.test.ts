// Modül 2 — kullanıcı bağlamıyla mesaj kuyruğu (0011 politikaları), elle mesaj, resmi tatil ve QR yönetim eylemleri.
import { beforeAll, describe, expect, it } from "vitest";
import { ortamKur, personelKur, superBaglan, tenantdaCalistir } from "./yardimci";
import { oturumAc, sonrasiniBekle } from "./oturum-durumu";
import { randevuOlustur } from "@/app/(app)/panel/randevular/actions";
import { hastaMesajiGonder, hastaMesajSecenekleriGetir } from "@/app/(app)/panel/hastalar/[id]/mesaj-actions";
import { tatilEkle, tatilSil, onerileriKontrolEt } from "@/app/(app)/panel/ayarlar/resmi-tatiller/actions";
import { qrKoduDurumGuncelle } from "@/app/(app)/panel/ayarlar/qr-kodlar/actions";

let K1: Record<string, string>;
let K2: Record<string, string>;
let admin1: string, resepsiyon1: string, terapist1: string, admin2: string;
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

beforeAll(async () => {
  const o = ortamKur();
  K1 = o.ids.k1;
  K2 = o.ids.k2;
  admin1 = (await personelKur({ klinikId: K1.klinik, rol: "klinik_admin" })).id;
  resepsiyon1 = (await personelKur({ klinikId: K1.klinik, rol: "resepsiyon" })).id;
  terapist1 = (await personelKur({ klinikId: K1.klinik, rol: "terapist" })).id;
  admin2 = (await personelKur({ klinikId: K2.klinik, rol: "klinik_admin" })).id;
  await tenantdaCalistir(K1.klinik, async (c) => {
    await c.query("update hasta set eposta = 'a@b.test', telefon = '5321234567' where id = $1", [K1.hasta]);
    for (const kod of ["randevu_onay"]) {
      await c.query("insert into mesaj_kurallari(klinik_id, tetikleyici_kodu, aktif, sms_aktif, mesaj_metni) values ($1,$2,true,true,'') on conflict do nothing", [K1.klinik, kod]);
    }
  });
});

describe("mesaj kuyruğu: kullanıcı bağlamıyla yazım", () => {
  it("randevu oluşturulunca aktif kural varsa resepsiyonun bağlamıyla kuyruğa satır düşer (kişisel veri içermeyen şablon değişkenleri doldurulur)", async () => {
    oturumAc({ userId: resepsiyon1, klinikId: K1.klinik, rol: "resepsiyon" });
    const tarih = "2032-03-01";
    const s = await randevuOlustur(null, fd({ hasta_id: K1.hasta, terapist_id: K1.terapist, oda_id: K1.oda, islem_tanimi_id: K1.islem, tarih, saat: "10:00", sure_dakika: "30" }));
    expect(s?.success).toBe(true);
    await sonrasiniBekle();
    const q = await sql<{ kanal: string; durum: string; klinik_id: string }>("select kanal::text, durum::text, klinik_id from mesaj_kuyrugu where tetikleyici_kodu = 'randevu_onay' and klinik_id = $1", [K1.klinik]);
    expect(q.length).toBeGreaterThan(0);
    expect(q[0]).toMatchObject({ kanal: "sms", durum: "beklemede", klinik_id: K1.klinik });
  });

  it("elle mesaj: yalnız admin/resepsiyon; terapist ve başka klinik reddedilir; kuyruğa 'beklemede' yazılır", async () => {
    oturumAc({ userId: terapist1, klinikId: K1.klinik, rol: "terapist" });
    expect(await hastaMesajiGonder(K1.hasta, { kod: "hasta_kayit_hosgeldin", metin: "x", kanallar: ["sms"] })).toMatchObject({ success: false });
    oturumAc({ userId: admin2, klinikId: K2.klinik, rol: "klinik_admin" });
    expect((await hastaMesajiGonder(K1.hasta, { kod: "hasta_kayit_hosgeldin", metin: "x", kanallar: ["sms"] })).message).toBe("Hasta bulunamadı.");
    oturumAc({ userId: resepsiyon1, klinikId: K1.klinik, rol: "resepsiyon" });
    const sec = await hastaMesajSecenekleriGetir(K1.hasta);
    expect("secenekler" in sec && sec.secenekler.length).toBeGreaterThan(0);
    const s = await hastaMesajiGonder(K1.hasta, { kod: "hasta_kayit_hosgeldin", metin: "Merhaba", kanallar: ["sms", "mail"] });
    expect(s.success, JSON.stringify(s)).toBe(true);
    const q = await sql("select 1 from mesaj_kuyrugu where tetikleyici_kodu = 'hasta_kayit_hosgeldin' and alici_id = $1 and idempotency_anahtari like 'manuel:%'", [K1.hasta]);
    expect(q.length).toBe(2);
  });

  it("kullanıcı kuyruk satırını GÜNCELLEYEMEZ/SİLEMEZ ve başka kliniğe satır ekleyemez (yalnız dar INSERT)", async () => {
    const { withTenant, sema } = await import("@/lib/db");
    const { tenantBaglami } = await import("./yardimci");
    const { eq } = await import("drizzle-orm");
    const bag = tenantBaglami({ klinik: K1.klinik, kullanici: resepsiyon1 });
    // UPDATE politikası yok: RLS satırı göstermez → 0 satır etkilenir (durum değişmez).
    const guncellenen = await withTenant(bag, (tx) => tx.update(sema.mesajKuyrugu).set({ durum: "gonderildi" }).where(eq(sema.mesajKuyrugu.klinikId, K1.klinik)).returning({ id: sema.mesajKuyrugu.id }));
    expect(guncellenen).toHaveLength(0);
    expect((await sql("select 1 from mesaj_kuyrugu where durum <> 'beklemede' and klinik_id = $1", [K1.klinik])).length).toBe(0);
    await expect(
      withTenant(bag, (tx) => tx.insert(sema.mesajKuyrugu).values({ klinikId: K2.klinik, tetikleyiciKodu: "x", kanal: "sms", aliciTipi: "hasta", aliciId: K2.hasta, aliciAdres: "1", gonderilecekMetin: "m", idempotencyAnahtari: "capraz-" + Date.now() }))
    ).rejects.toThrow();
  });
});

describe("resmi tatil ve QR yönetim eylemleri", () => {
  it("klinik özel tatil ekle/sil yalnız klinik_admin; başka klinik silemez; çift tarih reddedilir; kontrol butonu yazmaz", async () => {
    oturumAc({ userId: resepsiyon1, klinikId: K1.klinik, rol: "resepsiyon" });
    expect((await tatilEkle(null, fd({ tarih: "2033-05-05", ad: "Test Tatil" })))?.success).toBe(false);
    oturumAc({ userId: admin1, klinikId: K1.klinik, rol: "klinik_admin" });
    expect((await tatilEkle(null, fd({ tarih: "2033-05-05", ad: "Test Tatil" })))?.success).toBe(true);
    expect((await tatilEkle(null, fd({ tarih: "2033-05-05", ad: "Tekrar" })))?.message).toMatch(/zaten tatil/);
    const id = (await sql<{ id: string }>("select id from resmi_tatil where klinik_id = $1 and tarih = '2033-05-05'", [K1.klinik]))[0].id;
    oturumAc({ userId: admin2, klinikId: K2.klinik, rol: "klinik_admin" });
    expect((await tatilSil(id))?.success).toBe(false);
    oturumAc({ userId: admin1, klinikId: K1.klinik, rol: "klinik_admin" });
    expect((await tatilSil(id))?.success).toBe(true);
    expect((await onerileriKontrolEt())?.success).toBe(false);
  });

  it("QR aç/kapa yalnız klinik_admin; diğer ayar anahtarları korunur", async () => {
    await tenantdaCalistir(K1.klinik, (c) => c.query(`insert into klinik_ayarlar(klinik_id, ayarlar) values ($1, '{"baska":{"x":1}}') on conflict (klinik_id) do update set ayarlar = excluded.ayarlar`, [K1.klinik]));
    oturumAc({ userId: resepsiyon1, klinikId: K1.klinik, rol: "resepsiyon" });
    expect((await qrKoduDurumGuncelle("anket", false))?.success).toBe(false);
    oturumAc({ userId: admin1, klinikId: K1.klinik, rol: "klinik_admin" });
    expect((await qrKoduDurumGuncelle("anket", false))?.success).toBe(true);
    const a = (await sql<{ ayarlar: Record<string, unknown> }>("select ayarlar from klinik_ayarlar where klinik_id = $1", [K1.klinik]))[0].ayarlar;
    expect(a).toMatchObject({ baska: { x: 1 }, qr_kodlari: { anket: { aktif: false } } });
    await tenantdaCalistir(K1.klinik, (c) => c.query(`update klinik_ayarlar set ayarlar = '{}' where klinik_id = $1`, [K1.klinik]));
  });
});
