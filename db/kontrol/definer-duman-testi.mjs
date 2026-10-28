// SECURITY DEFINER fonksiyonları için üç durumlu duman testi (iki klinikli deneme düzeneği):
//   A) bağlam yok            : app.user_id / app.tenant_id verilmez, argümanlar K1'in gerçek kayıtları
//   B) yanlış tenant         : bağlam K2'nin (kullanıcı + tenant), argümanlar K1'in gerçek kayıtları
//   C) doğru tenant          : bağlam K1, argümanlar K1
//   D) DESTEK BAĞLAMI (0015) : super_admin, K1 için AKTİF destek bağlamı + tenant K1; argümanlar K2'nin (BAŞKA kliniğin) kayıtları → K2 verisi sızmamalı
//   E) destek bağlamı, SAHTE tenant: aynı super_admin, app.tenant_id=K2 (bağlamı olmadığı klinik), argümanlar K2 → hiçbir şey dönmemeli/değişmemeli
// Beklenti: A ve B'de fonksiyon hata verir, boş/false döner ve HİÇBİR veriyi değiştirmez → "GEÇTİ".
//           Veri döndürür ya da K1'in verisini değiştirirse → "SIZINTI" (izinli istisna listesi hariç).
// C yalnız bilgi amaçlıdır: çalıştı mı / hangi hatayı verdi (iş kuralı hataları normaldir, "permission denied" ise sorundur).
// Sınır: argümanlar ad/tür sezgisiyle bağlanır; çoğu fonksiyon iş kuralı doğrulamasında düşer. Bu bir DUMAN testidir, doğruluk kanıtı değil.
import crypto from "node:crypto";
import { SIFRELER } from "../../scripts/dev/test-kur.mjs";

// Tasarım gereği tenant'sız / giriş öncesi çalışan fonksiyonlar: A/B'de veri dönmesi sızıntı sayılmaz, ama sonuç raporda görünür.
const TASARIM_GEREGI = new Set([
  "hiz_siniri_kullan",                                   // global sayaç
  "current_rol", "is_super_admin", "current_hasta_id", "current_klinik_id",   // ÇAĞIRANIN kendi rolü/kimliği (kendi satırından), başkasınınki değil
  "destek_baglami_aktif", "destek_baglami_kapat",        // super_admin'in KENDİ destek bağlamı kaydı (D/E bağlamında kendi kaydını görmesi/kapatması beklenen davranış)
]);

const ADAYLAR = ["hasta", "klinik", "randevu", "personel", "kullanici", "paket", "paketSatis", "islem", "oda", "terapist"];

function bos(v) {
  if (v === null || v === undefined || v === false || v === 0 || v === "0" || v === "") return true;
  if (Array.isArray(v)) return v.length === 0 || v.every(bos);
  if (typeof v === "object") return Object.values(v).every(bos);
  return false;
}

function degerSec(ad, tip, ent, tur) {
  const a = (ad ?? "").toLowerCase();
  if (tip === "uuid") {
    const eslesme = [["paket_satis", "paketSatis"], ["klinik", "klinik"], ["hasta", "hasta"], ["randevu", "randevu"], ["personel", "personel"], ["terapist", "terapist"], ["kullanici", "kullanici"], ["user", "kullanici"], ["paket", "paket"], ["islem", "islem"], ["oda", "oda"]];
    for (const [parca, anahtar] of eslesme) if (a.includes(parca)) return { deger: ent[anahtar], sabit: true };
    return { deger: ent[tur], sabit: false };
  }
  if (tip === "text" || tip.startsWith("character")) {
    if (a.includes("telefon")) return { deger: "5550000001", sabit: true };
    if (a.includes("kanal")) return { deger: "sms", sabit: true };
    return { deger: "x", sabit: true };
  }
  if (tip === "integer" || tip === "bigint" || tip === "smallint") return { deger: 1, sabit: true };
  if (tip === "numeric" || tip === "double precision") return { deger: 1, sabit: true };
  if (tip === "boolean") return { deger: false, sabit: true };
  if (tip === "date") return { deger: new Date().toISOString().slice(0, 10), sabit: true };
  if (tip.startsWith("timestamp")) return { deger: new Date().toISOString(), sabit: true };
  if (tip === "jsonb" || tip === "json") return { deger: "{}", sabit: true };
  return { deger: null, sabit: true };
}

export async function definerDumanTesti(duzenek) {
  const { ids } = duzenek;
  const c = await duzenek.baglanSuper();
  const fonks = (await c.query(`
    select p.oid, p.proname, p.oid::regprocedure::text imza, p.proargnames, p.pronargs, p.pronargdefaults, p.proretset,
           pg_get_function_result(p.oid) donus, (pg_get_functiondef(p.oid) ~* 'is_super_admin') "superAdminDali",
           array(select t::regtype::text from unnest(p.proargtypes::oid[]) t) tipler,
           has_function_privilege('klinik_uygulama', p.oid, 'EXECUTE') uyg, has_function_privilege('klinik_anonim', p.oid, 'EXECUTE') anon
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    order by p.proname, p.oid`)).rows;
  const tablolar = (await c.query(`select c.relname from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') and not c.relispartition and c.relname not like 'audit_log%' order by 1`)).rows.map((r) => r.relname);
  const veriliTablolar = [];
  for (const t of tablolar) if ((await c.query(`select 1 from ${t} limit 1`)).rowCount) veriliTablolar.push(t);
  const anlik = async () => (await c.query(veriliTablolar.map((t) => `select '${t}' t, md5(coalesce(string_agg(x::text, '|' order by x::text), '')) h, count(*) n from ${t} x`).join(" union all "))).rows.map((r) => `${r.t}:${r.n}:${r.h}`).join(",");

  const sonuclar = [];
  const sozcuk = (r) => (r.tamam ? (r.satirlar.length === 0 ? "bos" : r.satirlar.every((s) => bos(Object.values(s))) ? "bos" : "veri") : "hata");

  async function calistir(f, bag, ent, tur, rol) {
    const nOnce = f.pronargs - f.pronargdefaults;
    const adlar = f.proargnames ?? [];
    const degerler = [];
    for (let i = 0; i < nOnce; i++) degerler.push(degerSec(adlar[i], f.tipler[i], ent, tur).deger);
    const cagri = `select * from ${f.imza.replace(/\(.*$/, "")}(${degerler.map((_, i) => `$${i + 1}::${f.tipler[i]}`).join(", ")})`;
    await c.query("BEGIN");
    try {
      await c.query("SET LOCAL statement_timeout = '5s'");
      if (bag.destekKlinik) {
        // geçici super_admin + aktif destek bağlamı (işlem sonunda ROLLBACK ile silinir)
        const sa = crypto.randomUUID();
        await c.query("select set_config('app.tenant_id', $1, true)", [bag.destekKlinik]);
        await c.query("insert into kimlik_kullanici(id, eposta) values ($1, $2)", [sa, `sa-${sa}@deneme.test`]);
        await c.query("insert into kullanici(id, klinik_id, rol, ad_soyad) values ($1, null, 'super_admin', 'SA')", [sa]);
        await c.query("insert into destek_baglami(kullanici_id, klinik_id, gerekce, bitis) values ($1, $2, 'duman testi destek bağlamı', now() + interval '30 minutes')", [sa, bag.destekKlinik]);
        bag = { ...bag, kullanici: sa };
      }
      if (bag.kullanici) await c.query("select set_config('app.user_id', $1, true)", [bag.kullanici]);
      if (bag.tenant) await c.query("select set_config('app.tenant_id', $1, true)", [bag.tenant]);
      const once = await anlik();
      await c.query(`SET LOCAL ROLE ${rol}`);
      let r;
      try {
        await c.query("SAVEPOINT cagri");
        const x = await c.query(cagri, degerler);
        r = { tamam: true, satirlar: x.rows };
      } catch (e) { r = { tamam: false, hata: e.message }; }
      if (r.tamam) {
        await c.query("RESET ROLE");
        r.degisti = (await anlik()) !== once;
      }
      return { durum: r.tamam ? (r.degisti ? "degisiklik" : sozcuk(r)) : "hata", hata: r.hata, ornek: r.tamam && r.satirlar.length ? JSON.stringify(r.satirlar[0]).slice(0, 80) : undefined };
    } catch (e) {
      return { durum: "hata", hata: `düzenek: ${e.message}` };
    } finally {
      await c.query("ROLLBACK").catch(() => {});
    }
  }

  for (const f of fonks) {
    const kayit = { ad: f.proname, imza: f.imza, donus: f.donus, superAdminDali: f.superAdminDali, tur: "cagrilabilir", uygulamaCagirir: f.uyg, anonCagirir: f.anon };
    if (f.donus === "trigger") { kayit.tur = "tetikleyici"; kayit.sonuc = "TETIKLEYICI"; kayit.ayrinti = "dolaylı: ilgili tabloya yazan örnek veri / anonim kayıt testleri tenant bağlamıyla tetikledi"; sonuclar.push(kayit); continue; }
    if (!f.uyg && !f.anon) { kayit.tur = "ic"; kayit.sonuc = "IC"; kayit.ayrinti = "uygulama/anonim EXECUTE yetkisi yok: yalnız tetikleyici/başka fonksiyon/bakım betiği çağırabilir"; sonuclar.push(kayit); continue; }
    const rol = f.uyg ? "klinik_uygulama" : "klinik_anonim";
    const sabitVar = f.tipler.some((t, i) => t === "uuid" && degerSec(f.proargnames?.[i], t, ids.k1, "hasta").sabit);
    const belirsizUuid = f.tipler.some((t, i) => t === "uuid" && !degerSec(f.proargnames?.[i], t, ids.k1, "hasta").sabit);
    const turler = belirsizUuid ? ADAYLAR : ["hasta"];
    void sabitVar;
    const durumlar = { a: [], b: [], c: [], d: [], e: [] };
    for (const tur of turler) {
      durumlar.a.push(await calistir(f, {}, ids.k1, tur, rol));
      durumlar.b.push(await calistir(f, { kullanici: ids.k2.kullanici, tenant: ids.k2.klinik }, ids.k1, tur, rol));
      durumlar.c.push(await calistir(f, { kullanici: ids.k1.kullanici, tenant: ids.k1.klinik }, ids.k1, tur, rol));
      // D/E: argümanlar BAŞKA kliniğin (K2) kayıtları; destek bağlamı yalnız K1 için açık
      durumlar.d.push(await calistir(f, { destekKlinik: ids.k1.klinik, tenant: ids.k1.klinik }, ids.k2, tur, rol));
      durumlar.e.push(await calistir(f, { destekKlinik: ids.k1.klinik, tenant: ids.k2.klinik }, ids.k2, tur, rol));
    }
    const en = (liste) => (liste.find((x) => x.durum === "degisiklik") ?? liste.find((x) => x.durum === "veri") ?? liste.find((x) => x.durum === "bos") ?? liste[0]);
    kayit.a = en(durumlar.a); kayit.b = en(durumlar.b); kayit.c = en(durumlar.c); kayit.d = en(durumlar.d); kayit.e = en(durumlar.e);
    kayit.superAdminDali = f.superAdminDali;
    const sizinti = [kayit.a, kayit.b, kayit.d, kayit.e].some((x) => x.durum === "veri" || x.durum === "degisiklik");
    const izin = TASARIM_GEREGI.has(f.proname);
    kayit.sonuc = sizinti ? (izin ? "TASARIM_GEREGI" : "SIZINTI") : "GECTI";
    if (sizinti) kayit.ayrinti = `A:${kayit.a.durum}${kayit.a.ornek ? " " + kayit.a.ornek : ""} · B:${kayit.b.durum}${kayit.b.ornek ? " " + kayit.b.ornek : ""} · D:${kayit.d.durum}${kayit.d.ornek ? " " + kayit.d.ornek : ""} · E:${kayit.e.durum}${kayit.e.ornek ? " " + kayit.e.ornek : ""}`;
    if (kayit.c.hata && /permission denied/i.test(kayit.c.hata)) { kayit.sonuc = kayit.sonuc === "SIZINTI" ? "SIZINTI" : "YETKI_SORUNU"; kayit.ayrinti = (kayit.ayrinti ?? "") + ` C: ${kayit.c.hata}`; }
    sonuclar.push(kayit);
  }
  await c.end();
  void SIFRELER;
  return { uretim: "db/kontrol/definer-duman-testi.mjs", veriliTablolar, sonuclar };
}
