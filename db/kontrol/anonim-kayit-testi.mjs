// Anonim self-servis kayıt (QR ön kayıt) olumlu/olumsuz yol testi. İki klinikli deneme düzeneğinde çalışır (scripts/dev/kontrol-calistir.mjs).
// Uygulama bağlantısı klinik_uygulama; giriş öncesi akışta işlem SET LOCAL ROLE klinik_anonim ile yapılır (docs/sema-esleme.md).
// Anon'a SELECT politikası YOK: bu yüzden INSERT ... RETURNING çalışmaz, kimlik sunucuda üretilir (crypto.randomUUID).
import crypto from "node:crypto";
import { baglamdaCalistir } from "../../scripts/dev/test-kur.mjs";

export async function anonimKayitTesti(duzenek) {
  const { ids } = duzenek;
  const c = await duzenek.baglanRol("klinik_uygulama");
  const sonuc = [];
  const dene = async (ad, beklenen, bag, sql, params, not = "") => {
    const r = await baglamdaCalistir(c, { ...bag, rol: "klinik_anonim" }, sql, params);
    const basarili = r.tamam;
    const gecti = beklenen === "basari" ? basarili : beklenen === "red" ? !basarili : true;
    sonuc.push({ ad, durum: beklenen === "bilgi" ? "BİLGİ" : gecti ? "GEÇTİ" : "BAŞARISIZ", ayrinti: basarili ? `kabul edildi${not}` : `reddedildi: ${r.hata}${not}` });
  };
  const ekle = (k, alanlar = {}) => {
    const a = { id: crypto.randomUUID(), klinik_id: k, ad_soyad: "Qr Hasta", telefon: "5559990000", kayit_kanali: "qr_self_servis", kvkk_onay_tarihi: "now()", kvkk_onaylayan_tip: "hasta", ...alanlar };
    const kolon = Object.keys(a);
    const deger = kolon.map((x, i) => (a[x] === "now()" ? "now()" : `$${i + 1}`));
    const params = kolon.filter((x) => a[x] !== "now()").map((x) => a[x]);
    // now() olanları parametre dizisinden çıkarınca indeksler kaymasın diye yeniden numaralandır
    let n = 0;
    const degerler = kolon.map((x) => (a[x] === "now()" ? "now()" : (n++, `$${n}`)));
    const sil = kolon.filter((x) => a[x] === null);
    return { sql: `insert into hasta(${kolon.join(",")}) values (${degerler.join(",")})`, params, id: a.id, sil };
  };
  const k1 = { tenant: ids.k1.klinik };

  // Olumlu yol
  let e = ekle(ids.k1.klinik);
  await dene("geçerli QR kaydı (kanal=qr_self_servis, KVKK onaylı, tip=hasta, tenant bağlamı = QR kliniği)", "basari", k1, e.sql, e.params);

  // Olumlu yol + hassas satır (hasta_qr_self_servis_mi) aynı işlemde
  {
    const id = crypto.randomUUID();
    const r = await baglamdaCalistir(c, { ...k1, rol: "klinik_anonim" },
      `insert into hasta(id, klinik_id, ad_soyad, telefon, kayit_kanali, kvkk_onay_tarihi, kvkk_onaylayan_tip) values ('${id}', '${ids.k1.klinik}', 'Qr Hasta 2', '5559990001', 'qr_self_servis', now(), 'hasta');
       insert into hasta_hassas(hasta_id, klinik_id) values ('${id}', '${ids.k1.klinik}')`);
    sonuc.push({ ad: "geçerli QR kaydı + hasta_hassas satırı (hasta_qr_self_servis_mi)", durum: r.tamam ? "GEÇTİ" : "BAŞARISIZ", ayrinti: r.tamam ? "kabul edildi" : `reddedildi: ${r.hata}` });
  }

  // Olumsuz yollar
  e = ekle(ids.k1.klinik, { kvkk_onay_tarihi: null });
  await dene("KVKK onay tarihi yok → red", "red", k1, `insert into hasta(id,klinik_id,ad_soyad,telefon,kayit_kanali,kvkk_onaylayan_tip) values ('${crypto.randomUUID()}','${ids.k1.klinik}','x','5551','qr_self_servis','hasta')`, []);
  e = ekle(ids.k1.klinik, { kayit_kanali: "panel" });
  await dene("kayit_kanali = panel → red", "red", k1, e.sql, e.params);
  e = ekle(ids.k1.klinik, { kvkk_onaylayan_tip: "personel" });
  await dene("kvkk_onaylayan_tip = personel → red", "red", k1, e.sql, e.params);
  e = ekle(ids.k1.klinik);
  await dene("INSERT ... RETURNING (anon'a SELECT yok) → red", "red", k1, e.sql + " returning id", e.params);
  await dene("anon hasta SELECT → red (PII sızıntısı yok)", "red", k1, "select count(*) from hasta", []);
  await dene("anon kullanici SELECT → red", "red", k1, "select count(*) from kullanici", []);
  await dene("anon kimlik_kullanici SELECT → red", "red", k1, "select count(*) from kimlik_kullanici", []);
  await dene("anon klinik SELECT → red", "red", k1, "select count(*) from klinik", []);
  await dene("anon hasta UPDATE → red", "red", k1, "update hasta set ad_soyad = 'x'", []);
  await dene("anon hasta DELETE → red", "red", k1, "delete from hasta", []);

  // Bilgi amaçlı sınırlar (davranış kaydı)
  e = ekle(ids.k1.klinik);
  await dene("tenant bağlamı YOK (uygulama app.tenant_id vermezse)", "bilgi", {}, e.sql, e.params, " — tetikleyici/denetim yazımı tenant bağlamı ister");
  e = ekle(ids.k1.klinik);
  await dene("yanlış tenant bağlamı (K2 bağlamı, K1 klinik_id)", "bilgi", { tenant: ids.k2.klinik }, e.sql, e.params);
  e = ekle("99999999-9999-9999-9999-999999999999");
  await dene("var olmayan klinik_id", "bilgi", { tenant: "99999999-9999-9999-9999-999999999999" }, e.sql, e.params);
  // Tenant'sız çözümleme (tanima şeması) + qr_kodu_aktif_mi güvenli-kapalı davranışı
  const kontrol = (ad, kosul, ayrinti) => sonuc.push({ ad, durum: kosul ? "GEÇTİ" : "BAŞARISIZ", ayrinti });
  const tan = await baglamdaCalistir(c, { rol: "klinik_anonim" }, "select id, ad from tanima.klinik_qr_bilgisi_getir($1)", ["klinikbir"]);
  kontrol("tenant bağlamı OLMADAN kısa koddan klinik çözülür (tanima.klinik_qr_bilgisi_getir)", tan.tamam && tan.satirlar.length === 1 && tan.satirlar[0].id === ids.k1.klinik, tan.tamam ? JSON.stringify(tan.satirlar) : tan.hata);
  const yok = await baglamdaCalistir(c, { rol: "klinik_anonim" }, "select id from tanima.klinik_qr_bilgisi_getir($1)", ["yok-boyle-kod"]);
  kontrol("bilinmeyen kısa kod → boş", yok.tamam && yok.satirlar.length === 0, yok.tamam ? "boş" : yok.hata);
  const rk = await baglamdaCalistir(c, { rol: "klinik_anonim" }, "select tanima.randevu_klinik_cozumle($1) k", [ids.k2.randevu]);
  kontrol("randevu kimliğinden klinik çözülür (anket bağlantısı)", rk.tamam && rk.satirlar[0].k === ids.k2.klinik, rk.tamam ? "" : rk.hata);
  const sz = await baglamdaCalistir(c, { rol: "klinik_anonim" }, "select ad_soyad from hasta", []);
  kontrol("tanima fonksiyonları dışında anon hasta okuyamaz", !sz.tamam, sz.hata);
  const sup = await duzenek.baglanSuper();
  try {
    for (const [ad, sorgu] of [["klinik_tanima hasta.ad_soyad okuyamaz", "select ad_soyad from hasta"], ["klinik_tanima klinik.logo/diğer kolon okuyamaz", "select qr_kisa_kod, adres from klinik"], ["klinik_tanima kullanici okuyamaz", "select id from kullanici"]]) {
      await sup.query("BEGIN"); await sup.query("SET LOCAL ROLE klinik_tanima");
      const r = await sup.query(sorgu).then(() => true, () => false);
      await sup.query("ROLLBACK");
      kontrol(ad, !r, "");
    }
  } finally { await sup.end(); }
  for (const [ad, bag, beklenen] of [
    ["qr_kodu_aktif_mi: doğru tenant bağlamı → true", { tenant: ids.k1.klinik }, true],
    ["qr_kodu_aktif_mi: bağlam yok → false (güvenli kapalı)", {}, false],
    ["qr_kodu_aktif_mi: yanlış tenant → false", { tenant: ids.k2.klinik }, false],
  ]) {
    const r = await baglamdaCalistir(c, { ...bag, rol: "klinik_anonim" }, "select qr_kodu_aktif_mi($1, 'hasta_on_kayit') v", [ids.k1.klinik]);
    kontrol(ad, r.tamam && r.satirlar[0].v === beklenen, r.tamam ? String(r.satirlar[0].v) : r.hata);
  }
  await c.end();
  return sonuc;
}
