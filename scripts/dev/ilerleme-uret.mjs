// docs/tasima-ilerleme.md üretir: modül başına durum, taşınan dosya sayısı, kalan Supabase import'u (canlı sayım).
// Kullanım (repo kökünden): node scripts/dev/ilerleme-uret.mjs      Durum/not düzenlemek için aşağıdaki MODULLER tablosunu değiştir.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Kurallar SIRALIDIR: ilk eşleşen kazanır (özel olan genelden önce).
const MODULLER = [
  { id: 7, ad: "Çıkış uçları: PDF, e-posta/mesaj, cron/arka plan, chatbot", durum: "bekliyor", not: "Cron route'ları scripts/'e (bakim_rolu) taşınıp silinecek; PDF -> CHROMIUM_PATH; mesaj merkezi istemcisi withTenant; chatbot bayrakla kapalı." },
  { id: 1, ad: "Kullanıcı/profil, klinik ayarları, ortak yardımcılar", durum: "bitti", not: "Taşınan: lib/auth (oturum bağlamı, gecerliKullanici/gecerliHasta, yetki.ts), panel layout/actions, ayarlar (şirket bilgileri, yetkilendirme, muhasebe sync), dosya deposu (lib/dosya, logo route'ları), gece zorunlu çıkış (sunucu tarafı, ScheduledLogout silindi), oturum kilidi dosyaları silindi. KALINTI (bilinçli): lib/auth/eylem-yetkisi.ts (8 taşınmamış çağıran var) ve lib/supabase/* son modülde silinecek; yeni migration 0006 (parasut_secret_var)." },
  { id: 4, ad: "Ödeme / cari / finans / paket / işlem tanımları", durum: "bekliyor", not: "" },
  { id: 5, ad: "Personel ve puantaj (QR akışı dahil)", durum: "bekliyor", not: "" },
  { id: 3, ad: "Muayene: tablet, tedavi protokolleri, kaynaklar, belge/foto", durum: "bekliyor", not: "Realtime (tablet) SSE + LISTEN/NOTIFY gerektirir (Aşama 6); belge/foto dosya katmanı gerektirir (Aşama 5)." },
  { id: 2, ad: "Hasta ve randevu (portal, QR kayıt/anket, canlı çizelge dahil)", durum: "bitti", not: "Taşındı: randevu (actions, sorgular, canlı çizelge/tablet/bildirimler sunucu verisiyle), hasta (liste, detay, actions, veri-actions), portal, QR ön kayıt/anket/iş başvurusu/seans anketi (kısa kod + anonim kapı, gizli klinik_id kalktı, lib/qr/hiz-siniri silindi), hasta belgeleri (diskte, yetkili route /api/hasta-belge/[id], imza doğrulama), arşiv içe aktarma (hasta/randevu), QR yönetimi, resmi tatiller, elle mesaj. Yeni migration: 0009 (terapist_uygunluk_getir), 0010 (hasta_kullanici INSERT), 0011 (mesaj kuyruğu INSERT + kural SELECT). KALINTI (bilinçli, sonraki modüller): lib/qr/{klinik-bilgisi,qr-kod-aktif-mi}.ts ince sarmalayıcı (puantaj, Modül 5), lib/mesaj/randevu-hatirlatma-tarama.ts + lib/tatil/oneri-uret-admin.ts (cron, Modül 7), odeme-paket arşiv sihirbazı (Modül 4), PDF route'ları (Modül 7). KARAR BEKLEYEN: (1) resmi tatil `Şimdi kontrol et` butonu artık yazmıyor (global resmi_tatil/öneri yazımı yalnız aylık betikte; kullanıcıya yazma yetkisi verilmedi); (2) elle hasta mesajı anında göndermiyor, kuyruğa alıyor (kuyruk işçisi gönderir); (3) 0011 politikaları (mesaj_kurallari SELECT + mesaj_kuyrugu INSERT, klinik_admin/resepsiyon/terapist) service-role-siniflama (b) kararının gerektirdiği dar yetkilerdir." },
  { id: 6, ad: "Kalan modüller (destek, yönetim, vb.)", durum: "bekliyor", not: "" },
];
const KURALLAR = [
  [7, /^app\/api\/(cron|.*pdf|destek-chatbot)|^lib\/mesaj\/|^app\/\(app\)\/panel\/ayarlar\/mesajlasma|^lib\/pdf/],
  [4, /^app\/\(app\)\/panel\/(finans|paketler|islemler)|^lib\/(finans|raporlar|paket|ice-aktarma)|^app\/\(app\)\/panel\/ayarlar\/arsiv-ice-aktarma\/odeme-paket/],
  [5, /^app\/\(app\)\/panel\/personel|^app\/\(app\)\/puantaj|^lib\/personel|^app\/\(app\)\/panel\/ayarlar\/personel-tanimlama/],
  [3, /^app\/\(app\)\/panel\/(tablet|tedavi-protokolleri|kaynaklar)|^app\/\(app\)\/panel\/hastalar\/\[id\]\/belgeler|^app\/api\/hasta-belge/],
  [2, /^app\/\(app\)\/panel\/page\.tsx|^app\/\(app\)\/panel\/(hastalar|randevular)|^app\/\(app\)\/portal|^app\/\(app\)\/(anket|kayit)|^lib\/(randevu|hasta|qr|tatil)|^components\/(panel|hasta)|^app\/api\/hasta-arama|^app\/\(app\)\/panel\/ayarlar\/arsiv-ice-aktarma|^app\/\(app\)\/panel\/ayarlar\/qr-kodlar|^app\/\(app\)\/panel\/ayarlar\/resmi-tatiller/],
  [1, /^lib\/(auth|supabase)|^app\/\(app\)\/panel\/(layout|actions)|^app\/\(app\)\/panel\/ayarlar|^components\/[^/]+$/],
];
const modulBul = (dosya) => (KURALLAR.find(([, r]) => r.test(dosya)) ?? [6])[0];

const taranan = ["app", "lib", "components", "proxy.ts"];
function tara(yol, cikti = []) {
  const tam = path.join(KOK, yol);
  if (!fs.existsSync(tam)) return cikti;
  if (fs.statSync(tam).isFile()) { if (/[.]tsx?$/.test(yol)) cikti.push(yol.split(path.sep).join("/")); return cikti; }
  for (const ad of fs.readdirSync(tam)) if (ad !== "node_modules" && ad !== ".next") tara(path.join(yol, ad), cikti);
  return cikti;
}
// Yalnız gerçek import'lar sayılır (yorumlardaki anmalar sayılmaz); lib/supabase/* kendisi de sayılır (sonunda silinecek).
const IMPORT = /(^|\n)\s*(import|export)[^;\n]*from\s+["'](@supabase\/[^"']*|@\/lib\/supabase\/[^"']*)["']|import\(["']@\/lib\/supabase\/|createAdminClient\(/;
const tumKalan = taranan.flatMap((y) => tara(y)).filter((d) => /^lib\/supabase\//.test(d) || IMPORT.test(fs.readFileSync(path.join(KOK, d), "utf8")));
const baslangic = fs.readFileSync(path.join(KOK, "scripts/dev/tasima-baslangic.txt"), "utf8").split("\n").filter(Boolean);

const satirlar = MODULLER.slice().sort((a, b) => a.id - b.id).map((m) => {
  const bas = baslangic.filter((d) => modulBul(d) === m.id);
  const k = tumKalan.filter((d) => modulBul(d) === m.id);
  return { ...m, toplam: bas.length, kalan: k.length, tasinan: Math.max(0, bas.length - k.length), kalanDosyalar: k };
});
let md = `# Taşıma İlerlemesi (Supabase → Drizzle + withTenant + Better Auth)\n\n`;
md += `> Bu dosya \`node scripts/dev/ilerleme-uret.mjs\` ile üretilir (sayımlar canlı). **Durum/not düzenlemek için scripts/dev/ilerleme-uret.mjs içindeki MODULLER tablosunu değiştir.**\n\n`;
md += `## NEREDEN DEVAM EDİLECEK (bir sonraki oturum için)\n\n`;
md += `${process.env.DEVAM_NOTU ?? fs.readFileSync(path.join(KOK, "scripts/dev/devam-notu.md"), "utf8")}\n\n`;
md += `## Özet\n\n| # | Modül | Durum | Taşınan / Toplam | Kalan Supabase import'lu dosya |\n|---|---|---|---|---|\n`;
for (const s of satirlar) md += `| ${s.id} | ${s.ad} | **${s.durum}** | ${s.tasinan} / ${s.toplam} | ${s.kalan} |\n`;
const tb = satirlar.reduce((a, s) => a + s.toplam, 0), tk = satirlar.reduce((a, s) => a + s.kalan, 0);
md += `| | **Toplam** | | ${tb - tk} / ${tb} | **${tk}** |\n\n`;
md += `Not: "Toplam" taşıma başlangıcındaki dosya listesidir (\`scripts/dev/tasima-baslangic.txt\`, ${baslangic.length} dosya); sayım \`@supabase\`, \`@/lib/supabase\` ve \`createAdminClient\` kullanan dosyaları kapsar. \`lib/supabase/*\` en sonda silinir.\n\n`;
for (const s of satirlar) {
  md += `## Modül ${s.id} — ${s.ad}\n\n- Durum: **${s.durum}**${s.not ? `\n- Not: ${s.not}` : ""}\n- Kalan dosyalar (${s.kalan}):${s.kalan ? "\n" + s.kalanDosyalar.map((d) => `  - \`${d}\``).join("\n") : " —"}\n\n`;
}
md += `## Taşırken temizlenecekler (takip)\n\nBkz. \`scripts/dev/devam-notu.md\` ve bu dosyanın modül notları. Temizlik kalemleri: QR formundaki gizli \`klinik_id\` alanı (tenant yalnız kısa koddan), \`lib/qr/hiz-siniri.ts\` (fail-closed), \`ScheduledLogout\`, tek oturum kilidi dosyaları (\`lib/auth/oturum-kilidi.ts\`, \`giris-hiz-siniri.ts\`), \`lib/supabase/*\`, \`vercel.json\`, \`@supabase/*\` paketleri.\n`;
fs.writeFileSync(path.join(KOK, "docs/tasima-ilerleme.md"), md, "utf8");
console.log(satirlar.map((s) => `${s.id} ${s.durum} ${s.tasinan}/${s.toplam} kalan ${s.kalan}`).join("\n"));
