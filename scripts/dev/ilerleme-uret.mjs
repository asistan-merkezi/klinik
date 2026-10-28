// docs/tasima-ilerleme.md üretir: modül başına durum, taşınan dosya sayısı, kalan Supabase import'u (canlı sayım).
// Kullanım (repo kökünden): node scripts/dev/ilerleme-uret.mjs      Durum/not düzenlemek için aşağıdaki MODULLER tablosunu değiştir.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Kurallar SIRALIDIR: ilk eşleşen kazanır (özel olan genelden önce).
const MODULLER = [
  { id: 7, ad: "Çıkış uçları: PDF, e-posta/mesaj, cron/arka plan, chatbot", durum: "bitti", not: "Taşındı: PDF (sistem Chrome, semafor, ağ/dosya erişimi kapalı), e-posta (Resend), KVKK uyumlu mesaj içeriği + tek kullanımlık bağlantılar (/b/[token]), kuyruk işçisi, cron route'ları → scripts/bakim (bakim_rolu + klinik başına sistem bağlamı, Task Scheduler), izin belgesi/kaşe sunumu, SSE oturum denetimi, Supabase/Vercel final temizliği. Yeni migration: 0016. Ayrıntı ve KARAR BEKLEYEN maddeler aşağıda." },
  { id: 1, ad: "Kullanıcı/profil, klinik ayarları, ortak yardımcılar", durum: "bitti", not: "Taşınan: lib/auth (oturum bağlamı, gecerliKullanici/gecerliHasta, yetki.ts), panel layout/actions, ayarlar (şirket bilgileri, yetkilendirme, muhasebe sync), dosya deposu (lib/dosya, logo route'ları), gece zorunlu çıkış (sunucu tarafı, ScheduledLogout silindi), oturum kilidi dosyaları silindi. KALINTI (bilinçli): lib/auth/eylem-yetkisi.ts (8 taşınmamış çağıran var) ve lib/supabase/* son modülde silinecek; yeni migration 0006 (parasut_secret_var)." },
  { id: 4, ad: "Ödeme / cari / finans / paket / işlem tanımları", durum: "bitti", not: "Taşındı: Kasa/Banka/Kredi Kartı, Giderler (4 sekme), Gelirler Takibi/Faturalar, Raporlar, kategori-iskonto, paketler, tedavi tanımları, ödeme-paket arşiv sihirbazı. Yeni: lib/para.ts (kuruş aritmetiği, tek yuvarlama kuralı), mali eylemlerde idempotency (0012 islem_anahtari), defter CHECK'leri, islem_tanimi_kaydet tenant doğrulaması, Paraşüt secret şifreleme. Ayrıntı ve KARAR BEKLEYEN maddeler (§8) aşağıda." },
  { id: 5, ad: "Personel ve puantaj (QR akışı dahil)", durum: "bitti", not: "Taşındı: personel hub/detay/eylemler (hesap oluşturma = kimlik hesabı + tek tenant transaction, hata olursa kimlik hesabı geri silinir; işten çıkışta hesap devre dışı + oturumlar iptal), iş başvuruları, pozisyon tanımları, izin (talep/onay/ret/iptal, manuel izin-rapor), puantaj cetveli (gün, FM onayı, dönem kapat/aç), maaş ayarları + cari hesap + toplu ödeme (kuruş, idempotency anahtarı), QR puantaj (kısa kod → klinik, kişi oturumdan). Hakediş/maaş aritmetiği kuruşa geçti (lib/maas.ts, lib/personel/hakedis.ts; oranlaKurus yarım-yukarı). Yeni migration 0014 (izin_bildirim_alicilari, dar DEFINER). Dosyalar diskte: izin belgesi + kaşe (personel-belge) — SUNUM ROTASI YOK (UI yalnız 'yüklendi' der; PDF formu Modül 7). KALINTI: lib/personel/{donem-maasi,seans-sayisi}.ts eski supabase sürümleri (personel dönem kapama cron'u için, Modül 7). KARAR BEKLEYEN: muhasebe rolünün izin talebi bildirimi mesaj_kuyrugu INSERT politikası (0011) muhasebeyi kapsamadığı için kuyruğa yazılmıyor (best-effort). Testler: tests/db/modul-personel.test.ts (22)." },
  { id: 3, ad: "Muayene: tablet, tedavi protokolleri, kaynaklar, belge/foto", durum: "bitti", not: "Taşındı: kaynaklar (oda/cihaz, pasife alma kontrolü), tedavi protokolleri (protokol+adımlar tek transaction), tablet (oda seçimi, ayarlar, ekran sayfası DAR veri şekliyle), belge/foto (Modül 2'de diskte). Yeni migration yok." },
  { id: 2, ad: "Hasta ve randevu (portal, QR kayıt/anket, canlı çizelge dahil)", durum: "bitti", not: "Taşındı: randevu (actions, sorgular, canlı çizelge/tablet/bildirimler sunucu verisiyle), hasta (liste, detay, actions, veri-actions), portal, QR ön kayıt/anket/iş başvurusu/seans anketi (kısa kod + anonim kapı, gizli klinik_id kalktı, lib/qr/hiz-siniri silindi), hasta belgeleri (diskte, yetkili route /api/hasta-belge/[id], imza doğrulama), arşiv içe aktarma (hasta/randevu), QR yönetimi, resmi tatiller, elle mesaj. Yeni migration: 0009 (terapist_uygunluk_getir), 0010 (hasta_kullanici INSERT), 0011 (mesaj kuyruğu INSERT + kural SELECT). KALINTI (bilinçli, sonraki modüller): lib/qr/{klinik-bilgisi,qr-kod-aktif-mi}.ts ince sarmalayıcı (puantaj, Modül 5), lib/mesaj/randevu-hatirlatma-tarama.ts + lib/tatil/oneri-uret-admin.ts (cron, Modül 7), odeme-paket arşiv sihirbazı (Modül 4), PDF route'ları (Modül 7). KARAR BEKLEYEN: (1) resmi tatil `Şimdi kontrol et` butonu artık yazmıyor (global resmi_tatil/öneri yazımı yalnız aylık betikte; kullanıcıya yazma yetkisi verilmedi); (2) elle hasta mesajı anında göndermiyor, kuyruğa alıyor (kuyruk işçisi gönderir); (3) 0011 politikaları (mesaj_kurallari SELECT + mesaj_kuyrugu INSERT, klinik_admin/resepsiyon/terapist) service-role-siniflama (b) kararının gerektirdiği dar yetkilerdir." },
  { id: 6, ad: "Destek ve yönetim (destek, chatbot, talep/şikayet, denetim geçmişi, gelmeme analizi, destek bağlamı)", durum: "bitti", not: "Taşındı: destek (ana, kılavuz, chatbot), talep-şikayetler (actions+sayfa), yonetim (ana, denetim-geçmişi, gelmeme-analizi) + YENİ super_admin yüzeyi /panel/yonetim/destek-baglami. Yeni migration 0015: destek_baglami (süre sınırlı ≤120 dk, gerekçeli, audit_log'a açılış/kapanış satırı; current_klinik_id() super_admin için YALNIZ aktif bağlamdaki kliniği döndürür → süre sınırı DB'de), klinik_uygulama için klinik_id'li her RLS'li tabloya RESTRICTIVE zorunlu_tenant_siniri politikası (166 politikadaki 'OR is_super_admin()' dalı artık klinikler arası sızdırmaz), audit_log ve destek_talebi SELECT politikalarında super_admin bypass'ı kaldırıldı, audit_detay_temizle() (maaş/TC/pasaport/IBAN/sağlık metni DEĞERLERİ yazılırken silinir; v1+v2 tetikleyicileri). Chatbot DESTEK_CHATBOT_ACIK bayrağıyla varsayılan KAPALI (kapalıyken route oturum/gövde/model'e dokunmadan 404; açıkken TC/IBAN/kart/telefon/e-posta maskelenir; app/api/destek-chatbot/route.test.ts). Klinik OLUŞTURMA web yüzeyinde yok (klinik_uygulama klinik INSERT yetkisi yok; kaynak taraması testi). createAdminClient bu modülde yok. Denetim gösterimi: lib/denetim/maskele.ts (alan adı + değer deseni). Testler: tests/db/modul-yonetim.test.ts (16, 100k satır EXPLAIN dahil), lib/denetim/gorunum.test.ts (+3), talep-listesi.test.tsx (XSS, 2), route.test.ts (9). KALINTI/KARAR: (1) talep/şikayet dosya eki özelliği YOK (eklenirse lib/dosya katmanından geçmeli; kategori eklenmeli); (2) mevcut (0015 öncesi) audit_log satırlarındaki hassas değerler DB'de durur (UPDATE yetkisi yok) — gösterimde maskelenir; (3) klinik tablosu super_admin'e tüm klinikler için SELECT açık (destek bağlamı klinik listesi için; hasta verisi içermez); (4) chatbot'u AÇMAK KVKK/hukuk kararıdır." },
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

const taranan = ["app", "lib", "components", "proxy.ts", "scripts/bakim", "tests/db", "tests/e2e"];
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
md += `**Kalan Supabase importları: ${tumKalan.length}**\n\n`;
md += `Not: "Toplam" taşıma başlangıcındaki dosya listesidir (\`scripts/dev/tasima-baslangic.txt\`, ${baslangic.length} dosya); sayım \`@supabase\`, \`@/lib/supabase\` ve \`createAdminClient\` kullanan dosyaları kapsar. \`lib/supabase/*\` en sonda silinir.\n\n`;
for (const s of satirlar) {
  md += `## Modül ${s.id} — ${s.ad}\n\n- Durum: **${s.durum}**${s.not ? `\n- Not: ${s.not}` : ""}\n- Kalan dosyalar (${s.kalan}):${s.kalan ? "\n" + s.kalanDosyalar.map((d) => `  - \`${d}\``).join("\n") : " —"}\n\n`;
  const ayrinti = path.join(KOK, `scripts/dev/modul-${s.id}-ayrinti.md`);
  if (fs.existsSync(ayrinti)) md += `${fs.readFileSync(ayrinti, "utf8")}\n\n`;
}
md += `## Taşırken temizlenecekler (takip)\n\nBkz. \`scripts/dev/devam-notu.md\` ve bu dosyanın modül notları. Temizlik kalemleri: QR formundaki gizli \`klinik_id\` alanı (tenant yalnız kısa koddan), \`lib/qr/hiz-siniri.ts\` (fail-closed), \`ScheduledLogout\`, tek oturum kilidi dosyaları (\`lib/auth/oturum-kilidi.ts\`, \`giris-hiz-siniri.ts\`), \`lib/supabase/*\`, \`vercel.json\`, \`@supabase/*\` paketleri.\n`;
fs.writeFileSync(path.join(KOK, "docs/tasima-ilerleme.md"), md, "utf8");
console.log(satirlar.map((s) => `${s.id} ${s.durum} ${s.tasinan}/${s.toplam} kalan ${s.kalan}`).join("\n"));
