// Giriş, oturum, şifre ve hesap yaşam döngüsü testleri (gerçek Better Auth + gerçek Postgres, iki klinikli düzenek).
import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { basliklar, cerezBasligi, hastaKur, ortamKur, personelKur, superBaglan } from "./yardimci";
import { proxyKarari } from "@/lib/auth/proxy-karari";
import { testGeceKapanisiDevreDisi, testSaatiAyarla } from "@/lib/auth/gece-kapanis";

let K1: Record<string, string>;
let K2: Record<string, string>;
let ipSayac = 10;
const yeniIp = () => `198.51.100.${++ipSayac}`;
const cihaz = () => randomUUID();

beforeAll(() => {
  testGeceKapanisiDevreDisi(true); // testler günün her saatinde aynı sonucu versin; gece kuralı kendi testinde açıkça sınanır
  const { ids } = ortamKur();
  K1 = ids.k1;
  K2 = ids.k2;
});

afterEach(async () => {
  // hiz_siniri_kullan EXECUTE yetkisi testlerde geri alınmış olabilir: her testten sonra eski haline getir.
  const c = await superBaglan();
  try {
    await c.query("GRANT EXECUTE ON FUNCTION hiz_siniri_kullan(text, integer, integer, boolean) TO klinik_uygulama, klinik_anonim");
  } finally {
    await c.end();
  }
});

async function giris() {
  return import("@/lib/auth/giris");
}
async function oturum() {
  return import("@/lib/auth/oturum");
}

describe("personel girişi (e-posta / telefon) ve oturum bağlamı", () => {
  it("klinik_admin e-posta+parola ile girer; bağlam tenant'ı ve rolü VERİTABANINDAN alır", async () => {
    const { personelGirisi } = await giris();
    const { getSessionContext } = await oturum();
    const p = await personelKur({ klinikId: K1.klinik, rol: "klinik_admin" });
    const s = await personelGirisi({ girisAdi: p.eposta, sifre: p.sifre, basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() });
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    expect(s.sifreDegistirmeli).toBe(true); // geçici şifreyle oluşturuldu
    // İstemci başlıklarıyla tenant kandırılamaz
    const h = cerezBasligi(s.cerezler);
    h.set("x-tenant-id", K2.klinik);
    h.set("x-klinik-id", K2.klinik);
    const ctx = await getSessionContext(h);
    expect(ctx).toMatchObject({ userId: p.id, tenantId: K1.klinik, rol: "klinik_admin", tur: "personel" });
  });

  it("admin TELEFONLA giremez (telefon eşlemesinde yok, genel hata); resepsiyon telefonla girer, e-postayla giremez", async () => {
    const { personelGirisi, MESAJ_HATALI_PERSONEL_TELEFON } = await giris();
    const admin = await personelKur({ klinikId: K1.klinik, rol: "klinik_admin" });
    const adminTel = await personelGirisi({ girisAdi: admin.telefon, sifre: admin.sifre, basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() });
    expect(adminTel).toMatchObject({ ok: false, kod: "hatali", mesaj: MESAJ_HATALI_PERSONEL_TELEFON });

    const resepsiyon = await personelKur({ klinikId: K1.klinik, rol: "resepsiyon" });
    const tel = await personelGirisi({ girisAdi: resepsiyon.telefon, sifre: resepsiyon.sifre, basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() });
    expect(tel.ok).toBe(true);
    const eposta = await personelGirisi({ girisAdi: resepsiyon.eposta, sifre: resepsiyon.sifre, basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() });
    expect(eposta).toMatchObject({ ok: false, kod: "telefonla" });
  });

  it("hata mesajı hesap varlığını sızdırmaz: yanlış şifre = bilinmeyen hesap = devre dışı hesap", async () => {
    const { personelGirisi } = await giris();
    const { hesabiDevreDisiBirak } = await import("@/lib/auth/hesap");
    const p = await personelKur({ klinikId: K1.klinik, rol: "resepsiyon" });
    const yanlisSifre = await personelGirisi({ girisAdi: p.telefon, sifre: "YanlisSifre123", basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() });
    const yok = await personelGirisi({ girisAdi: "5000000000", sifre: "YanlisSifre123", basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() });
    await hesabiDevreDisiBirak(p.id);
    const devreDisi = await personelGirisi({ girisAdi: p.telefon, sifre: p.sifre, basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() });
    for (const s of [yanlisSifre, yok, devreDisi]) expect(s).toMatchObject({ ok: false, kod: "hatali", mesaj: "Telefon veya şifre hatalı." });
  });

  it("oturum yoksa getSessionContext null, requireSessionContext 401; rol yetmezse 403", async () => {
    const { personelGirisi } = await giris();
    const { getSessionContext, requireSessionContext, rolGerekli, OturumHatasi } = await oturum();
    expect(await getSessionContext(new Headers())).toBeNull();
    expect(await getSessionContext(new Headers({ cookie: "klinik.session_token=sahte.deger" }))).toBeNull();
    await expect(requireSessionContext(new Headers())).rejects.toMatchObject({ status: 401 });
    const p = await personelKur({ klinikId: K1.klinik, rol: "terapist" });
    const s = await personelGirisi({ girisAdi: p.telefon, sifre: p.sifre, basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() });
    if (!s.ok) throw new Error("giriş başarısız: " + s.mesaj);
    const ctx = await requireSessionContext(cerezBasligi(s.cerezler));
    expect(() => rolGerekli(ctx, ["klinik_admin", "resepsiyon"])).toThrowError(OturumHatasi);
    try {
      rolGerekli(ctx, ["klinik_admin"]);
    } catch (e) {
      expect((e as InstanceType<typeof OturumHatasi>).status).toBe(403);
    }
    expect(() => rolGerekli(ctx, ["terapist"])).not.toThrow();
  });

  it("cihaz kimliği oturuma yazılır, IP düz saklanmaz (yalnız hash)", async () => {
    const { personelGirisi } = await giris();
    const p = await personelKur({ klinikId: K1.klinik, rol: "resepsiyon" });
    const c = cihaz();
    const ip = yeniIp();
    const s = await personelGirisi({ girisAdi: p.telefon, sifre: p.sifre, basliklar: basliklar(ip), cihazKimligi: c });
    expect(s.ok).toBe(true);
    const sup = await superBaglan();
    try {
      const r = await sup.query("select cihaz_kimligi, ip_hash from oturum where kullanici_id = $1", [p.id]);
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0].cihaz_kimligi).toBe(c);
      expect(r.rows[0].ip_hash).toMatch(/^[0-9a-f]{16}$/);
      expect(JSON.stringify(r.rows[0])).not.toContain(ip);
    } finally {
      await sup.end();
    }
  });
});

describe("hasta portalı girişi (klinik + telefon + parola)", () => {
  it("doğru klinikte girer; bağlam hasta rolü, klinik ve hasta kimliğiyle gelir", async () => {
    const { hastaGirisi } = await giris();
    const { getSessionContext } = await oturum();
    const h = await hastaKur({ klinikId: K1.klinik });
    const s = await hastaGirisi({ klinikKodu: "klinikbir", telefon: h.telefon, sifre: h.sifre, basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() });
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    expect(s.sifreDegistirmeli).toBe(true);
    const ctx = await getSessionContext(cerezBasligi(s.cerezler));
    expect(ctx).toMatchObject({ userId: h.kullaniciId, tenantId: K1.klinik, rol: "hasta", tur: "hasta", hastaId: h.hastaId });
  });

  it("yanlış klinikte başarısız olur; aynı telefon iki klinikte AYRI hesaptır", async () => {
    const { hastaGirisi } = await giris();
    const ortak = "5551230099";
    const h1 = await hastaKur({ klinikId: K1.klinik, telefon: ortak });
    const h2 = await hastaKur({ klinikId: K2.klinik, telefon: ortak });
    const yanlis = await hastaGirisi({ klinikKodu: "klinikiki", telefon: ortak, sifre: h1.sifre, basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() });
    expect(yanlis).toMatchObject({ ok: false, kod: "hatali" });
    const dogru1 = await hastaGirisi({ klinikKodu: "klinikbir", telefon: ortak, sifre: h1.sifre, basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() });
    const dogru2 = await hastaGirisi({ klinikKodu: "klinikiki", telefon: ortak, sifre: h2.sifre, basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() });
    expect(dogru1.ok && dogru2.ok).toBe(true);
    const bilinmeyenKlinik = await hastaGirisi({ klinikKodu: "yok-boyle-klinik", telefon: ortak, sifre: h1.sifre, basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() });
    expect(bilinmeyenKlinik).toMatchObject({ ok: false, kod: "hatali", mesaj: "Telefon veya şifre hatalı." });
  });

  it("geçici şifre süresi (7 gün) dolunca reddedilir ve oturum açılmaz", async () => {
    const { hastaGirisi, MESAJ_GECICI_SURESI_DOLDU } = await giris();
    const h = await hastaKur({ klinikId: K1.klinik });
    const sup = await superBaglan();
    try {
      const sure = await sup.query("select gecici_sifre_bitis > now() + interval '6 days 23 hours' and gecici_sifre_bitis < now() + interval '7 days 1 hour' as tamam from kimlik_kullanici where id = $1", [h.kullaniciId]);
      expect(sure.rows[0].tamam).toBe(true); // oluşturulurken 7 gün
      await sup.query("update kimlik_kullanici set gecici_sifre_bitis = now() - interval '1 minute' where id = $1", [h.kullaniciId]);
      const s = await hastaGirisi({ klinikKodu: "klinikbir", telefon: h.telefon, sifre: h.sifre, basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() });
      expect(s).toMatchObject({ ok: false, kod: "gecici_suresi_doldu", mesaj: MESAJ_GECICI_SURESI_DOLDU });
      expect((await sup.query("select count(*)::int n from oturum where kullanici_id = $1", [h.kullaniciId])).rows[0].n).toBe(0);
    } finally {
      await sup.end();
    }
  });

  it("resepsiyon yeni geçici şifre verince eski şifre ve eski oturumlar geçersiz olur", async () => {
    const { hastaGirisi } = await giris();
    const { getSessionContext } = await oturum();
    const { geciciSifreYenile } = await import("@/lib/auth/hesap");
    const h = await hastaKur({ klinikId: K1.klinik });
    const ilk = await hastaGirisi({ klinikKodu: "klinikbir", telefon: h.telefon, sifre: h.sifre, basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() });
    if (!ilk.ok) throw new Error("ilk giriş başarısız");
    const yeni = await geciciSifreYenile(h.kullaniciId, { hasta: true });
    expect(await getSessionContext(cerezBasligi(ilk.cerezler))).toBeNull();
    const eski = await hastaGirisi({ klinikKodu: "klinikbir", telefon: h.telefon, sifre: h.sifre, basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() });
    expect(eski.ok).toBe(false);
    const yeniGiris = await hastaGirisi({ klinikKodu: "klinikbir", telefon: h.telefon, sifre: yeni.geciciSifre, basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() });
    expect(yeniGiris.ok).toBe(true);
  });
});

describe("ilk girişte şifre değiştirme zorunluluğu ve şifre değiştirme", () => {
  it("geçici şifreyle girişte bayrak açıktır; proxy kararı başka sayfaya geçişi engeller, değiştirince serbest bırakır", async () => {
    const { hastaGirisi } = await giris();
    const { getSessionContext } = await oturum();
    const { sifreDegistir } = await import("@/lib/auth/sifre-islemleri");
    const h = await hastaKur({ klinikId: K1.klinik });
    const s = await hastaGirisi({ klinikKodu: "klinikbir", telefon: h.telefon, sifre: h.sifre, basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() });
    if (!s.ok) throw new Error("giriş başarısız");
    const hdr = cerezBasligi(s.cerezler);
    let ctx = await getSessionContext(hdr);
    expect(ctx?.sifreDegistirmeli).toBe(true);

    // proxy: bayrak açıkken portalın hiçbir sayfası açılmaz, yalnız /sifre-degistir
    const oturumBilgisi = { tur: "hasta" as const, sifreDegistirmeli: true };
    expect(proxyKarari("/portal", oturumBilgisi)).toEqual({ tur: "yonlendir", hedef: "/sifre-degistir" });
    expect(proxyKarari("/portal/randevu-talep", oturumBilgisi)).toEqual({ tur: "yonlendir", hedef: "/sifre-degistir" });
    expect(proxyKarari("/sifre-degistir", oturumBilgisi)).toEqual({ tur: "gec" });

    // zayıf / aynı şifre reddedilir
    expect(await sifreDegistir({ basliklar: hdr, mevcutSifre: h.sifre, yeniSifre: "kisa1" })).toMatchObject({ ok: false });
    expect(await sifreDegistir({ basliklar: hdr, mevcutSifre: h.sifre, yeniSifre: h.sifre })).toMatchObject({ ok: false });
    // yanlış mevcut şifre
    expect(await sifreDegistir({ basliklar: hdr, mevcutSifre: "YanlisMevcut1", yeniSifre: "YeniSifre12345" })).toEqual({ ok: false, mesaj: "Mevcut şifre hatalı." });

    const degisti = await sifreDegistir({ basliklar: hdr, mevcutSifre: h.sifre, yeniSifre: "YeniSifre12345" });
    expect(degisti.ok).toBe(true);
    // diğer oturumlar iptal: eski cookie geçersiz, yeni cookie (bu cihaz için üretilen) geçerli
    expect(await getSessionContext(hdr)).toBeNull();
    ctx = await getSessionContext(cerezBasligi(degisti.ok ? (degisti.cerezler ?? []) : []));
    expect(ctx?.sifreDegistirmeli).toBe(false);
    expect(proxyKarari("/portal", { tur: "hasta", sifreDegistirmeli: false })).toEqual({ tur: "gec" });
    // eski şifre artık çalışmaz, yenisi çalışır
    expect((await hastaGirisi({ klinikKodu: "klinikbir", telefon: h.telefon, sifre: h.sifre, basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() })).ok).toBe(false);
    const yeni = await hastaGirisi({ klinikKodu: "klinikbir", telefon: h.telefon, sifre: "YeniSifre12345", basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() });
    expect(yeni.ok && !yeni.sifreDegistirmeli).toBe(true);
  });

  it("proxy kararı: oturumsuz yönlendirme, panel/portal ayrımı, herkese açık giriş sayfaları", () => {
    expect(proxyKarari("/panel/hastalar", null)).toEqual({ tur: "yonlendir", hedef: "/giris" });
    expect(proxyKarari("/portal", null)).toEqual({ tur: "yonlendir", hedef: "/portal/giris" });
    expect(proxyKarari("/portal/giris", null)).toEqual({ tur: "gec" });
    expect(proxyKarari("/portal/klinikbir/giris", null)).toEqual({ tur: "gec" });
    expect(proxyKarari("/giris", null)).toEqual({ tur: "gec" });
    expect(proxyKarari("/sifremi-unuttum", null)).toEqual({ tur: "gec" });
    expect(proxyKarari("/kayit/hasta/abc", null)).toEqual({ tur: "gec" });
    expect(proxyKarari("/panel", { tur: "hasta", sifreDegistirmeli: false })).toEqual({ tur: "yonlendir", hedef: "/portal" });
    expect(proxyKarari("/portal", { tur: "personel", sifreDegistirmeli: false })).toEqual({ tur: "yonlendir", hedef: "/panel" });
    expect(proxyKarari("/panel", { tur: "personel", sifreDegistirmeli: false })).toEqual({ tur: "gec" });
  });
});

describe("şifremi unuttum (personel)", () => {
  async function kurulum() {
    const { epostaGondericiAyarla } = await import("@/lib/auth/eposta");
    const giden: { alici: string; konu: string; metin: string }[] = [];
    epostaGondericiAyarla(async (e) => {
      giden.push(e);
    });
    return giden;
  }
  const bekle = async (giden: unknown[], n: number) => {
    for (let i = 0; i < 50 && giden.length < n; i++) await new Promise((r) => setTimeout(r, 40));
  };

  it("var olan ve olmayan hesap AYNI yanıtı alır; e-posta yalnız var olan personele gider ve kişisel veri içermez", async () => {
    const { sifremiUnuttum, MESAJ_UNUTTUM_ORTAK } = await import("@/lib/auth/sifre-islemleri");
    const giden = await kurulum();
    const p = await personelKur({ klinikId: K1.klinik, rol: "klinik_admin" });
    const yok = await sifremiUnuttum({ eposta: "yok@deneme.test", basliklar: basliklar(yeniIp()), geriDonusAdresi: "http://localhost:3000/sifre-sifirla" });
    const var_ = await sifremiUnuttum({ eposta: p.eposta, basliklar: basliklar(yeniIp()), geriDonusAdresi: "http://localhost:3000/sifre-sifirla" });
    expect(yok.mesaj).toBe(MESAJ_UNUTTUM_ORTAK);
    expect(var_.mesaj).toBe(MESAJ_UNUTTUM_ORTAK);
    await bekle(giden, 1);
    expect(giden).toHaveLength(1);
    expect(giden[0].alici).toBe(p.eposta);
    const icerik = giden[0].konu + "\n" + giden[0].metin;
    expect(icerik).not.toContain(p.eposta);
    expect(icerik).not.toContain(p.telefon);
    expect(icerik).not.toMatch(/Personel|klinik(bir|iki)/i);
    expect(giden[0].konu).toBe("Klinik bildirimi");
  });

  it("hasta hesabı için sıfırlama e-postası ÜRETİLMEZ (hasta sıfırlaması resepsiyon geçici şifresiyle)", async () => {
    const { sifremiUnuttum } = await import("@/lib/auth/sifre-islemleri");
    const giden = await kurulum();
    const h = await hastaKur({ klinikId: K1.klinik });
    const sup = await superBaglan();
    const e = (await sup.query("select eposta from kimlik_kullanici where id = $1", [h.kullaniciId])).rows[0].eposta;
    await sup.end();
    await sifremiUnuttum({ eposta: e, basliklar: basliklar(yeniIp()), geriDonusAdresi: "http://localhost:3000/sifre-sifirla" });
    await new Promise((r) => setTimeout(r, 300));
    expect(giden).toHaveLength(0);
  });

  it("bağlantı TEK KULLANIMLIK, 30 dakika ömürlü; kullanınca yeni şifre geçerli, eski oturumlar iptal, bayraklar temiz", async () => {
    const { sifremiUnuttum, sifreSifirla } = await import("@/lib/auth/sifre-islemleri");
    const { personelGirisi } = await giris();
    const { getSessionContext } = await oturum();
    const giden = await kurulum();
    const p = await personelKur({ klinikId: K1.klinik, rol: "klinik_admin" });
    const eskiOturum = await personelGirisi({ girisAdi: p.eposta, sifre: p.sifre, basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() });
    if (!eskiOturum.ok) throw new Error("giriş başarısız");

    await sifremiUnuttum({ eposta: p.eposta, basliklar: basliklar(yeniIp()), geriDonusAdresi: "http://localhost:3000/sifre-sifirla" });
    await bekle(giden, 1);
    const jeton = /reset-password\/([^?\s]+)/.exec(giden[0].metin)?.[1];
    expect(jeton).toBeTruthy();

    const sup = await superBaglan();
    try {
      const sure = await sup.query("select bitis > now() + interval '29 minutes' and bitis <= now() + interval '30 minutes 5 seconds' as tamam from kimlik_dogrulama where tanimlayici like 'reset-password:%' and deger = $1", [p.id]);
      expect(sure.rows[0]?.tamam).toBe(true);
    } finally {
      await sup.end();
    }

    expect(await sifreSifirla({ jeton: jeton!, yeniSifre: "kisa", basliklar: basliklar(yeniIp()) })).toMatchObject({ ok: false });
    expect(await sifreSifirla({ jeton: jeton!, yeniSifre: "SifirlanmisSifre99", basliklar: basliklar(yeniIp()) })).toEqual({ ok: true });
    // ikinci kullanım reddedilir
    expect(await sifreSifirla({ jeton: jeton!, yeniSifre: "BaskaSifre12345", basliklar: basliklar(yeniIp()) })).toMatchObject({ ok: false });
    // eski oturum iptal, eski şifre geçersiz, yeni şifre geçerli ve zorunlu değiştirme bayrağı temiz
    expect(await getSessionContext(cerezBasligi(eskiOturum.cerezler))).toBeNull();
    expect((await personelGirisi({ girisAdi: p.eposta, sifre: p.sifre, basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() })).ok).toBe(false);
    const yeni = await personelGirisi({ girisAdi: p.eposta, sifre: "SifirlanmisSifre99", basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() });
    expect(yeni.ok && !yeni.sifreDegistirmeli).toBe(true);
  });

  it("süresi dolmuş bağlantı reddedilir", async () => {
    const { sifremiUnuttum, sifreSifirla } = await import("@/lib/auth/sifre-islemleri");
    const giden = await kurulum();
    const p = await personelKur({ klinikId: K1.klinik, rol: "klinik_admin" });
    await sifremiUnuttum({ eposta: p.eposta, basliklar: basliklar(yeniIp()), geriDonusAdresi: "http://localhost:3000/sifre-sifirla" });
    await bekle(giden, 1);
    const jeton = /reset-password\/([^?\s]+)/.exec(giden[0].metin)?.[1];
    const sup = await superBaglan();
    try {
      await sup.query("update kimlik_dogrulama set bitis = now() - interval '1 second' where tanimlayici like 'reset-password:%' and deger = $1", [p.id]);
    } finally {
      await sup.end();
    }
    expect(await sifreSifirla({ jeton: jeton!, yeniSifre: "SifirlanmisSifre99", basliklar: basliklar(yeniIp()) })).toMatchObject({ ok: false });
  });

  it("hız sınırı: aynı hesap için saatte 3'ten fazla istek e-posta ÜRETMEZ (yanıt yine ortak)", async () => {
    const { sifremiUnuttum, MESAJ_UNUTTUM_ORTAK } = await import("@/lib/auth/sifre-islemleri");
    const giden = await kurulum();
    const p = await personelKur({ klinikId: K1.klinik, rol: "klinik_admin" });
    for (let i = 0; i < 6; i++) {
      const y = await sifremiUnuttum({ eposta: p.eposta, basliklar: basliklar(yeniIp()), geriDonusAdresi: "http://localhost:3000/sifre-sifirla" });
      expect(y.mesaj).toBe(MESAJ_UNUTTUM_ORTAK);
    }
    await new Promise((r) => setTimeout(r, 400));
    expect(giden.length).toBe(3);
  });
});

describe("hız sınırı FAIL-CLOSED", () => {
  it("sayaç erişilemezse doğru şifre bile giriş yaptırmaz (personel ve hasta)", async () => {
    const { personelGirisi, hastaGirisi, MESAJ_KULLANILAMIYOR } = await giris();
    const p = await personelKur({ klinikId: K1.klinik, rol: "resepsiyon" });
    const h = await hastaKur({ klinikId: K1.klinik });
    const sup = await superBaglan();
    try {
      await sup.query("REVOKE EXECUTE ON FUNCTION hiz_siniri_kullan(text, integer, integer, boolean) FROM klinik_uygulama, klinik_anonim");
      const a = await personelGirisi({ girisAdi: p.telefon, sifre: p.sifre, basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() });
      const b = await hastaGirisi({ klinikKodu: "klinikbir", telefon: h.telefon, sifre: h.sifre, basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() });
      expect(a).toMatchObject({ ok: false, kod: "kullanilamiyor", mesaj: MESAJ_KULLANILAMIYOR });
      expect(b).toMatchObject({ ok: false, kod: "kullanilamiyor", mesaj: MESAJ_KULLANILAMIYOR });
      expect((await sup.query("select count(*)::int n from oturum where kullanici_id = any($1)", [[p.id, h.kullaniciId]])).rows[0].n).toBe(0);
    } finally {
      await sup.end();
    }
  });

  it("şifremi unuttum: sayaç erişilemezse e-posta GÖNDERİLMEZ", async () => {
    const { sifremiUnuttum } = await import("@/lib/auth/sifre-islemleri");
    const { epostaGondericiAyarla } = await import("@/lib/auth/eposta");
    const giden: unknown[] = [];
    epostaGondericiAyarla(async (e) => {
      giden.push(e);
    });
    const p = await personelKur({ klinikId: K1.klinik, rol: "klinik_admin" });
    const sup = await superBaglan();
    try {
      await sup.query("REVOKE EXECUTE ON FUNCTION hiz_siniri_kullan(text, integer, integer, boolean) FROM klinik_uygulama, klinik_anonim");
      await sifremiUnuttum({ eposta: p.eposta, basliklar: basliklar(yeniIp()), geriDonusAdresi: "http://localhost:3000/sifre-sifirla" });
      await new Promise((r) => setTimeout(r, 300));
      expect(giden).toHaveLength(0);
    } finally {
      await sup.end();
    }
  });

  it("5 hatalı denemeden sonra doğru şifre de 15 dk reddedilir (kilitli)", async () => {
    const { personelGirisi, MESAJ_KILITLI } = await giris();
    const p = await personelKur({ klinikId: K1.klinik, rol: "resepsiyon" });
    for (let i = 0; i < 5; i++) await personelGirisi({ girisAdi: p.telefon, sifre: "Yanlis" + i, basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() });
    const s = await personelGirisi({ girisAdi: p.telefon, sifre: p.sifre, basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() });
    expect(s).toMatchObject({ ok: false, kod: "kilitli", mesaj: MESAJ_KILITLI });
  });
});

describe("işten çıkış: devre_disi + açık oturumların iptali", () => {
  it("devre dışı bırakılınca açık oturum HEMEN düşer, yeni giriş reddedilir; yeniden etkinleştirince girer", async () => {
    const { personelGirisi } = await giris();
    const { getSessionContext } = await oturum();
    const { hesabiDevreDisiBirak, hesabiYenidenEtkinlestir } = await import("@/lib/auth/hesap");
    const p = await personelKur({ klinikId: K1.klinik, rol: "terapist" });
    const s1 = await personelGirisi({ girisAdi: p.telefon, sifre: p.sifre, basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() });
    const s2 = await personelGirisi({ girisAdi: p.telefon, sifre: p.sifre, basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() });
    if (!s1.ok || !s2.ok) throw new Error("giriş başarısız");
    expect(await getSessionContext(cerezBasligi(s1.cerezler))).not.toBeNull();

    const sonuc = await hesabiDevreDisiBirak(p.id);
    expect(sonuc.iptalEdilenOturum).toBe(2);
    expect(await getSessionContext(cerezBasligi(s1.cerezler))).toBeNull();
    expect(await getSessionContext(cerezBasligi(s2.cerezler))).toBeNull();
    const yeni = await personelGirisi({ girisAdi: p.telefon, sifre: p.sifre, basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() });
    expect(yeni).toMatchObject({ ok: false, kod: "hatali" });

    await hesabiYenidenEtkinlestir(p.id);
    expect((await personelGirisi({ girisAdi: p.telefon, sifre: p.sifre, basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() })).ok).toBe(true);
  });
});

describe("gece zorunlu çıkış (resepsiyon/terapist)", () => {
  it("kapanış anından önce açılmış oturum resepsiyon/terapistte geçersiz olur; yönetici ve hasta etkilenmez", async () => {
    const { personelGirisi, hastaGirisi } = await giris();
    const { getSessionContext } = await oturum();
    const resepsiyon = await personelKur({ klinikId: K1.klinik, rol: "resepsiyon" });
    const terapist = await personelKur({ klinikId: K1.klinik, rol: "terapist" });
    const admin = await personelKur({ klinikId: K1.klinik, rol: "klinik_admin" });
    const hasta = await hastaKur({ klinikId: K1.klinik });
    const r = await personelGirisi({ girisAdi: resepsiyon.telefon, sifre: resepsiyon.sifre, basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() });
    const t = await personelGirisi({ girisAdi: terapist.telefon, sifre: terapist.sifre, basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() });
    const a = await personelGirisi({ girisAdi: admin.eposta, sifre: admin.sifre, basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() });
    const h = await hastaGirisi({ klinikKodu: "klinikbir", telefon: hasta.telefon, sifre: hasta.sifre, basliklar: basliklar(yeniIp()), cihazKimligi: cihaz() });
    if (!r.ok || !t.ok || !a.ok || !h.ok) throw new Error("giriş başarısız");
    // Saati ertesi gün 03:00 İstanbul'a (UTC 00:00) ilerlet: tüm bugün açılmış oturumlar bir gece kapanışı geçmiştir
    const yarin = new Date(Date.now() + 24 * 3600_000);
    yarin.setUTCHours(0, 0, 0, 0);
    testSaatiAyarla(() => yarin);
    try {
      expect(await getSessionContext(cerezBasligi(r.cerezler))).toBeNull();
      expect(await getSessionContext(cerezBasligi(t.cerezler))).toBeNull();
      expect(await getSessionContext(cerezBasligi(a.cerezler))).not.toBeNull();
      expect(await getSessionContext(cerezBasligi(h.cerezler))).not.toBeNull();
    } finally {
      testSaatiAyarla(null);
    }
  });
});
