// Modül 2 — hasta, portal, belge, QR/anonim akışlar: gerçek eylem/servis kodu + gerçek Postgres.
import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hastaKur, ortamKur, personelKur, superBaglan, tenantBaglami, tenantdaCalistir } from "./yardimci";
import { oturumAc, oturumKapat, sonrasiniBekle } from "./oturum-durumu";
import { hastaOlustur, hastaGuncelle, kvkkOnayVer } from "@/app/(app)/panel/hastalar/actions";
import { borcDuzenle, bakiyeHareketiEkle, portalErisimiAc, riskBayragiEkle, talepOneriGonder } from "@/app/(app)/panel/hastalar/[id]/actions";
import { iptalTalebiOlustur, randevuTalebiOlustur, bilgileriGuncelle } from "@/app/(app)/portal/actions";
import { hastaQrKayitOlustur } from "@/app/(app)/kayit/hasta/[kisaKod]/actions";
import { anketYanitiOlustur } from "@/app/(app)/anket/[kisaKod]/actions";
import { seansDegerlendirmeOlustur } from "@/app/(app)/anket/seans/[randevuId]/actions";
import { belgeIcerigiGetir, belgeYukle } from "@/lib/belge/servis";
import { belgeYoluCoz } from "@/lib/dosya/belge";
import { icerikTipiDogrula } from "@/lib/dosya/imza";
import { YETKISIZ_MESAJI } from "@/lib/auth/yetki";

let K1: Record<string, string>;
let K2: Record<string, string>;
let admin2: string, resepsiyon1: string, terapist1: string, muhasebe1: string;
let belgeId = "";
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const ip = (x: string) => ((globalThis as unknown as { __testIp: string }).__testIp = x);
const as = (id: string, k: string, rol: "klinik_admin" | "resepsiyon" | "terapist" | "muhasebe") => oturumAc({ userId: id, klinikId: k, rol });

beforeAll(async () => {
  const o = ortamKur();
  K1 = o.ids.k1;
  K2 = o.ids.k2;
  process.env.DOSYA_KOKU = fs.mkdtempSync(path.join(os.tmpdir(), "klinik-dosya-"));
  resepsiyon1 = (await personelKur({ klinikId: K1.klinik, rol: "resepsiyon" })).id;
  terapist1 = (await personelKur({ klinikId: K1.klinik, rol: "terapist" })).id;
  muhasebe1 = (await personelKur({ klinikId: K1.klinik, rol: "muhasebe" })).id;
  admin2 = (await personelKur({ klinikId: K2.klinik, rol: "klinik_admin" })).id;
});

async function sql<T = Record<string, unknown>>(q: string, p: unknown[] = []): Promise<T[]> {
  const c = await superBaglan();
  try {
    return (await c.query(q, p)).rows as T[];
  } finally {
    await c.end();
  }
}

describe("hasta eylemleri: rol, tenant, audit", () => {
  it("resepsiyon hasta açar (klinik oturumdan); terapist açamaz; audit_log'a satır düşer", async () => {
    as(resepsiyon1, K1.klinik, "resepsiyon");
    const tel = "+90" + String(Date.now()).slice(-10);
    expect((await hastaOlustur(null, fd({ ad_soyad: "Ayşe Test", telefon: tel })))?.success).toBe(true);
    await sonrasiniBekle();
    const h = (await sql<{ id: string; klinik_id: string }>("select id, klinik_id from hasta where telefon = $1", [tel]))[0];
    expect(h.klinik_id).toBe(K1.klinik);
    expect((await sql("select 1 from audit_log where hedef_tablo = 'hasta' and hedef_id = $1", [h.id])).length).toBeGreaterThan(0);
    as(terapist1, K1.klinik, "terapist");
    expect(await hastaOlustur(null, fd({ ad_soyad: "Yetkisiz", telefon: tel + "1" }))).toEqual({ success: false, message: YETKISIZ_MESAJI });
    as(muhasebe1, K1.klinik, "muhasebe");
    expect((await hastaGuncelle(K1.hasta, null, fd({ ad_soyad: "X Y", telefon: "5551112233" })))?.success).toBe(false);
  });

  it("başka kliniğin yöneticisi K1 hastasını güncelleyemez/KVKK onaylayamaz/risk ekleyemez/ödeme yazamaz", async () => {
    as(admin2, K2.klinik, "klinik_admin");
    expect((await hastaGuncelle(K1.hasta, null, fd({ ad_soyad: "Ele Geçirildi", telefon: "5551112233" })))?.message).toBe("Hasta bulunamadı.");
    expect((await kvkkOnayVer(K1.hasta))?.success).toBe(false);
    expect((await riskBayragiEkle(K1.hasta, null, fd({ tip: "alerji", aciklama: "x", seviye: "orta" })))?.message).toBe("Hasta bulunamadı.");
    expect((await bakiyeHareketiEkle(K1.hasta, null, fd({ tur: "odeme", tutar: "10", tarih: "2026-10-01", odeme_yontemi: "nakit" })))?.message).toBe("Hasta bulunamadı.");
    expect((await talepOneriGonder(K1.hasta, null, fd({ tur: "randevu_iptali", randevu_id: K1.randevu })))?.message).toBe("Hasta bulunamadı.");
    expect((await sql<{ ad_soyad: string }>("select ad_soyad from hasta where id = $1", [K1.hasta]))[0].ad_soyad).not.toBe("Ele Geçirildi");
  });

  it("finans: terapist ödeme ekleyemez; resepsiyon ekler (audit); başka hastanın borcu düzenlenemez; risk bayrakları birikir", async () => {
    as(terapist1, K1.klinik, "terapist");
    expect((await bakiyeHareketiEkle(K1.hasta, null, fd({ tur: "odeme", tutar: "10", tarih: "2026-10-01", odeme_yontemi: "nakit" })))?.success).toBe(false);
    as(resepsiyon1, K1.klinik, "resepsiyon");
    expect((await bakiyeHareketiEkle(K1.hasta, null, fd({ tur: "odeme", tutar: "125.50", tarih: "2026-10-01", odeme_yontemi: "nakit" })))?.success).toBe(true);
    await sonrasiniBekle();
    const h = (await sql<{ id: string }>("select id from hasta_bakiye_hareket where hasta_id = $1 and tutar = 125.50 order by created_at desc limit 1", [K1.hasta]))[0];
    expect((await sql("select 1 from audit_log where hedef_tablo = 'hasta_bakiye_hareket' and hedef_id = $1", [h.id])).length).toBeGreaterThan(0);
    const diger = await hastaKur({ klinikId: K1.klinik });
    const borcId = randomUUID();
    await tenantdaCalistir(K1.klinik, (c) => c.query("insert into hasta_bakiye_hareket(id, klinik_id, hasta_id, tur, tutar) values ($1,$2,$3,'borc',100)", [borcId, K1.klinik, diger.hastaId]));
    expect((await borcDuzenle(K1.hasta, borcId, null, fd({ iskonto_tutari: "10" })))?.success).toBe(false);
    expect((await riskBayragiEkle(K1.hasta, null, fd({ tip: "alerji", aciklama: "a", seviye: "orta" })))?.success).toBe(true);
    expect((await riskBayragiEkle(K1.hasta, null, fd({ tip: "diyabet", aciklama: "b", seviye: "dusuk" })))?.success).toBe(true);
    expect((await sql<{ n: number }>("select jsonb_array_length(risk_bayraklari) n from hasta where id = $1", [K1.hasta]))[0].n).toBeGreaterThanOrEqual(2);
  });

  it("portal erişimi açılır, ikinci kez reddedilir, başka klinik açamaz", async () => {
    const yeni = randomUUID();
    await tenantdaCalistir(K1.klinik, (c) => c.query("insert into hasta(id, klinik_id, ad_soyad, telefon) values ($1,$2,'Portal Aday',$3)", [yeni, K1.klinik, "5" + String(Date.now()).slice(-9)]));
    as(admin2, K2.klinik, "klinik_admin");
    expect((await portalErisimiAc(yeni))?.success).toBe(false);
    as(resepsiyon1, K1.klinik, "resepsiyon");
    const s = await portalErisimiAc(yeni);
    expect(s?.success, JSON.stringify(s)).toBe(true);
    expect(s?.geciciSifre).toMatch(/^[A-Za-z0-9]{8,}$/);
    expect((await portalErisimiAc(yeni))?.message).toMatch(/zaten/);
  });
});

describe("portal hastası yalnız kendi kaydı (hasta_id oturumdan)", () => {
  it("başka hastanın randevusu için iptal talebi açılamaz; kendi randevusuna açılır; randevu talebi sınırı", async () => {
    const a = await hastaKur({ klinikId: K1.klinik });
    const b = await hastaKur({ klinikId: K1.klinik });
    const rA = randomUUID();
    const rB = randomUUID();
    for (const [rid, h, gun] of [[rA, a.hastaId, 40], [rB, b.hastaId, 41]] as const) {
      await tenantdaCalistir(K1.klinik, (c) =>
        c.query(`insert into randevu(id, klinik_id, hasta_id, terapist_id, oda_id, baslangic, bitis) values ($1,$2,$3,$4,$5, now() + interval '${gun} day', now() + interval '${gun} day 30 minutes')`, [rid, K1.klinik, h, K1.terapist, K1.oda])
      );
    }
    oturumAc({ userId: a.kullaniciId, klinikId: K1.klinik, rol: "hasta", hastaId: a.hastaId });
    expect((await iptalTalebiOlustur(rB, "hack"))?.message).toBe("Randevu bulunamadı.");
    expect((await sql("select 1 from randevu_iptal_talebi where randevu_id = $1", [rB])).length).toBe(0);
    expect((await iptalTalebiOlustur(rA, "gelemem"))?.success).toBe(true);
    expect((await iptalTalebiOlustur(rA))?.message).toMatch(/zaten/);
    expect((await randevuTalebiOlustur(null, fd({ islem_tanimi_id: K2.islem, tercih_tarih: "2099-01-01" })))?.success).toBe(false);
    for (let i = 1; i <= 5; i++) expect((await randevuTalebiOlustur(null, fd({ islem_tanimi_id: K1.islem, tercih_tarih: `2027-01-0${i}` })))?.success).toBe(true);
    expect((await randevuTalebiOlustur(null, fd({ islem_tanimi_id: K1.islem, tercih_tarih: "2027-02-01" })))?.message).toMatch(/Yanıt bekleyen/);
  });

  it("portal bilgileri yalnız oturumdaki hastaya yazılır; personel oturumu portal eylemine giremez", async () => {
    const a = await hastaKur({ klinikId: K1.klinik });
    const b = await hastaKur({ klinikId: K1.klinik });
    oturumAc({ userId: a.kullaniciId, klinikId: K1.klinik, rol: "hasta", hastaId: a.hastaId });
    const s = await bilgileriGuncelle(null, fd({ adres: "Test Mah. 1", adres_il: "İstanbul", saglik_riza: "on", alerjiler: "polen" }));
    expect(s?.success, JSON.stringify(s)).toBe(true);
    expect((await sql<{ adres: string }>("select adres from hasta_hassas where hasta_id = $1", [a.hastaId]))[0].adres).toBe("Test Mah. 1");
    expect((await sql("select 1 from hasta_hassas where hasta_id = $1", [b.hastaId])).length).toBe(0);
    as(resepsiyon1, K1.klinik, "resepsiyon");
    await expect(bilgileriGuncelle(null, fd({ adres: "x" }))).rejects.toThrow(/NEXT_REDIRECT/);
  });
});

describe("QR / anonim akışlar", () => {
  const kayit = (o: Record<string, string> = {}) => fd({ ad_soyad: "Qr Hasta", telefon: "5" + String(Math.random()).slice(2, 11), kvkk_onay: "on", ...o });

  it("geçerli kısa kodla kayıt yazılır (klinik koddan); formdaki sahte klinik_id YOK SAYILIR", async () => {
    ip("203.0.113.10");
    oturumKapat();
    const s = await hastaQrKayitOlustur("klinikbir", null, kayit({ klinik_id: K2.klinik }));
    expect(s?.success, JSON.stringify(s)).toBe(true);
    const r = await sql<{ klinik_id: string }>("select klinik_id from hasta where kayit_kanali = 'qr_self_servis' and ad_soyad = 'Qr Hasta' order by created_at desc limit 1");
    expect(r[0].klinik_id).toBe(K1.klinik);
  });

  it("bilinmeyen kısa kod ve KVKK onaysız kayıt reddedilir; başka kliniğin kısa koduyla K1'e yazılamaz", async () => {
    ip("203.0.113.11");
    expect((await hastaQrKayitOlustur("yokboyleklinik", null, kayit()))?.message).toBe("Bu bağlantı geçerli değil.");
    expect((await hastaQrKayitOlustur("klinikbir", null, kayit({ kvkk_onay: "" })))?.success).toBe(false);
    const once = (await sql<{ n: number }>("select count(*)::int n from hasta where klinik_id = $1", [K1.klinik]))[0].n;
    await hastaQrKayitOlustur("klinikiki", null, kayit());
    expect((await sql<{ n: number }>("select count(*)::int n from hasta where klinik_id = $1", [K1.klinik]))[0].n).toBe(once);
  });

  it("kapalı QR kayıt/anket kabul etmez; açılınca kabul eder", async () => {
    ip("203.0.113.12");
    await tenantdaCalistir(K1.klinik, (c) =>
      c.query(`insert into klinik_ayarlar(klinik_id, ayarlar) values ($1, '{"qr_kodlari":{"hasta_on_kayit":{"aktif":false},"anket":{"aktif":false}}}') on conflict (klinik_id) do update set ayarlar = excluded.ayarlar`, [K1.klinik])
    );
    expect((await hastaQrKayitOlustur("klinikbir", null, kayit()))?.message).toBe("Bu kayıt bağlantısı artık aktif değil.");
    expect((await anketYanitiOlustur("klinikbir", null, fd({ puan: "5" })))?.message).toBe("Bu anket bağlantısı artık aktif değil.");
    await tenantdaCalistir(K1.klinik, (c) => c.query(`update klinik_ayarlar set ayarlar = '{}' where klinik_id = $1`, [K1.klinik]));
    expect((await anketYanitiOlustur("klinikbir", null, fd({ puan: "5", oneri_metni: "güzel" })))?.success).toBe(true);
  });

  it("hız sınırı çalışır: aynı IP'den 10 dk içinde 10'dan fazla anket reddedilir", async () => {
    ip("203.0.113.99");
    let red = 0;
    for (let i = 0; i < 13; i++) if (!(await anketYanitiOlustur("klinikbir", null, fd({ puan: "4" })))?.success) red++;
    expect(red).toBeGreaterThanOrEqual(3);
  });

  it("seans anketi: tamamlanmamış randevuya yazılamaz, tamamlanmışa tek kez yazılır", async () => {
    ip("203.0.113.20");
    const rid = randomUUID();
    await tenantdaCalistir(K1.klinik, (c) =>
      c.query("insert into randevu(id, klinik_id, hasta_id, terapist_id, oda_id, baslangic, bitis, durum) values ($1,$2,$3,$4,$5, now() + interval '50 day', now() + interval '50 day 30 minutes', 'planlandi')", [rid, K1.klinik, K1.hasta, K1.terapist, K1.oda])
    );
    expect((await seansDegerlendirmeOlustur(rid, null, fd({ puan: "5" })))?.success).toBe(false);
    await sql("update randevu set durum = 'tamamlandi' where id = $1", [rid]);
    expect((await seansDegerlendirmeOlustur(rid, null, fd({ puan: "5" })))?.success).toBe(true);
    expect((await seansDegerlendirmeOlustur(rid, null, fd({ puan: "4" })))?.message).toBe("Bu seans için zaten bir değerlendirme alındı.");
  });
});

describe("belge: disk, yetki, tenant, imza, path traversal, audit", () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
  const girdi = (hastaId: string, veri = png, mime = "image/png") => ({ hastaId, kategori: "dokuman" as const, belgeTuru: "diger", cekimTarihi: "2026-10-01", bolge: null, karsilastirmaGrubuId: null, asama: null, onamId: null, not: null, cekenKurum: null, mime, veri });

  it("imza doğrulama: baytlar bildirilen türle eşleşmeli", () => {
    expect(icerikTipiDogrula("image/png", png)).toBe(true);
    expect(icerikTipiDogrula("image/jpeg", png)).toBe(false);
    expect(icerikTipiDogrula("application/pdf", Buffer.from("%PDF-1.7 ..."))).toBe(true);
    expect(icerikTipiDogrula("application/pdf", Buffer.from("<html><script>"))).toBe(false);
    expect(icerikTipiDogrula("text/html", Buffer.from("x"))).toBe(false);
  });

  it("path traversal ve yabancı klinik yolu reddedilir", () => {
    const u = randomUUID();
    for (const kotu of ["../../etc/passwd", `${K1.klinik}/../${u}/dokuman/${u}.png`, `${K1.klinik}/${u}/dokuman/${u}.exe`, `${K1.klinik}\\${u}\\dokuman\\${u}.png`, "/abs/yol.png"]) {
      expect(() => belgeYoluCoz(kotu, K1.klinik), kotu).toThrow();
    }
    expect(() => belgeYoluCoz(`${K2.klinik}/${u}/dokuman/${u}.png`, K1.klinik)).toThrow(/başka bir kliniğe/);
  });

  it("sahte imzalı dosya reddedilir; geçerli dosya diske yazılır; indirmede audit select+indirme, küçük resimde iz yok", async () => {
    const bag = tenantBaglami({ klinik: K1.klinik, kullanici: resepsiyon1 });
    expect(await belgeYukle({ bag, rol: "resepsiyon", girdi: girdi(K1.hasta, Buffer.from("<script>alert(1)</script>"), "image/png") })).toMatchObject({ tur: "hata", durum: 400 });
    expect(await belgeYukle({ bag, rol: "resepsiyon", girdi: girdi(K1.hasta, Buffer.from("<html>"), "text/html") })).toMatchObject({ tur: "hata", durum: 400 });
    const ok = await belgeYukle({ bag, rol: "resepsiyon", girdi: girdi(K1.hasta) });
    expect(ok.tur).toBe("ok");
    belgeId = (ok as { id: string }).id;
    const kayit = (await sql<{ storage_path: string }>("select storage_path from hasta_belge where id = $1", [belgeId]))[0];
    expect(fs.existsSync(path.join(process.env.DOSYA_KOKU!, "hasta-belge", ...kayit.storage_path.split("/")))).toBe(true);

    expect((await belgeIcerigiGetir({ bag, rol: "resepsiyon", belgeId, islem: "indir" })).tur).toBe("ok");
    const izler = await sql<{ eylem: string }>("select eylem from audit_log where hedef_tablo = 'hasta_belge' and hedef_id = $1", [belgeId]);
    expect(izler.map((x) => x.eylem)).toEqual(expect.arrayContaining(["select", "indirme"]));
    await belgeIcerigiGetir({ bag, rol: "resepsiyon", belgeId, islem: "kucuk" });
    expect((await sql("select 1 from audit_log where hedef_tablo = 'hasta_belge' and hedef_id = $1", [belgeId])).length).toBe(izler.length);
  });

  it("başka klinik, muhasebe ve portal belgeyi göremez/yükleyemez; başka kliniğin hastasına belge yazılamaz", async () => {
    const bag2 = tenantBaglami({ klinik: K2.klinik, kullanici: admin2 });
    expect(await belgeIcerigiGetir({ bag: bag2, rol: "klinik_admin", belgeId, islem: "goruntule" })).toEqual({ tur: "yok" });
    const bagM = tenantBaglami({ klinik: K1.klinik, kullanici: muhasebe1 });
    expect(await belgeIcerigiGetir({ bag: bagM, rol: "muhasebe", belgeId, islem: "goruntule" })).toEqual({ tur: "yetkisiz" });
    expect(await belgeIcerigiGetir({ bag: bagM, rol: "hasta", belgeId, islem: "goruntule" })).toEqual({ tur: "yetkisiz" });
    expect((await belgeYukle({ bag: bagM, rol: "muhasebe", girdi: girdi(K1.hasta) })).tur).toBe("hata");
    expect(await belgeYukle({ bag: bag2, rol: "klinik_admin", girdi: girdi(K1.hasta) })).toMatchObject({ tur: "hata", durum: 404 });
  });
});
