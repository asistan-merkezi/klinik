// Sağlık kontrolü (deploy/windows/guncelle.ps1 ve dış izleme için). Oturumsuz, tenant bağlamsız; İÇERİĞİ KISITLI:
//  - Dışarıdan (Caddy X-Real-IP ekler) yalnız {durum} döner.
//  - Ayrıntı (veritabanı gecikmesi, boş disk, güncelleme jetonu süresi) yalnız doğrudan localhost çağrısında (X-Real-IP yok ya da loopback) döner.
//  - Güncelleme jetonu: GUNCELLEME_DURUM_DOSYASI tanımlıysa guncelle.ps1'in yazdığı durum dosyası okunur; süre dolmak üzere/dolmuş/reddedilmiş/kontrol eski ise genel durum "uyari" olur (200 kalır).
// 200 = sağlıklı/uyarı, 503 = veritabanına ulaşılamıyor ya da disk kritik.
import fs from "node:fs/promises";
import { sql, withGlobal } from "@/lib/db";
import { jetonDurumuHesapla } from "@/lib/saglik/jeton-durumu";

export const dynamic = "force-dynamic";

const DISK_UYARI_BAYT = 5 * 1024 ** 3;
const DISK_KRITIK_BAYT = 1024 ** 3;

type Durum = "ok" | "uyari" | "hata";

async function diskBosBayt(): Promise<number | null> {
  const kok = process.env.DOSYA_KOKU;
  if (!kok) return null;
  try {
    const s = await fs.statfs(kok);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

async function jetonDurumu() {
  const yol = process.env.GUNCELLEME_DURUM_DOSYASI;
  if (!yol) return null;
  let ham: string | null = null;
  try {
    ham = await fs.readFile(yol, "utf8");
  } catch {
    ham = null;
  }
  return jetonDurumuHesapla(ham, new Date());
}

export async function GET(istek: Request) {
  const gercekIp = istek.headers.get("x-real-ip");
  const yerel = !gercekIp || gercekIp === "127.0.0.1" || gercekIp === "::1";

  let db: "ok" | "hata" = "hata";
  const bas = Date.now();
  try {
    await withGlobal((tx) => tx.execute(sql`select 1`));
    db = "ok";
  } catch {
    db = "hata";
  }
  const dbMs = Date.now() - bas;

  const bos = await diskBosBayt();
  let disk: Durum = "ok";
  if (bos === null) disk = "hata";
  else if (bos < DISK_KRITIK_BAYT) disk = "hata";
  else if (bos < DISK_UYARI_BAYT) disk = "uyari";

  const jeton = await jetonDurumu();
  const jetonSorunlu = jeton !== null && jeton.durum !== "ok";

  const durum: Durum = db === "hata" || disk === "hata" ? "hata" : disk === "uyari" || jetonSorunlu ? "uyari" : "ok";
  const govde = yerel
    ? { durum, db, db_ms: dbMs, disk, disk_bos_gb: bos === null ? null : Math.round((bos / 1024 ** 3) * 10) / 10, ...(jeton ? { guncelleme_jetonu: jeton.durum, jeton_kalan_gun: jeton.kalanGun } : {}) }
    : { durum };
  return Response.json(govde, { status: durum === "hata" ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
