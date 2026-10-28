// Rapor / bakiye sorgularını FORCE RLS altında büyük fixture ile ölçer (Modül 4, kural 8).
// Kullanım: cd scripts/dev && node finans-performans.mjs [satir_sayisi=100000]
// Fixture (K1 kliniği): hasta_bakiye_hareket N satır (3 yıl, karışık tür/yöntem), klinik_harcama N/5, nakit_banka_hareketi N/20, randevu N, hasta N/50.
// Ölçüm: uygulama rolü (klinik_uygulama) + app.user_id/app.tenant_id — yani gerçek yol; her sorgu 3 kez, en iyi süre. > 250 ms "YAVAŞ".
import { testKumesiKur } from "./test-kur.mjs";

const N = Number(process.argv[2] ?? 100000);
const duzenek = await testKumesiKur();
try {
  const sup = await duzenek.baglanSuper();
  const k = duzenek.ids.k1;
  console.log(`fixture: ${N} hasta_bakiye_hareket ...`);
  await sup.query("BEGIN");
  await sup.query("select set_config('app.tenant_id', $1, true)", [k.klinik]);
  // Yığın yüklemede satır bazlı denetim tetikleyicileri kapalı (ölçüm konusu değil; audit_log ayrı partition'lı tablo).
  for (const t of ["hasta_bakiye_hareket", "klinik_harcama", "nakit_banka_hareketi", "hasta"]) await sup.query(`ALTER TABLE ${t} DISABLE TRIGGER USER`);
  const hastaSayisi = Math.max(10, Math.floor(N / 50));
  await sup.query(
    `insert into hasta(id, klinik_id, ad_soyad, telefon)
     select gen_random_uuid(), $1, 'H ' || g, '5' || lpad(g::text, 9, '0') from generate_series(1, $2) g`,
    [k.klinik, hastaSayisi]
  );
  await sup.query(
    `insert into hasta_bakiye_hareket(klinik_id, hasta_id, tur, tutar, iskonto_tutari, odeme_yontemi, created_at, iade_istisna, iade_istisna_gerekcesi)
     select $1,
            (select id from hasta where klinik_id = $1 offset (g % $3) limit 1),
            (array['odeme','odeme','odeme','borc','borc','iade'])[1 + g % 6],
            (10 + (g % 500))::numeric,
            0,
            case when (array['odeme','odeme','odeme','borc','borc','iade'])[1 + g % 6] = 'borc' then null else (array['nakit','banka_havalesi','kredi_karti'])[1 + g % 3] end,
            timestamptz '2024-01-01 09:00+03' + (g * interval '15 minutes'),
            (array['odeme','odeme','odeme','borc','borc','iade'])[1 + g % 6] = 'iade',
            case when (array['odeme','odeme','odeme','borc','borc','iade'])[1 + g % 6] = 'iade' then 'performans fixture' end
     from generate_series(1, $2) g`,
    [k.klinik, N, hastaSayisi]
  );
  await sup.query(
    `insert into klinik_harcama(klinik_id, kategori, tutar, tarih, odeme_tipi, tedarikci_adi, is_faturali)
     select $1, (array['kira','fatura','malzeme','bakim_hizmet','diger'])[1 + g % 5], (50 + g % 900)::numeric, date '2024-01-01' + (g % 1000),
            (array['nakit','nakit','cari'])[1 + g % 3], 'Ted ' || (g % 200), (g % 7 = 0)
     from generate_series(1, $2) g`,
    [k.klinik, Math.floor(N / 5)]
  );
  await sup.query(
    `insert into nakit_banka_hareketi(klinik_id, tip, hedef_kasa, tutar, tarih, karsi_taraf_adi)
     select $1, 'gelen', true, (5 + g % 300)::numeric, date '2024-01-01' + (g % 1000), 'X' from generate_series(1, $2) g`,
    [k.klinik, Math.floor(N / 20)]
  );
  await sup.query(
    `insert into randevu(klinik_id, hasta_id, terapist_id, oda_id, baslangic, bitis, durum)
     select $1, $5, $3, $4, timestamptz '2020-01-01 09:00+03' + (g * interval '30 minutes'), timestamptz '2020-01-01 09:00+03' + (g * interval '30 minutes') + interval '25 minutes',
            (array['tamamlandi','tamamlandi','planlandi','iptal','gelmedi'])[1 + g % 5]::randevu_durum_tipi
     from generate_series(1, $2) g`,
    [k.klinik, N, k.terapist, k.oda, k.hasta]
  );
  for (const t of ["hasta_bakiye_hareket", "klinik_harcama", "nakit_banka_hareketi", "hasta"]) await sup.query(`ALTER TABLE ${t} ENABLE TRIGGER USER`);
  await sup.query("COMMIT");
  await sup.query("VACUUM ANALYZE hasta_bakiye_hareket, klinik_harcama, nakit_banka_hareketi, randevu, hasta");
  await sup.end();

  const uyg = await duzenek.baglanRol("klinik_uygulama");
  const olc = async (ad, sorgu, parametre = []) => {
    let en = Infinity;
    let satir = 0;
    for (let i = 0; i < 3; i++) {
      await uyg.query("BEGIN");
      await uyg.query("select set_config('app.user_id', $1, true), set_config('app.tenant_id', $2, true)", [k.kullanici, k.klinik]);
      const t0 = performance.now();
      const r = await uyg.query(sorgu, parametre);
      en = Math.min(en, performance.now() - t0);
      satir = r.rowCount;
      await uyg.query("ROLLBACK");
    }
    const yavas = en > 250;
    console.log(`${yavas ? "YAVAŞ" : "ok   "} ${en.toFixed(1).padStart(8)} ms  ${String(satir).padStart(7)} satır  ${ad}`);
    return { ad, ms: en, yavas };
  };
  const plan = async (ad, sorgu, parametre = []) => {
    await uyg.query("BEGIN");
    await uyg.query("select set_config('app.user_id', $1, true), set_config('app.tenant_id', $2, true)", [k.kullanici, k.klinik]);
    const r = await uyg.query(`EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF) ${sorgu}`, parametre);
    await uyg.query("ROLLBACK");
    console.log(`\n--- EXPLAIN: ${ad}\n${r.rows.map((x) => x["QUERY PLAN"]).join("\n")}`);
  };

  console.log(`\n=== ölçümler (N=${N}) ===`);
  const sonuc = [];
  const ay = ["2025-06-01", "2025-07-01"];
  sonuc.push(await olc("rapor_donem_ozeti (1 ay)", "select rapor_donem_ozeti($1::timestamptz, $2::timestamptz, $3::date, $4::date)", ["2025-06-01 00:00+03", "2025-07-01 00:00+03", ay[0], ay[1]]));
  sonuc.push(await olc("rapor_donem_ozeti (1 yıl)", "select rapor_donem_ozeti($1::timestamptz, $2::timestamptz, $3::date, $4::date)", ["2025-01-01 00:00+03", "2026-01-01 00:00+03", "2025-01-01", "2026-01-01"]));
  sonuc.push(await olc("rapor_yillik_ozet(2025)", "select * from rapor_yillik_ozet(2025)"));
  sonuc.push(await olc("kasa_bakiye_once_toplam", "select kasa_bakiye_once_toplam($1::date)", ["2026-01-01"]));
  sonuc.push(await olc("banka_bakiye_once_toplam_tumu", "select * from banka_bakiye_once_toplam_tumu($1::date)", ["2026-01-01"]));
  sonuc.push(await olc("kredi_karti_bakiye_once_toplam", "select kredi_karti_bakiye_once_toplam($1::date)", ["2026-01-01"]));
  sonuc.push(await olc("klinik_cari_bakiyeler (tüm tedarikçiler)", "select * from klinik_cari_bakiyeler($1::uuid)", [k.klinik]));
  sonuc.push(await olc("kredi_karti_borc_ozetleri", "select * from kredi_karti_borc_ozetleri($1::uuid)", [k.klinik]));
  sonuc.push(await olc("v_hasta_cari_ozet (Cari Alacaklar sayfası, tüm klinik)", "select * from v_hasta_cari_ozet order by kalan_bakiye desc, toplam_bakiye desc, hasta_id"));
  sonuc.push(await olc("v_hasta_ozet (tek hasta)", "select bakiye from v_hasta_ozet where hasta_id = (select id from hasta where klinik_id = $1 limit 1)", [k.klinik]));
  sonuc.push(await olc("Kasa sayfası: 1 ay nakit ödeme/iade listesi", "select id, created_at, tutar, tur from hasta_bakiye_hareket where tur in ('odeme','iade') and odeme_yontemi = 'nakit' and created_at >= $1::timestamptz and created_at < $2::timestamptz order by created_at, id", ["2025-06-01 00:00+03", "2025-07-01 00:00+03"]));
  sonuc.push(await olc("Kesilen Faturalar: 1 ay borç listesi (join'li)", "select b.id, h.ad_soyad from hasta_bakiye_hareket b left join hasta h on h.id = b.hasta_id where b.tur = 'borc' and b.created_at >= $1::timestamptz and b.created_at < $2::timestamptz order by b.created_at desc, b.id desc", ["2025-06-01 00:00+03", "2025-07-01 00:00+03"]));
  sonuc.push(await olc("Giderler: tüm kayıtlar (istemci süzer)", "select id, tarih, tutar from klinik_harcama order by tarih desc, id"));

  await plan("rapor_donem_ozeti içindeki tahsilat toplamı (1 ay)", "select sum(tutar) filter (where tur='odeme') from hasta_bakiye_hareket where klinik_id = current_klinik_id() and tur in ('odeme','iade') and created_at >= '2025-06-01 00:00+03' and created_at < '2025-07-01 00:00+03'");
  await plan("kasa_bakiye_once_toplam içindeki nakit toplamı", "select sum(tutar) from hasta_bakiye_hareket where klinik_id = current_klinik_id() and tur = 'odeme' and odeme_yontemi = 'nakit' and created_at < '2026-01-01 00:00+03'");
  await plan("v_hasta_cari_ozet", "select * from v_hasta_cari_ozet order by kalan_bakiye desc limit 50");
  await uyg.end();

  const yavaslar = sonuc.filter((s) => s.yavas);
  console.log(`\nÖZET: ${sonuc.length} sorgu, ${yavaslar.length} yavaş (> 250 ms)${yavaslar.length ? ": " + yavaslar.map((s) => s.ad).join("; ") : ""}`);
} finally {
  await duzenek.durdur();
}
