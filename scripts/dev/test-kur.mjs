// İki klinikli deneme düzeneği: db/ dosyalarından (Supabase katmanı OLMADAN) boş bir Postgres'e kurar ve iki kliniğe örnek veri yazar.
// Kullanım (kontrol-calistir.mjs içinden): const duzenek = await testKumesiKur();
import { kumeBaslat, sqlHazirla, oku } from "./kume.mjs";

export const SIFRELER = { uygulama_sifre: "u-deneme", kimlik_sifre: "k-deneme", bakim_sifre: "b-deneme", yedek_sifre: "y-deneme" };
export const PORT_TEST = Number(process.env.DEV_TEST_PORT ?? 54331);
const SIFRE_ROL = { klinik_uygulama: SIFRELER.uygulama_sifre, kimlik_rolu: SIFRELER.kimlik_sifre, bakim_rolu: SIFRELER.bakim_sifre, klinik_yedek: SIFRELER.yedek_sifre };

const K = {
  k1: { klinik: "11111111-1111-1111-1111-111111111111", kullanici: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1", ad: "klinikbir" },
  k2: { klinik: "22222222-2222-2222-2222-222222222222", kullanici: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2", ad: "klinikiki" },
};

export async function testKumesiKur() {
  const kume = await kumeBaslat("test", PORT_TEST, { sifirla: true });
  const root = await kume.baglan("postgres");
  await root.query(sqlHazirla(oku("db/kurulum/00_roller.sql"), SIFRELER));
  for (const st of sqlHazirla(oku("db/kurulum/01_veritabani.sql")).split(";").map((x) => x.replace(/^--.*$/gm, "").trim()).filter(Boolean)) await root.query(st);
  await root.end();
  const sup = await kume.baglan("klinik");
  await sup.query(oku("db/kurulum/02_eklentiler.sql"));
  await sup.query("SET ROLE klinik_sahip");
  for (const f of ["db/migrations/0001_kimlik_ve_baglam.sql", "db/migrations/0002_temel_sema.sql", "db/migrations/0003_baglam_politikalari.sql", "db/migrations/0004_tanima_ve_definer_sertlestirme.sql", "db/migrations/0005_kimlik_baglantilari_ve_anonim_kapatma.sql", "db/migrations/0006_muhasebe_secret_var.sql", "db/seed/0001_referans_veri.sql"]) await sup.query(oku(f));
  await sup.query("select audit_log_bolum_olustur(3)");
  await sup.end();

  // Örnek veri: süper kullanıcıyla ama her klinik KENDİ tenant bağlamında (FORCE RLS + sahip politikası gereği)
  const ids = {};
  for (const [anahtar, k] of Object.entries(K)) {
    const c = await kume.baglan("klinik");
    const v = (sira) => `${anahtar === "k1" ? "1" : "2"}0000000-0000-0000-0000-00000000000${sira}`;
    const id = { klinik: k.klinik, kullanici: k.kullanici, personel: v(1), terapist: v(2), hasta: v(3), oda: v(4), islem: v(5), randevu: v(6), paket: v(7), paketSatis: v(8), hastaKullanici: v(9) };
    try {
      await c.query("BEGIN");
      await c.query("select set_config('app.tenant_id', $1, true)", [k.klinik]);
      await c.query(`insert into klinik(id, ad, qr_kisa_kod) values ($1, $2, $2)`, [k.klinik, k.ad]);
      await c.query(`insert into kimlik_kullanici(id, eposta) values ($1, $2)`, [k.kullanici, `${k.ad}@deneme.test`]);
      await c.query(`insert into kullanici(id, klinik_id, rol, ad_soyad, telefon) values ($1, $2, 'klinik_admin', $3, $4)`, [k.kullanici, k.klinik, `Admin ${k.ad}`, `0500000000${anahtar === "k1" ? 1 : 2}`]);
      await c.query(`insert into personel(id, klinik_id, ad_soyad, gorev) values ($1, $2, $3, 'Terapist')`, [id.personel, k.klinik, `Personel ${k.ad}`]);
      await c.query(`insert into terapist(id, klinik_id, personel_id) values ($1, $2, $3)`, [id.terapist, k.klinik, id.personel]);
      await c.query(`insert into hasta(id, klinik_id, ad_soyad, telefon) values ($1, $2, $3, $4)`, [id.hasta, k.klinik, `Hasta ${k.ad}`, `555000000${anahtar === "k1" ? 1 : 2}`]);
      await c.query(`insert into oda(id, klinik_id, ad) values ($1, $2, 'Oda 1')`, [id.oda, k.klinik]);
      await c.query(`insert into islem_tanimi(id, klinik_id, ad, vita_fiyat) values ($1, $2, 'Seans', 1000)`, [id.islem, k.klinik]);
      await c.query(`insert into randevu(id, klinik_id, hasta_id, terapist_id, oda_id, baslangic, bitis) values ($1, $2, $3, $4, $5, now() + interval '2 day', now() + interval '2 day 30 minutes')`, [id.randevu, k.klinik, id.hasta, id.terapist, id.oda]);
      await c.query(`insert into paket(id, klinik_id, islem_tanimi_id, ad, seans_sayisi, fiyat) values ($1, $2, $3, 'Paket', 5, 4000)`, [id.paket, k.klinik, id.islem]);
      await c.query(`insert into paket_satis(id, klinik_id, hasta_id, paket_id, kalan_adet) values ($1, $2, $3, $4, 5)`, [id.paketSatis, k.klinik, id.hasta, id.paket]);
      await c.query(`insert into hasta_bakiye_hareket(klinik_id, hasta_id, tur, tutar) values ($1, $2, 'borc', 1000)`, [k.klinik, id.hasta]);
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK").catch(() => {}); await c.end(); await kume.durdur(); throw new Error(`örnek veri (${anahtar}): ${e.message}`); }
    await c.end();
    ids[anahtar] = id;
  }

  /** Belirli rolle bağlanır; tx() bir transaction açar, bağlamı (app.user_id/app.tenant_id) SET LOCAL ile verir, hep ROLLBACK eder. */
  const baglanRol = async (rol) => kume.baglan("klinik", rol, SIFRE_ROL[rol] ?? "yok");
  return { kume, ids, baglanRol, baglanSuper: () => kume.baglan("klinik"), durdur: () => kume.durdur() };
}

/** Tek ifadelik deneme: bağlamla (veya bağlamsız) çalıştırıp sonucu/hatayı döndürür, ardından ROLLBACK. */
export async function baglamdaCalistir(istemci, { kullanici = null, tenant = null, rol = null }, sql, parametreler = []) {
  await istemci.query("BEGIN");
  try {
    if (kullanici) await istemci.query("select set_config('app.user_id', $1, true)", [kullanici]);
    if (tenant) await istemci.query("select set_config('app.tenant_id', $1, true)", [tenant]);
    if (rol) await istemci.query(`SET LOCAL ROLE ${rol}`);
    const r = await istemci.query(sql, parametreler);
    return { tamam: true, satirlar: r.rows, komut: r.command, sayi: r.rowCount };
  } catch (e) {
    return { tamam: false, hata: e.message, kod: e.code };
  } finally {
    await istemci.query("ROLLBACK").catch(() => {});
  }
}
