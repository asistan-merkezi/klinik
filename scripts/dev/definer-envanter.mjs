// DEFINER fonksiyon envanteri: ad, imza, dönüş, değişkenlik, dokunduğu tablolar (gövdeden), yazıyor mu, son migration'daki açıklama yorumu.
// Çıktı: stdout JSON (docs/definer-siniflama.md üretimi için ham veri). Kullanım: node scripts/dev/definer-envanter.mjs > /tmp/denv.json
import fs from "node:fs";
import path from "node:path";
import { kumeBaslat, KOK } from "./kume.mjs";

const k = await kumeBaslat("test", Number(process.env.DEV_TEST_PORT ?? 54331));
try {
  const c = await k.baglan("klinik");
  const f = (await c.query(`select p.proname ad, p.oid::regprocedure::text imza, pg_get_function_result(p.oid) donus, p.provolatile v, pg_get_functiondef(p.oid) def,
     has_function_privilege('klinik_uygulama',p.oid,'EXECUTE') uyg, has_function_privilege('klinik_anonim',p.oid,'EXECUTE') anon, has_function_privilege('bakim_rolu',p.oid,'EXECUTE') bakim
    from pg_proc p where p.pronamespace='public'::regnamespace and p.prosecdef and p.prokind='f' and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e') order by 1`)).rows;
  const tablolar = (await c.query(`select relname from pg_class where relnamespace='public'::regnamespace and relkind in ('r','p','v','m') and not relispartition`)).rows.map((r) => r.relname);
  await c.end();
  const mig = path.join(KOK, "db/arsiv/eski-migrationlar");
  const dosyalar = fs.readdirSync(mig).filter((x) => x.endsWith(".sql")).sort().reverse();
  const kaynaklar = new Map(dosyalar.map((d) => [d, fs.readFileSync(path.join(mig, d), "utf8")]));
  const cikti = f.map((x) => {
    const govde = x.def.slice(x.def.indexOf("$function$"));
    const dokunulan = tablolar.filter((t) => new RegExp("(^|[^a-z_0-9])" + t + "([^a-z_0-9]|$)").test(govde));
    const yazar = /(insert\s+into|update\s+[a-z_]+\s+set|delete\s+from|execute\s+format|alter\s+table|create\s+table)/i.test(govde);
    let aciklama = "";
    const kalip = new RegExp("create\\s+(or\\s+replace\\s+)?function\\s+(public\\.)?" + x.ad + "\\s*\\(", "i");
    for (const [, t] of kaynaklar) {
      const m = kalip.exec(t);
      if (!m) continue;
      const onceki = t.slice(Math.max(0, m.index - 900), m.index).split("\n").reverse();
      const yorum = [];
      for (const s of onceki.slice(1)) {
        if (s.trim().startsWith("--")) yorum.unshift(s.trim().replace(/^--\s?/, ""));
        else if (s.trim() === "" && yorum.length === 0) continue;
        else break;
      }
      aciklama = yorum.join(" ").slice(0, 400);
      break;
    }
    return { ad: x.ad, imza: x.imza, donus: x.donus, hacim: x.v, uyg: x.uyg, anon: x.anon, bakim: x.bakim, tablolar: dokunulan, yazar, aciklama };
  });
  console.log(JSON.stringify(cikti, null, 1));
} finally {
  await k.durdur();
}
