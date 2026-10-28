// klinik_uygulama'da doğrudan yetkisi OLMAYAN tablolara (kodda doğrudan kullanılmayanlar) yazan tetikleyici ve RPC'leri listeler
// ve her biri için GERÇEK yazma testi çalıştırır (iki klinikli düzenek). "permission denied" çıkarsa yetki/fonksiyon türü düzeltilir.
import crypto from "node:crypto";

/** Yetkisiz tablo listesi katalogdan hesaplanır: klinik_uygulama'nın hiçbir tablo/kolon yetkisi olmayan public tabloları. */
export async function yetkisizTablolar(sup) {
  return (await sup.query(`select c.relname from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') and not c.relispartition
    and c.relname not in ('kimlik_kullanici','oturum','kimlik_hesap','kimlik_dogrulama','kullanici_tenant') and c.relname not like 'audit_log%'
    and not has_any_column_privilege('klinik_uygulama', c.oid, 'SELECT,INSERT,UPDATE')
    and not has_table_privilege('klinik_uygulama', c.oid, 'DELETE') order by 1`)).rows.map((r) => r.relname);
}

/** Tabloya yazan fonksiyonlar (gövde taraması) ve tetikleyicileri. */
export async function yazanlariBul(sup, tablolar) {
  const fonks = (await sup.query(`select p.oid::regprocedure::text imza, p.prosecdef, pg_get_function_result(p.oid) donus, lower(p.prosrc) src
    from pg_proc p where p.pronamespace in ('public'::regnamespace,'tanima'::regnamespace) and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')`)).rows;
  const sonuc = {};
  for (const t of tablolar) {
    const kalip = new RegExp("(insert\\s+into\\s+(public\\.)?" + t + "(\\s|\\()|update\\s+(public\\.)?" + t + "\\s+(as\\s+\\w+\\s+)?set|delete\\s+from\\s+(public\\.)?" + t + "(\\s|;))");
    const yazan = fonks.filter((f) => kalip.test(f.src)).map((f) => ({ imza: f.imza.replace(/^public[.]/, ""), tur: f.donus === "trigger" ? "tetikleyici fonksiyonu" : "RPC", definer: f.prosecdef }));
    const trg = (await sup.query(`select tgname from pg_trigger where tgrelid = $1::regclass and not tgisinternal order by 1`, [t])).rows.map((r) => r.tgname);
    // başka tablolardaki tetikleyici fonksiyonları bu tabloya yazıyorsa onlar da yazan sayılır (yazan listesinde zaten fonksiyon olarak çıkar)
    sonuc[t] = { yazanlar: yazan, ustuneTetikleyiciler: trg };
  }
  return sonuc;
}

/** Gerçek yazma testleri: her biri klinik_uygulama (veya anon) rolüyle, doğru tenant bağlamında bir işlem yapar ve hedef tabloda satır oluştuğunu doğrular. */
export async function yazmaTestleri(duzenek) {
  const { ids } = duzenek;
  const sup = await duzenek.baglanSuper();
  const c = await duzenek.baglanRol("klinik_uygulama");
  const sonuc = [];
  const k1 = { kullanici: ids.k1.kullanici, tenant: ids.k1.klinik };
  const say = async (ba, tablo, kosul = "true") => Number((await ba.query(`select count(*) n from ${tablo} where ${kosul}`)).rows[0].n);

  // Tek transaction içinde: rol bağlamında işlem + süper kullanıcı görünümüyle tabloyu say, sonra ROLLBACK.
  async function dene(ad, hedefTablo, islem, { bag = k1, rol = "klinik_uygulama", kosul = "true" } = {}) {
    const ba = sup; // süper kullanıcı oturumu: önce bağlam, sonra rol, işlem, sonra RESET ROLE ile sayım
    await ba.query("BEGIN");
    try {
      await ba.query("select set_config('app.user_id', $1, true)", [bag.kullanici ?? ""]);
      await ba.query("select set_config('app.tenant_id', $1, true)", [bag.tenant ?? ""]);
      const once = await say(ba, hedefTablo, kosul);
      await ba.query(`SET LOCAL ROLE ${rol}`);
      await ba.query("SAVEPOINT s");
      let hata = null;
      try { await ba.query(islem.sql, islem.params ?? []); } catch (e) { hata = e.message; await ba.query("ROLLBACK TO s"); }
      await ba.query("RESET ROLE");
      const sonra = hata ? once : await say(ba, hedefTablo, kosul);
      const gecti = !hata && sonra > once;
      sonuc.push({ ad, tablo: hedefTablo, durum: gecti ? "GEÇTİ" : "BAŞARISIZ", ayrinti: hata ? `hata: ${hata}` : `${once} → ${sonra} satır` });
    } catch (e) {
      sonuc.push({ ad, tablo: hedefTablo, durum: "BAŞARISIZ", ayrinti: `düzenek: ${e.message}` });
    } finally { await ba.query("ROLLBACK").catch(() => {}); }
  }

  // hiz_siniri_sayac: yalnız hiz_siniri_kullan yazar (tenant'sız, anonim ve uygulama rolü çağırır)
  await dene("hiz_siniri_kullan (uygulama rolü)", "hiz_siniri_sayac", { sql: "select hiz_siniri_kullan($1, 5, 60, true)", params: ["test:uygulama"] });
  await dene("hiz_siniri_kullan (anonim rolü, bağlamsız)", "hiz_siniri_sayac", { sql: "select hiz_siniri_kullan($1, 5, 60, true)", params: ["test:anonim"] }, { bag: {}, rol: "klinik_anonim" });

  // islem_tanimi_fiyat_gecmisi: fiyat güncellemesi tetikleyiciyi çalıştırır
  await dene("islem_tanimi fiyat güncelle → fiyat geçmişi tetikleyicisi", "islem_tanimi_fiyat_gecmisi", { sql: "update islem_tanimi set vita_fiyat = vita_fiyat + 50 where id = $1", params: [ids.k1.islem] }, { kosul: "klinik_id is not null or true" });

  // pozisyon_sablonlari + pozisyonlar: klinik oluşturma (super_admin) -> pozisyon seed tetikleyicisi şablonlardan kopyalar
  const sa = crypto.randomUUID();
  await sup.query("BEGIN");
  await sup.query("select set_config('app.tenant_id', $1, true)", [ids.k1.klinik]);
  await sup.query("insert into kimlik_kullanici(id, eposta) values ($1, $2)", [sa, `sa-${sa}@deneme.test`]);
  await sup.query("insert into kullanici(id, klinik_id, rol, ad_soyad) values ($1, null, 'super_admin', 'SA')", [sa]);
  await sup.query("COMMIT");
  const yeniKlinik = crypto.randomUUID();
  // Klinik oluşturma uygulama özelliği DEĞİL (kodda klinik INSERT yok, klinik_uygulama'nın klinik INSERT yetkisi yok): SAĞLAMA işlemidir; süper kullanıcı
  // oturumunda (uygulama kullanıcısı YOK) klinik_sahip + app.tenant_id=yeni klinik ile yapılır. super_admin KULLANICI kimliği (destek bağlamı hariç) bunu yapamaz (0015).
  await dene("klinik oluştur (sağlama, klinik_sahip) → pozisyon_sablonlari okunur, pozisyonlar yazılır", "pozisyonlar", { sql: "insert into klinik(id, ad, qr_kisa_kod) values ($1, 'yeni', 'yeni-kod')", params: [yeniKlinik] }, { bag: { kullanici: null, tenant: yeniKlinik }, rol: "klinik_sahip", kosul: `klinik_id = '${yeniKlinik}'` });

  // odeme / odeme_kalemi / odeme_satiri: odeme_olustur (işlem kalemi + nakit satırı) -> üç tablo birlikte yazılır
  const odemeSql = { sql: "select odeme_olustur($1, 0, false, 'test', $2::jsonb, $3::jsonb)", params: [ids.k1.hasta, JSON.stringify([{ tur: "islem", ref_id: ids.k1.islem, miktar: 1 }]), JSON.stringify([{ yontem: "nakit", tutar: 1000 }])] };
  await dene("odeme_olustur → odeme", "odeme", odemeSql);
  await dene("odeme_olustur → odeme_kalemi", "odeme_kalemi", odemeSql);
  await dene("odeme_olustur → odeme_satiri", "odeme_satiri", odemeSql);

  await c.end();
  await sup.end();
  return sonuc;
}
