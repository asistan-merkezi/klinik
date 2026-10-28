// Modül 7 — mesaj içeriği (KVKK), tek kullanımlık bağlantılar, kuyruk işçisi, izin bildirimi (dar DEFINER) ve bakım işleri (bakim_rolu sistem bağlamı).
// Gerçek Postgres (FORCE RLS) + gerçek rol modeli: bakım işleri BAKIM_DATABASE_URL (bakim_rolu) ile bağlanır, tıpkı üretimde olduğu gibi.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ortamKur, personelKur, hastaKur, superBaglan, tenantBaglami, tenantdaCalistir, reddedilmeli, basliklar } from "./yardimci";
import { rpc, sema, withTenant } from "@/lib/db";
import { bakimOturumuAc, type BakimOturumu } from "@/lib/db/bakim";
import { anlikMesajTetikle } from "@/lib/mesaj/anlik-tetikle";
import { bildirimBaglantisiUret } from "@/lib/mesaj/baglanti";
import { baglantiyiCoz } from "@/lib/mesaj/baglanti-coz";
import { alinabilirSatirSayisi, geciciHataSonrasi, kuyrukSatirlariniAl, satiriGonder, sonucuKaydet, type KuyrukSatiri } from "@/lib/mesaj/kuyruk-isle";
import { randevuHatirlatmalariniTara } from "@/lib/mesaj/randevu-hatirlatma-tarama";
import { klinikTemizle } from "@/lib/bakim/temizlik";
import { klinikOnerileriniYaz, sabitTatilleriYaz } from "@/lib/tatil/guncelleme";

let Q: string; // test kliniği
let K1: Record<string, string>;
let K2: Record<string, string>;
let adminQ: string, terapistQ: string, muhasebeQ: string, resepsiyonQ: string, admin2: string;
let PADMIN: string, PTER: string, PMUH: string, HASTA: string;
let oturum: BakimOturumu;

async function sql<T = Record<string, unknown>>(q: string, p: unknown[] = []): Promise<T[]> {
  const c = await superBaglan();
  try {
    return (await c.query(q, p)).rows as T[];
  } finally {
    await c.end();
  }
}
const yaz = (klinik: string, q: string, p: unknown[] = []) => tenantdaCalistir(klinik, (c) => c.query(q, p));
const tx = (klinik: string, kullanici: string) => tenantBaglami({ klinik, kullanici });
const METIN = /^(.+) size bir bildirim gönderdi\. Görüntülemek için: http:\/\/localhost:3000\/b\/([A-Za-z0-9_-]{32,})$/;

beforeAll(async () => {
  const o = ortamKur();
  K1 = o.ids.k1;
  K2 = o.ids.k2;
  Q = randomUUID();
  await yaz(Q, "insert into klinik(id, ad, qr_kisa_kod) values ($1, 'Deneme Klinik', 'bakimdeneme')", [Q]);
  adminQ = (await personelKur({ klinikId: Q, rol: "klinik_admin" })).id;
  terapistQ = (await personelKur({ klinikId: Q, rol: "terapist" })).id;
  muhasebeQ = (await personelKur({ klinikId: Q, rol: "muhasebe" })).id;
  resepsiyonQ = (await personelKur({ klinikId: Q, rol: "resepsiyon" })).id;
  admin2 = (await personelKur({ klinikId: K2.klinik, rol: "klinik_admin" })).id;
  [PADMIN, PTER, PMUH] = [randomUUID(), randomUUID(), randomUUID()];
  await yaz(Q, "insert into personel(id, klinik_id, kullanici_id, ad_soyad, gorev, eposta) values ($1,$2,$3,'Yönetici Kişi','Görevli','yonetici@deneme.test')", [PADMIN, Q, adminQ]);
  await yaz(Q, "insert into personel(id, klinik_id, kullanici_id, ad_soyad, gorev, eposta) values ($1,$2,$3,'Terapist Kişi','Görevli','terapist@deneme.test')", [PTER, Q, terapistQ]);
  await yaz(Q, "insert into personel(id, klinik_id, kullanici_id, ad_soyad, gorev, eposta) values ($1,$2,$3,'Muhasebe Kişi','Görevli','muhasebe@deneme.test')", [PMUH, Q, muhasebeQ]);
  HASTA = (await hastaKur({ klinikId: Q, telefon: "5321112233" })).hastaId;
  await yaz(Q, "update hasta set ad_soyad = 'Ayşe Yılmaz', eposta = 'ayse@deneme.test' where id = $1", [HASTA]);
  oturum = bakimOturumuAc();
});
afterAll(async () => {
  await oturum?.kapat();
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_GONDEREN;
});

const kuyrukSatirlari = (tetikleyici: string, klinik = Q) => sql<{ kanal: string; m: string; anahtar: string; alici_tipi: string }>("select kanal::text, gonderilecek_metin m, idempotency_anahtari anahtar, alici_tipi::text from mesaj_kuyrugu where klinik_id = $1 and tetikleyici_kodu = $2 order by kanal", [klinik, tetikleyici]);
const baglantiSayisi = async (klinik = Q) => Number((await sql<{ n: string }>("select count(*)::text n from bildirim_baglanti where klinik_id = $1", [klinik]))[0].n);

// ---------------------------------------------------------------------------------------------------------------------------------------------
describe("mesaj içeriği: kişisel/sağlık verisi YOK, yalnız klinik adı + tek kullanımlık bağlantı", () => {
  const hosgeldin = (temel: string, klinikId = Q, bag = tx(Q, adminQ)) =>
    withTenant(bag, (t) => anlikMesajTetikle(t, { klinikId, tetikleyiciKodu: "hasta_kayit_hosgeldin", aliciTipi: "hasta", aliciId: HASTA, adres: { telefon: "5321112233", eposta: "ayse@deneme.test" }, klinikAdi: "Deneme Klinik", idempotencyTemeli: temel }));

  it("varsayılan şablon: her kanal satırında yalnız klinik adı ve bağlantı; hasta adı/telefon/e-posta mesajda yok; anahtar klinik kimliğiyle ön ekli", async () => {
    await yaz(Q, "insert into mesaj_kurallari(klinik_id, tetikleyici_kodu, aktif, sms_aktif, mail_aktif, mesaj_metni) values ($1,'hasta_kayit_hosgeldin',true,true,true,'')", [Q]);
    await hosgeldin("t1");
    const satirlar = await kuyrukSatirlari("hasta_kayit_hosgeldin");
    expect(satirlar.map((s) => s.kanal)).toEqual(["mail", "sms"]);
    const tokenlar = new Set<string>();
    for (const s of satirlar) {
      const e = METIN.exec(s.m);
      expect(e, s.m).not.toBeNull();
      expect(e![1]).toBe("Deneme Klinik");
      expect(s.m).not.toMatch(/Ayşe|Yılmaz|5321112233|ayse@/);
      expect(s.anahtar.startsWith(`${Q}:t1:`)).toBe(true);
      tokenlar.add(e![2]);
    }
    expect(tokenlar.size).toBe(2); // her mesaj satırına AYRI tek kullanımlık bağlantı
    expect(await baglantiSayisi()).toBe(2);
    // Veritabanında token'ın kendisi değil yalnız sha256'sı durur.
    const hashler = await sql<{ token_hash: string }>("select token_hash from bildirim_baglanti where klinik_id = $1", [Q]);
    for (const h of hashler) expect(tokenlar.has(h.token_hash)).toBe(false);
  });

  it("aynı olay tekrar tetiklenirse kuyrukta ve bağlantı tablosunda çoğalma olmaz (idempotent)", async () => {
    await hosgeldin("t1");
    await hosgeldin("t1");
    expect((await kuyrukSatirlari("hasta_kayit_hosgeldin")).length).toBe(2);
    expect(await baglantiSayisi()).toBe(2);
  });

  it("KVKK'ya aykırı şablon (bilinmeyen değişken, kimlik/telefon deseni) göndermeden önce de reddedilir: kuyruğa yazılmaz", async () => {
    const hata = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const [i, kotu] of ["Merhaba {{hasta_adi}} {{baglanti}}", "TC 12345678901 {{baglanti}}", "Ara 05321112233 {{baglanti}}", "{{klinik_adi}} IBAN TR330006100519786457841326 {{baglanti}}"].entries()) {
      await yaz(Q, "update mesaj_kurallari set mesaj_metni = $2 where klinik_id = $1 and tetikleyici_kodu = 'hasta_kayit_hosgeldin'", [Q, kotu]);
      await hosgeldin(`kotu${i}`);
    }
    hata.mockRestore();
    expect((await kuyrukSatirlari("hasta_kayit_hosgeldin")).length).toBe(2);
    await yaz(Q, "update mesaj_kurallari set mesaj_metni = 'Selam {{klinik_adi}} {{baglanti}}' where klinik_id = $1 and tetikleyici_kodu = 'hasta_kayit_hosgeldin'", [Q]);
    await hosgeldin("iyi");
    const iyi = (await kuyrukSatirlari("hasta_kayit_hosgeldin")).filter((s) => s.anahtar.includes(":iyi:"));
    expect(iyi.length).toBe(2);
    expect(iyi[0].m).toMatch(/^Selam Deneme Klinik http:\/\/localhost:3000\/b\//);
  });

  it("tenant'a bağlı: başka kliniğin bağlamıyla o kliniğe mesaj yazılamaz", async () => {
    await yaz(K1.klinik, "insert into mesaj_kurallari(klinik_id, tetikleyici_kodu, aktif, sms_aktif, mesaj_metni) values ($1,'hasta_kayit_hosgeldin',true,true,'') on conflict do nothing", [K1.klinik]);
    const once = (await kuyrukSatirlari("hasta_kayit_hosgeldin", K1.klinik)).length;
    await withTenant(tx(Q, adminQ), (t) => anlikMesajTetikle(t, { klinikId: K1.klinik, tetikleyiciKodu: "hasta_kayit_hosgeldin", aliciTipi: "hasta", aliciId: K1.hasta, adres: { telefon: "5550000001", eposta: null }, klinikAdi: "K1", idempotencyTemeli: "capraz" }));
    expect((await kuyrukSatirlari("hasta_kayit_hosgeldin", K1.klinik)).length).toBe(once);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
describe("/b/[token]: tek kullanımlık, süreli, hız sınırlı; oturum AÇMAZ", () => {
  const tokenUret = async (aliciTipi: "personel" | "hasta") => {
    const url = await withTenant(tx(Q, adminQ), (t) => bildirimBaglantisiUret(t, { klinikId: Q, aliciTipi, tetikleyiciKodu: "x" }));
    return url.split("/b/")[1];
  };
  const kullanildi = async (token: string) => (await sql<{ k: Date | null }>("select kullanildi k from bildirim_baglanti where token_hash = encode(sha256(convert_to($1,'UTF8')),'hex')", [token]))[0].k;

  it("personel bağlantısı giriş sayfasına yönlendirir ve ilk kullanımda işaretlenir; ikinci kullanım aynı yanıtı verir", async () => {
    const t = await tokenUret("personel");
    expect(await kullanildi(t)).toBeNull();
    expect(await baglantiyiCoz(t, basliklar("203.0.113.10"))).toEqual({ tur: "yonlendir", yol: "/giris" });
    const ilk = await kullanildi(t);
    expect(ilk).not.toBeNull();
    expect(await baglantiyiCoz(t, basliklar("203.0.113.10"))).toEqual({ tur: "yonlendir", yol: "/giris" });
    expect((await kullanildi(t))!.getTime()).toBe(ilk!.getTime()); // tekrar işaretlenmez
  });

  it("hasta bağlantısı portal giriş sayfasına (klinik kısa koduyla) yönlendirir, yalnız ilk kullanımda", async () => {
    const t = await tokenUret("hasta");
    expect(await baglantiyiCoz(t, basliklar("203.0.113.11"))).toEqual({ tur: "yonlendir", yol: "/portal/bakimdeneme/giris" });
    expect(await baglantiyiCoz(t, basliklar("203.0.113.11"))).toEqual({ tur: "yonlendir", yol: "/giris" });
  });

  it("süresi dolmuş, biçimsiz ve bilinmeyen token'lar AYNI yanıtı verir (ayrım sızdırılmaz) ve süresi dolan işaretlenmez", async () => {
    const t = await tokenUret("hasta");
    await sql("update bildirim_baglanti set son_kullanma = now() - interval '1 minute' where token_hash = encode(sha256(convert_to($1,'UTF8')),'hex')", [t]);
    const bas = basliklar("203.0.113.12");
    expect(await baglantiyiCoz(t, bas)).toEqual({ tur: "yonlendir", yol: "/giris" });
    expect(await kullanildi(t)).toBeNull();
    expect(await baglantiyiCoz("kisa", bas)).toEqual({ tur: "yonlendir", yol: "/giris" });
    expect(await baglantiyiCoz("A".repeat(40), bas)).toEqual({ tur: "yonlendir", yol: "/giris" });
    expect(await baglantiyiCoz("../../etc/passwd" + "a".repeat(30), bas)).toEqual({ tur: "yonlendir", yol: "/giris" });
  });

  it("hız sınırı: aynı IP'den 10 dakikada 30 istekten sonra 429 (fail-closed sayaç)", async () => {
    const bas = basliklar("203.0.113.99");
    let hiz = 0;
    for (let i = 0; i < 40; i++) if ((await baglantiyiCoz("A".repeat(40), bas)).tur === "hiz") hiz++;
    expect(hiz).toBe(10);
  });

  it("DB: istemci rolü bildirim_baglanti'yı OKUYAMAZ ve başka kliniğe bağlantı yazamaz; anonim role yetki yok", async () => {
    await expect(withTenant(tx(Q, adminQ), (t) => t.select().from(sema.bildirimBaglanti))).rejects.toThrow();
    await expect(withTenant(tx(Q, adminQ), (t) => bildirimBaglantisiUret(t, { klinikId: K1.klinik, aliciTipi: "personel", tetikleyiciKodu: "x" }))).rejects.toThrow();
    const c = await superBaglan();
    try {
      await c.query("BEGIN");
      await c.query("SET LOCAL ROLE klinik_anonim");
      await expect(c.query("select * from bildirim_baglantisi_kullan(repeat('a',64))")).rejects.toThrow(/permission denied/);
    } finally {
      await c.query("ROLLBACK").catch(() => {});
      await c.end();
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
describe("izin_talebi_yoneticiye_bildir (dar DEFINER): alıcı rolü klinik_admin'e kilitli, tenant'a bağlı", () => {
  let talep: string;
  beforeAll(async () => {
    await yaz(Q, "insert into mesaj_kurallari(klinik_id, tetikleyici_kodu, aktif, sms_aktif, mail_aktif, whatsapp_aktif, mesaj_metni) values ($1,'personel_izin_talebi_yeni',true,true,true,false,'')", [Q]);
    const r = await withTenant(tx(Q, terapistQ), (t) =>
      rpc<{ personel_izin_talep_olustur: string }>(t, "personel_izin_talep_olustur", { p_personel_id: PTER, p_tip: "mazeret", p_baslangic_tarih: "2026-12-01", p_bitis_tarih: "2026-12-02", p_gerekce: null, p_belge_url: null })
    );
    talep = r[0].personel_izin_talep_olustur;
  });
  const bildir = (kim: ReturnType<typeof tx>, talepId = talep, taban = "http://localhost:3000") => withTenant(kim, (t) => rpc<{ izin_talebi_yoneticiye_bildir: number }>(t, "izin_talebi_yoneticiye_bildir", { p_talep_id: talepId, p_taban: taban }));

  it("DOĞRU bağlam: yalnız bu kliniğin klinik_admin'ine (sms+mail) sabit metin + tek kullanımlık bağlantı kuyruğa yazılır; muhasebe/terapist alıcı OLMAZ; ikinci çağrı 0", async () => {
    const baglantiOnce = await baglantiSayisi();
    expect((await bildir(tx(Q, terapistQ)))[0].izin_talebi_yoneticiye_bildir).toBe(2);
    const satirlar = await sql<{ kanal: string; alici_id: string; alici_adres: string; m: string; alici_tipi: string }>("select kanal::text, alici_id, alici_adres, gonderilecek_metin m, alici_tipi::text from mesaj_kuyrugu where klinik_id = $1 and tetikleyici_kodu = 'personel_izin_talebi_yeni' order by kanal", [Q]);
    expect(satirlar.map((s) => s.kanal)).toEqual(["mail", "sms"]);
    for (const s of satirlar) {
      expect(s.alici_id).toBe(PADMIN);
      expect(s.alici_tipi).toBe("personel");
      expect(METIN.test(s.m), s.m).toBe(true);
      expect(s.m).not.toMatch(/Terapist|mazeret|2026|Aralık/i);
    }
    expect(satirlar.find((s) => s.kanal === "mail")!.alici_adres).toBe("yonetici@deneme.test");
    expect(satirlar.map((s) => s.alici_adres).join(" ")).not.toMatch(/muhasebe@|terapist@/);
    expect(await baglantiSayisi()).toBe(baglantiOnce + 2);
    expect((await bildir(tx(Q, terapistQ)))[0].izin_talebi_yoneticiye_bildir).toBe(0);
    expect(await baglantiSayisi()).toBe(baglantiOnce + 2);
  });

  it("YANLIŞ tenant: başka kliniğin yöneticisi bu talep için bildirim üretemez", async () => {
    await reddedilmeli(bildir(tx(K2.klinik, admin2)), /talep_bulunamadi/);
  });

  it("BAĞLAMSIZ/yetkisiz: talebin sahibi olmayan resepsiyon, hasta ve anonim reddedilir; sahte bağlantı tabanı reddedilir", async () => {
    await reddedilmeli(bildir(tx(Q, resepsiyonQ)), /yetkisiz/);
    const hasta = await hastaKur({ klinikId: Q });
    await reddedilmeli(bildir(tx(Q, hasta.kullaniciId)), /yetkisiz/);
    await reddedilmeli(bildir(tx(Q, terapistQ), talep, "http://evil.test/x?y=1"), /baglanti_gecersiz/);
    await reddedilmeli(bildir(tx(Q, terapistQ), talep, "javascript:alert(1)"), /baglanti_gecersiz/);
    const c = await superBaglan();
    try {
      await c.query("BEGIN");
      await c.query("SET LOCAL ROLE klinik_anonim");
      await expect(c.query("select izin_talebi_yoneticiye_bildir(gen_random_uuid(), 'http://x')")).rejects.toThrow(/permission denied/);
    } finally {
      await c.query("ROLLBACK").catch(() => {});
      await c.end();
    }
  });

  it("eski (10 dakikadan eski) veya beklemede olmayan talep için bildirim üretilmez — genel mesaj kanalı DEĞİL", async () => {
    await sql("update personel_izin_talebi set created_at = now() - interval '1 hour' where id = $1", [talep]);
    await reddedilmeli(bildir(tx(Q, terapistQ)), /talep_bildirimi_gecersiz/);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
describe("kuyruk işçisi: atomik claim, saatlik klinik kotası, tenant sınırı, geri çekilme", () => {
  const ekle = async (klinik: string, n: number) => {
    const c = await superBaglan();
    try {
      await c.query("BEGIN");
      await c.query("select set_config('app.tenant_id', $1, true)", [klinik]);
      await c.query(
        `insert into mesaj_kuyrugu(klinik_id, tetikleyici_kodu, kanal, alici_tipi, alici_id, alici_adres, gonderilecek_metin, idempotency_anahtari)
         select $1,'kuyruk_deneme','sms','hasta',$2,'5320000000','Deneme size bir bildirim gönderdi. Görüntülemek için: http://localhost:3000/b/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','kd:'||gen_random_uuid() from generate_series(1,$3::int)`,
        [klinik, klinik === Q ? HASTA : K1.hasta, n]
      );
      await c.query("COMMIT");
    } finally {
      await c.end();
    }
  };
  const temizle = () => sql("delete from mesaj_kuyrugu where tetikleyici_kodu = 'kuyruk_deneme' or klinik_id = $1", [Q]);

  it("saf kurallar: kota ve geri çekilme", () => {
    expect(alinabilirSatirSayisi(0)).toBe(25);
    expect(alinabilirSatirSayisi(290)).toBe(10);
    expect(alinabilirSatirSayisi(300)).toBe(0);
    expect(alinabilirSatirSayisi(999)).toBe(0);
    const simdi = new Date("2026-10-28T10:00:00Z");
    expect(geciciHataSonrasi(0, simdi)).toEqual({ durum: "beklemede", denemeSayisi: 1, planlananZaman: new Date("2026-10-28T10:05:00Z") });
    expect(geciciHataSonrasi(1, simdi)).toMatchObject({ durum: "beklemede", denemeSayisi: 2, planlananZaman: new Date("2026-10-28T10:30:00Z") });
    expect(geciciHataSonrasi(2, simdi)).toEqual({ durum: "hata", denemeSayisi: 3 });
  });

  it("tur başına en fazla 25 satır alınır; alınanlar 'gonderiliyor' olur; kalan sonraki turda", async () => {
    await temizle();
    await ekle(Q, 30);
    const simdi = new Date(Date.now() + 5_000);
    expect((await oturum.klinikte(Q, (t) => kuyrukSatirlariniAl(t, Q, simdi))).length).toBe(25);
    expect((await oturum.klinikte(Q, (t) => kuyrukSatirlariniAl(t, Q, simdi))).length).toBe(5);
    expect((await sql<{ d: string; n: string }>("select durum::text d, count(*)::text n from mesaj_kuyrugu where tetikleyici_kodu = 'kuyruk_deneme' group by 1"))).toEqual([{ d: "gonderiliyor", n: "30" }]);
    await temizle();
  });

  it("eşzamanlı iki işçi aynı satırı İKİ KEZ almaz", async () => {
    await temizle();
    await ekle(Q, 40);
    const simdi = new Date(Date.now() + 5_000);
    const [a, b] = await Promise.all([oturum.klinikte(Q, (t) => kuyrukSatirlariniAl(t, Q, simdi)), oturum.klinikte(Q, (t) => kuyrukSatirlariniAl(t, Q, simdi))]);
    const idler = [...a, ...b].map((s) => s.id);
    expect(new Set(idler).size).toBe(idler.length);
    await temizle();
  });

  it("saatlik klinik kotası: son saatte 295 gönderim varsa en fazla 5 satır alınır", async () => {
    await temizle();
    const c = await superBaglan();
    try {
      await c.query("BEGIN");
      await c.query("select set_config('app.tenant_id', $1, true)", [Q]);
      await c.query(`insert into mesaj_kuyrugu(klinik_id, tetikleyici_kodu, kanal, alici_tipi, alici_id, alici_adres, gonderilecek_metin, idempotency_anahtari, durum, gonderim_zamani)
                     select $1,'kuyruk_deneme','sms','hasta',$2,'5320000000','m','kota:'||g,'gonderildi',now() from generate_series(1,295) g`, [Q, HASTA]);
      await c.query("COMMIT");
    } finally {
      await c.end();
    }
    await ekle(Q, 20);
    const simdi = new Date(Date.now() + 5_000);
    expect((await oturum.klinikte(Q, (t) => kuyrukSatirlariniAl(t, Q, simdi))).length).toBe(5);
    await temizle();
  });

  it("tenant sınırı: bir kliniğin bağlamı başka kliniğin kuyruğunu göremez/alamaz; takılı satır kurtarılır", async () => {
    await temizle();
    await ekle(K1.klinik, 3);
    const simdi = new Date(Date.now() + 5_000);
    expect((await oturum.klinikte(Q, (t) => kuyrukSatirlariniAl(t, Q, simdi))).length).toBe(0);
    expect((await oturum.klinikte(Q, (t) => kuyrukSatirlariniAl(t, K1.klinik, simdi))).length).toBe(0); // klinik_id verilse de RLS başka tenant'ı göstermez
    await sql("update mesaj_kuyrugu set durum = 'gonderiliyor', isleme_alinma_zamani = now() - interval '20 minutes' where tetikleyici_kodu = 'kuyruk_deneme'");
    expect((await oturum.klinikte(K1.klinik, (t) => kuyrukSatirlariniAl(t, K1.klinik, simdi))).length).toBe(3);
    await temizle();
  });

  it("sonuç kaydı: geçici hata 5 dk sonrasına ertelenir, 3. denemede 'hata'; başarı 'gonderildi'", async () => {
    await temizle();
    await ekle(Q, 3);
    const simdi = new Date(Date.now() + 5_000);
    const al = await oturum.klinikte(Q, (t) => kuyrukSatirlariniAl(t, Q, simdi));
    const [s1, s2, s3] = al;
    expect(await oturum.klinikte(Q, (t) => sonucuKaydet(t, s1, { tur: "gonderildi", saglayiciMesajId: "x1" }, simdi))).toBe("gonderildi");
    expect(await oturum.klinikte(Q, (t) => sonucuKaydet(t, s2, { tur: "gecici", hata: "zaman_asimi" }, simdi))).toBe("beklemede");
    expect(await oturum.klinikte(Q, (t) => sonucuKaydet(t, { ...s3, denemeSayisi: 2 }, { tur: "gecici", hata: "zaman_asimi" }, simdi))).toBe("hata");
    const r = await sql<{ id: string; durum: string; deneme_sayisi: number; planlanan_zaman: Date }>("select id, durum::text, deneme_sayisi, planlanan_zaman from mesaj_kuyrugu where id = $1", [s2.id]);
    expect(r[0].durum).toBe("beklemede");
    expect(r[0].deneme_sayisi).toBe(1);
    expect(r[0].planlanan_zaman.getTime()).toBeGreaterThan(simdi.getTime() + 4 * 60_000);
    // Aynı satırın sonucu İKİNCİ kez yazılamaz (durum artık 'gonderiliyor' değil): çift gönderim kaydı olmaz.
    await oturum.klinikte(Q, (t) => sonucuKaydet(t, s1, { tur: "gecici", hata: "x" }, simdi));
    expect((await sql<{ durum: string }>("select durum::text from mesaj_kuyrugu where id = $1", [s1.id]))[0].durum).toBe("gonderildi");
    await temizle();
  });

  const satir = (kanal: "sms" | "mail", metin: string): KuyrukSatiri => ({ id: randomUUID(), klinikId: Q, kanal, aliciAdres: kanal === "mail" ? "ayse@deneme.test" : "5321112233", metin, tetikleyiciKodu: "x", testMi: false, denemeSayisi: 0, idempotencyAnahtari: `k:${randomUUID()}` });
  const IYI = "Deneme size bir bildirim gönderdi. Görüntülemek için: http://localhost:3000/b/" + "7".repeat(40); // bağlantıdaki rakam dizisi desen taramasına GİRMEZ

  it("gönderim: e-posta Resend'e (sabit konu, düz metin, Idempotency-Key); yapılandırma yoksa SESSİZ GEÇMEZ; kişisel veri desenli metin ağa HİÇ çıkmaz", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "re_123" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    // yapılandırma yok → geçici hata, ağ çağrısı yok
    expect(await satiriGonder(satir("mail", IYI))).toMatchObject({ tur: "gecici" });
    expect(fetchMock).not.toHaveBeenCalled();

    process.env.RESEND_API_KEY = "re_test_anahtar";
    process.env.RESEND_GONDEREN = "Klinik <bildirim@deneme.test>";
    const s = satir("mail", IYI);
    expect(await satiriGonder(s)).toEqual({ tur: "gonderildi", saglayiciMesajId: "re_123" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const govde = JSON.parse(init.body as string);
    expect(govde).toEqual({ from: "Klinik <bildirim@deneme.test>", to: ["ayse@deneme.test"], subject: "Klinik bildirimi", text: IYI });
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe(s.idempotencyAnahtari);

    fetchMock.mockClear();
    expect(await satiriGonder(satir("mail", "Sayın Ayşe, TC 12345678901 ile kayıt"))).toMatchObject({ tur: "kalici", durum: "iptal", hata: "icerik_kurali_ihlali" });
    expect(await satiriGonder(satir("sms", "Ara 05321112233 hemen"))).toMatchObject({ tur: "kalici", durum: "iptal" });
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 422 }));
    expect(await satiriGonder(satir("mail", IYI))).toMatchObject({ tur: "kalici", durum: "hata" });
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 429 }));
    expect(await satiriGonder(satir("mail", IYI))).toMatchObject({ tur: "gecici" });
  });

  it("SMS/WhatsApp: merkez yapılandırılmamışsa geçici hata (kredi/gönderim yok); kuyruk satırı kaybolmaz", async () => {
    expect(await satiriGonder(satir("sms", IYI))).toMatchObject({ tur: "gecici" });
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
describe("bakım işleri (bakim_rolu sistem bağlamı): hatırlatma, temizlik, resmi tatil, audit bölümleri", () => {
  it("randevu hatırlatma taraması: pencerede olan randevu için TEK mesaj; tekrar tarama çoğaltmaz; yalnız kendi kliniği", async () => {
    await yaz(K1.klinik, "insert into mesaj_kurallari(klinik_id, tetikleyici_kodu, aktif, sms_aktif, mesaj_metni) values ($1,'randevu_hatirlatma_1gun',true,true,'') on conflict (klinik_id, tetikleyici_kodu) do update set aktif = true, sms_aktif = true, mesaj_metni = ''", [K1.klinik]);
    await yaz(K1.klinik, "update hasta set telefon = '5550000001' where id = $1", [K1.hasta]);
    await yaz(K1.klinik, "insert into randevu(klinik_id, hasta_id, terapist_id, oda_id, baslangic, bitis, durum, created_at) values ($1,$2,$3,$4, now() + interval '23 hours 30 minutes', now() + interval '24 hours', 'planlandi', now() - interval '3 days')", [K1.klinik, K1.hasta, K1.terapist, K1.oda]);
    const once = (await kuyrukSatirlari("randevu_hatirlatma_1gun", K1.klinik)).length;
    const t1 = await oturum.klinikte(K1.klinik, (t) => randevuHatirlatmalariniTara(t, K1.klinik));
    expect(t1.find((x) => x.kod === "randevu_hatirlatma_1gun")!.tarananRandevu).toBeGreaterThanOrEqual(1);
    const sonra = await kuyrukSatirlari("randevu_hatirlatma_1gun", K1.klinik);
    expect(sonra.length).toBe(once + 1);
    expect(sonra[sonra.length - 1].m).toMatch(METIN);
    await oturum.klinikte(K1.klinik, (t) => randevuHatirlatmalariniTara(t, K1.klinik));
    expect((await kuyrukSatirlari("randevu_hatirlatma_1gun", K1.klinik)).length).toBe(once + 1);
    // Q kliniğinin bağlamında K1 randevuları taranmaz
    expect((await kuyrukSatirlari("randevu_hatirlatma_1gun", Q)).length).toBe(0);
  });

  it("temizlik: 2 günden eski islem_anahtari ve 1 günden eski süresi dolmuş bağlantılar silinir; yenilere ve başka kliniğe dokunmaz; ikinci çalışma 0", async () => {
    await yaz(Q, "insert into islem_anahtari(klinik_id, anahtar, islem, olusturma) values ($1, gen_random_uuid(), 'eski', now() - interval '3 days'), ($1, gen_random_uuid(), 'yeni', now())", [Q]);
    await yaz(K1.klinik, "insert into islem_anahtari(klinik_id, anahtar, islem, olusturma) values ($1, gen_random_uuid(), 'k1-eski', now() - interval '3 days')", [K1.klinik]);
    await yaz(Q, "insert into bildirim_baglanti(klinik_id, token_hash, alici_tipi, son_kullanma) values ($1, repeat('a',64), 'personel', now() - interval '2 days'), ($1, repeat('b',64), 'personel', now() + interval '1 hour')", [Q]);
    const s1 = await oturum.klinikte(Q, (t) => klinikTemizle(t));
    expect(s1.islemAnahtari).toBe(1);
    expect(s1.bildirimBaglanti).toBe(1);
    expect(await oturum.klinikte(Q, (t) => klinikTemizle(t))).toEqual({ islemAnahtari: 0, bildirimBaglanti: 0 });
    expect((await sql<{ islem: string }>("select islem from islem_anahtari where klinik_id = $1 and islem in ('eski','yeni')", [Q])).map((r) => r.islem)).toEqual(["yeni"]);
    expect(Number((await sql<{ n: string }>("select count(*)::text n from islem_anahtari where klinik_id = $1", [K1.klinik]))[0].n)).toBeGreaterThanOrEqual(1);
    await oturum.klinikte(K1.klinik, (t) => klinikTemizle(t));
  });

  it("resmi tatil: sabit tatiller global ve İDEMPOTENT; öneriler klinik başına, ikinci çalışmada 0; başka kliniğe öneri yazılamaz", async () => {
    const yillar = [2036, 2037];
    const ilk = await oturum.global((t) => sabitTatilleriYaz(t, yillar));
    expect(ilk).toBeGreaterThan(0);
    expect(await oturum.global((t) => sabitTatilleriYaz(t, yillar))).toBe(0);
    expect(Number((await sql<{ n: string }>("select count(*)::text n from resmi_tatil where klinik_id is null and tarih >= '2036-01-01' and tarih < '2038-01-01'"))[0].n)).toBe(ilk);

    const oneriler = new Map([[2036, [{ bayram: "ramazan" as const, tarih: "2036-10-01", ad: "Ramazan Bayramı" }]]]);
    expect(await oturum.klinikte(Q, (t) => klinikOnerileriniYaz(t, Q, oneriler, yillar))).toBe(1);
    expect(await oturum.klinikte(Q, (t) => klinikOnerileriniYaz(t, Q, oneriler, yillar))).toBe(0);
    await expect(oturum.klinikte(K1.klinik, (t) => klinikOnerileriniYaz(t, Q, new Map([[2037, [{ bayram: "kurban" as const, tarih: "2037-06-01", ad: "Kurban Bayramı" }]]]), yillar))).rejects.toThrow();
  });

  it("audit_log bölümleri: bakim_rolu çağırır, ikinci çalışma yeni bölüm açmaz", async () => {
    await oturum.global((t) => rpc(t, "audit_log_bolum_olustur", { p_ileri_ay: 3 }));
    const r = await oturum.global((t) => rpc<{ audit_log_bolum_olustur: { olusturulan: string[]; varsayilan_satir: number } }>(t, "audit_log_bolum_olustur", { p_ileri_ay: 3 }));
    expect(r[0].audit_log_bolum_olustur.olusturulan).toEqual([]);
  });

  it("sistem bağlamı SINIRLI: klinik bağlamsız (global) transaction tenant verisi okuyamaz; yazma yalnız tanımlı tablolara", async () => {
    await expect(oturum.global((t) => t.select().from(sema.hasta))).rejects.toThrow();
    await expect(oturum.global((t) => t.select().from(sema.mesajKuyrugu))).rejects.toThrow();
    // Sistem bağlamında bile hasta tablosuna yazma/silme yetkisi yok.
    await expect(oturum.klinikte(Q, (t) => t.delete(sema.hasta).returning({ id: sema.hasta.id }))).rejects.toThrow();
    expect(Number((await sql<{ n: string }>("select count(*)::text n from hasta where klinik_id = $1", [Q]))[0].n)).toBeGreaterThan(0);
    await expect(oturum.klinikte("not-a-uuid", async () => 1)).rejects.toThrow(/geçersiz klinik/);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
describe("paketlenmiş betikler (esbuild, tek dosya): gerçek süreç, çıkış kodları, günlük", () => {
  let dizin: string;
  beforeAll(() => {
    dizin = mkdtempSync(join(tmpdir(), "bakim-"));
    execFileSync(process.execPath, ["scripts/bakim/derle.mjs", dizin], { cwd: process.cwd(), stdio: "pipe" });
  }, 120_000);
  const calistir = (betik: string, env: Record<string, string>) => {
    try {
      const cikti = execFileSync(process.execPath, [join(dizin, `${betik}.mjs`)], { env: { PATH: process.env.PATH ?? "", ...env } as unknown as NodeJS.ProcessEnv, stdio: "pipe", timeout: 60_000 }).toString();
      return { kod: 0, cikti };
    } catch (e) {
      const h = e as { status: number; stdout: Buffer; stderr: Buffer };
      return { kod: h.status, cikti: h.stdout.toString() + h.stderr.toString() };
    }
  };

  it("audit-log-bolum-olustur: doğru kimlikle çıkış 0 ve JSON günlük; bağlantı yoksa çıkış 2", () => {
    const iyi = calistir("audit-log-bolum-olustur", { BAKIM_DATABASE_URL: process.env.BAKIM_DATABASE_URL! });
    expect(iyi.kod, iyi.cikti).toBe(0);
    expect(iyi.cikti).toMatch(/"mesaj":"bitti"/);
    const yok = calistir("audit-log-bolum-olustur", {});
    expect(yok.kod).toBe(2);
    expect(yok.cikti).toMatch(/BAKIM_DATABASE_URL/);
    expect(yok.cikti).not.toMatch(/b-deneme/); // parola günlüğe yazılmaz
  });

  it("temizlik betiği de çıkış 0/1 ile biter (diğer betikler ortak test veritabanının durumunu değiştirmemesi için burada çalıştırılmaz; çekirdekleri yukarıda/dönem testinde doğrudan sınanır)", () => {
    for (const ad of ["temizlik"]) {
      const r = calistir(ad, { BAKIM_DATABASE_URL: process.env.BAKIM_DATABASE_URL!, BETTER_AUTH_URL: "http://localhost:3000" });
      expect([0, 1], `${ad}: ${r.cikti}`).toContain(r.kod);
      expect(r.cikti).toMatch(/"seviye":"(bilgi|uyari)","mesaj":"bitti/);
    }
  }, 180_000);
});
