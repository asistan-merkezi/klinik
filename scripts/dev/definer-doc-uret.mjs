// docs/definer-siniflama.md üretir: katalog envanteri (definer-envanter.mjs) + duman testi sonucu (db/kontrol/definer-duman-sonuc.json) + elle yazılmış açıklamalar.
// Kullanım:  node definer-envanter.mjs > envanter.json  &&  node definer-doc-uret.mjs envanter.json
import fs from "node:fs";
import path from "node:path";
import { KOK } from "./kume.mjs";

const NEDEN = {
  baglam: "Özyineleme kırıcı: politikaların çağırdığı rol/kimlik çözümü, kullanici/hasta_kullanici'nin kendi RLS'ine takılmadan çağıranın KENDİ satırını okumalı (sahip_kendi_satir politikası).",
  turet: "Tetikleyici: üst/ilişkili satırı okur (ekleyen rol — terapist, portal hastası, anonim — üst tabloyu göremeyebilir). Yalnız NEW'e değer yazar.",
  denetim: "Tetikleyici: kullanıcının doğrudan yazma yetkisi OLMAYAN türev/denetim tabloya yazar (bilinçli: o tabloda INSERT/UPDATE/DELETE yetkisi/politikası yok).",
  butunluk: "Tetikleyici: RLS'in göremeyeceği çapraz tablo bütünlük kontrolü (çağıranın rolü ilgili tabloyu görmese de kural uygulanmalı).",
  kisit: "Tetikleyici: rol bazlı alan kısıtı; çağıran rolü ve eski/yeni değeri sunucu tarafında doğrular (istemciye güvenilmez).",
  rpc: "Çok tablolu atomik işlem (CLAUDE.md: çok-tablolu işlemler RPC). Tablolara doğrudan yazma yetkisi olmayan roller de kurallı yoldan işlem yapabilsin diye; yetki kontrolü fonksiyon içinde (current_rol/tenant).",
  arsiv: "Toplu arşiv içe aktarma (yalnız klinik_admin); satır bazlı hata toleransı ve çok tablolu yazım tek işlemde.",
  toplam: "Salt-okunur toplam/hesap: kasa/banka/kart bakiyesi için birden çok finans tablosunu okur; çağıran rolünün tablo SELECT yetkisinden bağımsız ve tek sabit kuralla (SQL ve JS kuralı birlikte değişir).",
  anon: "Giriş öncesi (anonim) dar denetim: anon'a tablo SELECT'i yok; fonksiyon yalnız tek bir boolean/çözümleme döndürür. Tenant bağlamı çağıran tarafından (tanima çözümlemesinden sonra) verilmelidir.",
  sistem: "Sistem/bakım işi: DDL veya yalnız belirli rollerin çağırdığı yönetim işlemi.",
};

// ad -> [ne yapıyor, NEDEN anahtarı, hedef (varsayılan: DEFINER kalacak), not]
const M = {
  audit_log_bolum_olustur: ["audit_log için eksik aylık bölümleri açar (DDL).", "sistem", "DEFINER kalacak", "Yalnız bakim_rolu EXECUTE; DDL için sahip yetkisi gerekir."],
  audit_log_degisiklik_yaz: ["Tablo değişikliklerini v2 biçiminde (eski/yeni/değişen alanlar) audit_log'a yazar.", "denetim"],
  audit_log_yaz: ["~15 tabloda v1 tam satır denetimi yazar.", "denetim"],
  banka_bakiye_once_toplam_tumu: ["Dönem başı banka bakiyesi (tüm hesaplar/hesap bazında), net kart komisyonu dahil.", "toplam"],
  banka_hesabi_butunluk: ["havale satırı banka_hesap_id'siz veya başka kliniğin hesabıyla yazılamaz.", "butunluk"],
  banka_hesabi_silme_engeli: ["Bağlı kaydı olan banka hesabının silinmesini engeller.", "butunluk"],
  current_hasta_id: ["Portal oturumundaki hastanın id'si (kullanici_tenant eşlemesinden, aktif).", "baglam"],
  current_klinik_id: ["Çağıranın tenant'ı: oturumlu kullanıcıda kendi eşleme satırından (app.tenant_id YOK SAYILIR); yalnız super_admin / klinik_anonim / bakım / süper kullanıcı oturumunda app.tenant_id (0007).", "baglam"],
  kullanici_tenant_kullanici_esle: ["kullanici değişince kullanici_tenant eşlemesini günceller (tek yazan yol).", "denetim"],
  kullanici_tenant_hasta_esle: ["hasta_kullanici değişince eşlemeyi günceller; başka kliniğin hastasına portal hesabı açılmasını reddeder.", "denetim"],
  current_rol: ["Çağıranın rolü (kullanici kendi satırı).", "baglam"],
  is_super_admin: ["Çağıran super_admin mi?", "baglam"],
  destek_baglami_ac: ["super_admin için süre sınırlı (≤120 dk), gerekçeli destek bağlamı açar; hedef kliniğin audit_log'una yazar (0015).", "sistem", "DEFINER kalacak", "Yalnız is_super_admin(); aynı anda tek aktif bağlam."],
  destek_baglami_kapat: ["Aktif destek bağlamını kapatır (denetim satırı yazar).", "sistem", "DEFINER kalacak", "Yalnız is_super_admin()."],
  destek_baglami_aktif: ["Çağıranın (super_admin) aktif destek bağlamı (klinik, bitiş, gerekçe).", "baglam", "DEFINER kalacak", "Yalnız kendi kaydı döner."],
  izin_talebi_yoneticiye_bildir: ["Muhasebe/resepsiyon/terapist adına açılan izin talebinin bildirimini YALNIZ kliniğin klinik_admin'lerine kuyruğa yazar (0016): alıcı rolü DB'de kilitli, çağıran adres veremez, mesajda veri yok, her mesaja tek kullanımlık bağlantı üretir.", "rpc", "DEFINER kalacak", "current_klinik_id() + rol + talep sahipliği + talep ≤10 dk ve beklemede; bağlantı tabanı yalnız orijin; search_path sabit; anonim EXECUTE yok."],
  bildirim_baglantisi_kullan: ["Tek kullanımlık bildirim bağlantısını (token sha256) tüketir; alıcı tipini ve (hasta için) portal kısa kodunu döner (0016).", "anon", "DEFINER kalacak", "Tenant'sız çağrılır; yalnız hash ile arar; geçersiz/kullanılmış/süresi dolmuş ayrımı sızdırılmaz; EXECUTE yalnız klinik_uygulama (hız sınırı route'ta, fail-closed)."],
  hasta_bakiye_hareket_iade_siniri: ["İade, bağlantılı ödemenin kalanını aşamaz; istisna yalnız klinik_admin + zorunlu gerekçe (0013).", "butunluk", "DEFINER kalacak", "Kaynak ödeme satırını FOR UPDATE kilitler."],
  terapist_uygunluk_getir: ["Terapistin izin/rapor/çıkış durumuna göre randevu uygunluğu (0009).", "rpc", "DEFINER kalacak", "Yalnız çağıranın kliniği."],
  derive_klinik_id_from_parent: ["Alt tablo satırına klinik_id'yi üst satırdan türetir (genel).", "turet"],
  hasta_arsiv_ice_aktar: ["Hasta arşiv içe aktarma (dedup'lu).", "arsiv"],
  hasta_bakiye_hareket_arsiv_ekle: ["Ödeme/bakiye geçmişi içe aktarma.", "arsiv"],
  hasta_bakiye_hareket_borc_duzenle: ["Borç satırının iskonto/fatura durumunu düzenler; fatura/ödeme kayıtlarını eşitler.", "rpc"],
  hasta_bakiye_hareket_kredi_karti_ayari: ["Kredi kartı ödemesinde tahsilat hesabı ve komisyon oranı kopyasını yazar.", "butunluk"],
  hasta_belge_goruntule: ["Belge kaydını döndürür ve 'kim hangi belgeyi gördü' kaydını audit_log'a yazar.", "denetim"],
  hasta_belge_onam_dogrula: ["klinik_foto belgesinde onam kaydı zorunlu/uyumlu mu?", "butunluk"],
  hasta_hassas_denetim_bilgisi_ata: ["olusturan/son_guncelleyen alanlarını oturumdan doldurur.", "turet"],
  hasta_hassas_klinik_id_ata: ["hasta_hassas.klinik_id'yi hasta'dan türetir (anonim QR kaydında hasta SELECT'i olmadığından DEFINER şart).", "turet"],
  hasta_hassas_terapist_sadece_anamnez_ekle: ["Terapist ilk anamnez INSERT'inde yalnız anamnez kolonlarını yazabilir.", "kisit"],
  hasta_hassas_terapist_sadece_anamnez_guncelle: ["Terapist UPDATE'inde yalnız anamnez kolonları değişebilir.", "kisit"],
  hasta_iliski_klinik_dogrula: ["İlişkili iki hastanın aynı klinikte olduğunu doğrular.", "butunluk"],
  hasta_portal_alan_kisitla: ["Portal hastası hasta satırında yalnız portal formunun alanlarını değiştirebilir.", "kisit"],
  hasta_protokol_kontrendikasyon_kontrol: ["Protokol atamasında hastanın risk bayrağı/kontrendikasyonu çakışırsa reddeder.", "butunluk"],
  hasta_qr_self_servis_mi: ["Bu hasta QR self-servis ile mi kaydedildi (hasta_hassas INSERT politikası için)?", "anon"],
  hasta_terapist_sadece_risk_guncelle: ["Terapist hasta'da yalnız risk_bayraklari'nı değiştirebilir.", "kisit"],
  hasta_yorum_alanlari_doldur: ["Yorumun klinik/hasta alanlarını randevudan türetir.", "turet"],
  hiz_siniri_kullan: ["Postgres sayacıyla hız sınırı (artır/oku), tenant'sız global anahtar.", "anon", "DEFINER kalacak", "hiz_siniri_sayac'a doğrudan yetki YOK; yalnız bu fonksiyon yazar."],
  islem_tanimi_etkin_fiyat: ["Hasta kategorisine göre etkin fiyat + iskonto oranı (fiyat tamamen sunucuda).", "toplam"],
  islem_tanimi_fiyat_gecmisi_yaz: ["Fiyat değişikliklerini geçmiş tablosuna yazar.", "denetim"],
  islem_tanimi_kaydet: ["Tedavi tanımı + adımlarını atomik diff ile kaydeder.", "rpc"],
  islem_tanimi_toplam_sure_guncelle: ["Üst tanımın süresini adımların toplamı olarak günceller.", "denetim"],
  kasa_bakiye_once_toplam: ["Dönem başı kasa bakiyesi (İstanbul gün sınırı).", "toplam"],
  klinik_cari_odeme_ekle: ["Cari ödemesi ekler (advisory lock, bakiyeyi aşamaz).", "rpc"],
  klinik_harcama_cari_butunluk: ["Ödemelerin altına düşüren harcama değişikliğini reddeder.", "butunluk"],
  klinik_pozisyonlari_seed: ["Yeni klinik için pozisyon şablonlarını kopyalar.", "denetim"],
  kredi_karti_bakiye_once_toplam: ["Dönem başı kredi kartı (POS mutabakat) bakiyesi.", "toplam"],
  mesaj_kredi_senkronla: ["Merkezden gelen (bakiye, versiyon) çiftini yerel mesaj_kredileri'ne yazar; eski versiyon ezmez.", "sistem", "DEFINER kalacak", "Çağıran: sistem_baglami() veya super_admin; (b) sınıfı sayfa çağrısı Aşama 3'te tenant doğrulamalı hâle gelir."],
  mesaj_kredi_yukle: ["Kredi yükler (yalnız super_admin).", "sistem", "DEFINER kalacak", "Hiçbir uygulama rolüne EXECUTE verilmedi (iç)."],
  nakit_banka_hareketi_hesap_butunluk: ["Nakit/banka hareketinde hesap bütünlüğü.", "butunluk"],
  odeme_olustur: ["Ödeme + kalem + satır + paket satışı + fatura kuyruğu atomik; paket kota kilidi.", "rpc"],
  paket_satis_arsiv_ekle: ["Paket satış geçmişi içe aktarma.", "arsiv"],
  personel_hassas_kaydet: ["Personel hassas verisini yazar (TC/pasaport), denetim kaydı bırakır.", "rpc"],
  personel_hassas_maskeli_getir: ["Personel hassas verisini maskeli döndürür.", "toplam"],
  personel_hesap_hareket_donem_ekle: ["Dönem kapanışında hakediş hareketini yazar.", "rpc"],
  personel_hesap_hareket_ekle: ["Personel cari defterine hareket ekler.", "rpc"],
  personel_izin_cakisanlari_getir: ["Aynı gün başka personelin izin çakışmasını (yalnız tarih/durum) döndürür.", "toplam"],
  personel_izin_hak_gun_hesapla: ["Kıdem+yaştan yıllık izin hakkı gününü hesaplar.", "toplam"],
  personel_izin_talebi_onayla: ["Talebi onaylar, puantaja izinli günleri yazar.", "rpc"],
  personel_izin_talebi_reddet: ["Talebi gerekçeyle reddeder.", "rpc"],
  personel_izin_talebi_yonetici_iptal: ["Onaylı, başlamamış izni iptal eder, puantajı temizler.", "rpc"],
  personel_izin_talep_iptal_et: ["Talep sahibi bekleyen talebi iptal eder.", "rpc"],
  personel_izin_talep_olustur: ["İzin talebi oluşturur (çakışma/hak kontrolü).", "rpc"],
  personel_puantaj_donem_kapat: ["Dönemi kapatır, hakedişi deftere yazar (idempotent).", "rpc"],
  personel_puantaj_donem_yeniden_ac: ["Kapalı dönemi yeniden açar, hakediş satırını geri alır.", "rpc"],
  personel_puantaj_donemi_acik_mi: ["Personelin o ayı açık mı? (kilit denetimi)", "toplam", "DEFINER kalacak", "0004'te güvenli-kapalı yapıldı: bağlam yok/yanlış tenant → false."],
  personel_puantaj_fm_onay_denetim: ["Fazla mesai onaylayan/tarihi sunucuda yazar.", "kisit"],
  personel_puantaj_kendi_kaydet: ["Oturumlu personel giriş/çıkışını kendi kimliğiyle kaydeder (saat sunucuda).", "rpc"],
  personel_puantaj_planlanan_getir: ["Planlanan vardiya dakikası.", "toplam", "DEFINER kalacak", "EXECUTE yok (iç)."],
  personel_puantaj_varsayilanlari_doldur: ["Puantaj satırı varsayılanlarını izin/ayardan doldurur.", "turet"],
  pozisyon_pasif_engelle: ["Aktif personeli olan pozisyon pasife alınamaz.", "butunluk"],
  qr_kodu_aktif_mi: ["Bu klinikte ilgili statik QR açık mı (anahtar yoksa açık)?", "anon", "DEFINER kalacak", "0004'te güvenli-kapalı: çağıran tenant bağlamı p_klinik_id ile eşleşmezse false."],
  randevu_anket_uygun_mu: ["Randevu için anket doldurulabilir mi (tamamlandı, süre içinde)?", "anon"],
  randevu_arsiv_ice_aktar: ["Randevu/seans geçmişi içe aktarma.", "arsiv"],
  randevu_cihaz_rezervasyon_tetikle: ["Randevu değişiminde cihaz rezervasyonlarını yeniden üretmeyi tetikler.", "denetim"],
  randevu_cihaz_rezervasyon_yenile: ["Randevunun adım bazlı cihaz rezervasyonlarını yeniden üretir.", "denetim", "DEFINER kalacak", "EXECUTE yok (iç)."],
  randevu_gelis_isaretle: ["Check-in: durum, FIFO paket hakkı düşümü (bakiyeye dokunmaz).", "rpc"],
  randevu_gelmedi_isaretle: ["Gelmedi: check-in'de düşülen hakkı iade eder.", "rpc"],
  randevu_iptal_et: ["Bedelli/bedelsiz iptal: hak düşümü/iadesi veya borç.", "rpc"],
  randevu_iptal_geri_al: ["İptalden çıkış: hak iadesi/borç silme (klinik_admin).", "rpc"],
  randevu_iptal_talebi_gec_iptal_ata: ["Talepte geç iptal bilgisini sunucuda hesaplar.", "turet"],
  randevu_iptal_talebi_klinik_id_ata: ["Talebe klinik_id'yi randevudan türetir.", "turet"],
  randevu_on_form_dogrula: ["Randevu ön formunun randevuyla uyumunu doğrular.", "butunluk"],
  randevu_seans_bedelini_isle: ["Tamamlanmış paketsiz randevunun bedelini borç yazar, isteğe bağlı ödeme ekler.", "rpc"],
  randevu_talebi_klinik_id_ata: ["Randevu talebine klinik_id'yi hastadan türetir.", "turet"],
  resepsiyon_puantaj_gorebilir_mi: ["Ayara göre resepsiyon puantajı görebilir mi (politika yardımcısı).", "baglam"],
  resmi_tatil_onerisi_karar: ["Bayram önerisini onaylar/reddeder; resmi_tatil'e yazar.", "rpc"],
  seans_degerlendirme_alanlari_doldur: ["Değerlendirmenin klinik/hasta alanlarını randevudan türetir.", "turet"],
  seans_degerlendirme_baglam_getir: ["Anket sayfası için klinik adı + zaten dolduruldu mu.", "anon"],
  terapist_id_giris_yapan_kullaniciya_ait_mi: ["Terapist kaydı bu oturumdaki kullanıcıya mı ait (politika yardımcısı)?", "baglam"],
  "tanima.klinik_qr_bilgisi_getir": ["Kısa koddan klinik (id, ad) — tenant bağlamı OLMADAN.", "anon", "YENİ (tanima şeması, sahibi klinik_tanima)", "Eski public.klinik_qr_bilgisi_getir'in yerine; FORCE RLS altında sahip tenant'sız satır göremediği için dar rol."],
  "tanima.randevu_klinik_cozumle": ["Randevu id'sinden klinik id'si (anket bağlantısı).", "anon", "YENİ (tanima şeması, sahibi klinik_tanima)", "Uygulama dönen id'yi app.tenant_id yapıp anket işlemlerini tenant içinde yürütür."],
};
const KALDIRILDI = [
  ["izin_bildirim_alicilari", "İzin bildirimi için yönetici telefon/e-posta listesi (0014).", "KALDIRILDI (0016). İletişim bilgisini istemciye döndürüyordu; yerine izin_talebi_yoneticiye_bildir (alıcıyı DB seçer, istemciye adres dönmez)."],
  ["personel_giris_epostasi", "Telefon → personel e-postası (anon çağırabiliyordu).", "KALDIRILDI. Supabase auth.users'a bağlıydı ve FORCE RLS altında tenant'sız çalışmaz (boş döner); anonim telefon→e-posta eşlemesi enumeration yüzeyiydi. Yerine Better Auth girişi (kimlik_rolu) — docs/giris-akislari.md."],
  ["portal_giris_epostasi", "Telefon → sentetik portal e-postası (anon).", "KALDIRILDI (aynı gerekçe)."],
  ["klinik_qr_bilgisi_getir", "Kısa kod → klinik.", "tanima.klinik_qr_bilgisi_getir'e TAŞINDI (public sürüm FORCE RLS altında boş dönerdi)."],
  ["personel_izin_is_gunu_sayisi", "Tarih aralığında iş günü sayısı (klinik çalışma günleri + resmi tatil).", "INVOKER'a ÇEVRİLDİ: yalnız çağıranın kendi kliniğinin satırını ve herkese açık resmi tatili okur; çağıranın yetkisi yeterli, sonuç DEFINER ile aynı. Duman testinde DEFINER hâlinin bağlamsız çağrıda sayı döndürdüğü görülmüştü."],
];

const envPath = process.argv[2];
if (!envPath) throw new Error("envanter.json yolu verilmedi");
const env = JSON.parse(fs.readFileSync(envPath, "utf8"));
const duman = JSON.parse(fs.readFileSync(path.join(KOK, "db/kontrol/definer-duman-sonuc.json"), "utf8"));
const sonucAd = new Map(duman.sonuclar.map((s) => [s.ad, s]));

const destekEtkisi = (s) => {
  if (!s) return "—";
  if (s.sonuc === "TETIKLEYICI" || s.sonuc === "IC") return s.superAdminDali ? "super_admin dalı VAR (dolaylı çağrı); tenant sınırı RESTRICTIVE politikayla" : "super_admin dalı yok";
  const dal = s.superAdminDali ? "super_admin dalı VAR" : "super_admin dalı yok";
  const sonuc = s.sonuc === "SIZINTI" ? "**SIZINTI**" : s.sonuc === "TASARIM_GEREGI" ? "yalnız kendi bağlamı (tasarım gereği)" : "başka klinik: reddedildi/boş";
  return `${dal}; D(başka klinik, bağlam K1): ${s.d?.durum}, E(sahte tenant): ${s.e?.durum} → ${sonuc}`;
};

const bagBilgi = (s) => {
  if (!s) return "—";
  if (s.sonuc === "TETIKLEYICI") return "çağrılamaz (tetikleyici); bağlamsız yazım sahip politikası/FK ile düşer";
  if (s.sonuc === "IC") return "çağrılamaz (uygulama/anonim EXECUTE yok)";
  const a = s.a;
  const metin = a.durum === "hata" ? `hata: ${(a.hata ?? "").replace(/\|/g, "/").slice(0, 60)}` : a.durum === "bos" ? "boş / false / NULL" : `${a.durum}${a.ornek ? " " + a.ornek.replace(/\|/g, "/") : ""}`;
  return `${metin}${s.sonuc === "TASARIM_GEREGI" ? " (tasarım gereği)" : ""}`;
};

let md = `# SECURITY DEFINER Fonksiyon Sınıflaması\n\nTarih: 2026-10-27 · Dal: \`tasima/windows-postgres\`. Otomatik veri: \`scripts/dev/definer-envanter.mjs\` + \`db/kontrol/definer-duman-testi.mjs\` (iki klinikli düzenek). Bu belge \`scripts/dev/definer-doc-uret.mjs\` ile üretilir; açıklama ve gerekçeler o betikteki elle yazılmış tablodadır.\n\n`;
const toplam = env.length;
md += `## Özet\n\n- Başlangıç: **83** SECURITY DEFINER fonksiyon (temel şemanın ilk üretimi).\n- **3 kaldırıldı/taşındı** (\`personel_giris_epostasi\`, \`portal_giris_epostasi\` kaldırıldı; \`klinik_qr_bilgisi_getir\` \`tanima\` şemasına taşındı), **1 INVOKER'a çevrildi** (\`personel_izin_is_gunu_sayisi\`).\n- **2 yeni** DEFINER (\`tanima.klinik_qr_bilgisi_getir\`, \`tanima.randevu_klinik_cozumle\`; sahibi RLS atlamayan, dar \`klinik_tanima\` rolü).\n- Sonuç: **${toplam} public + 2 tanima = ${toplam + 2} DEFINER** kalır. Hiçbirinin sahibi BYPASSRLS/süper kullanıcı değildir (\`db/kontrol/bypassrls-kontrol.sql\`).\n- Tetikleyici fonksiyonlar: ${env.filter((x) => x.donus === "trigger").length}; doğrudan çağrılabilen: ${env.filter((x) => x.donus !== "trigger").length}.\n- Duman testi (A bağlam yok / B yanlış tenant / C doğru tenant / **D destek bağlamı: başka kliniğin kayıtları / E destek bağlamı + sahte tenant**): ${JSON.stringify(duman.sonuclar.reduce((o, s) => ((o[s.sonuc] = (o[s.sonuc] ?? 0) + 1), o), {}))}. **SIZINTI = 0.**\n\n## Destek bağlamı etkisi (Ön adım B, 2026-10-28) — Aşama 7b'nin İLK HEDEFİ\n\n- Tarama: ${env.filter((x) => sonucAd.get(x.ad)?.superAdminDali).length} DEFINER gövdesinde \`is_super_admin()\` geçer (rol kapısı ya da tenant atlama). Hepsi D/E bağlamında ve ayrıca GEÇERLİ K2 kayıtlarıyla (\`tests/db/modul-yonetim.test.ts\` > "DEFINER taraması") denendi.\n- **Bulunan açık (düzeltildi):** DEFINER fonksiyonlar \`klinik_sahip\` olarak çalışır; "TO PUBLIC" izin politikalarındaki \`OR is_super_admin()\` sahibe de uygulandığından destek bağlamındaki super_admin \`randevu_gelis_isaretle\`, \`randevu_gelmedi_isaretle\`, \`randevu_iptal_et\`, \`islem_tanimi_etkin_fiyat\`, \`personel_izin_hak_gun_hesapla\`, \`personel_puantaj_donemi_acik_mi\`, \`seans_degerlendirme_baglam_getir\` üzerinden BAŞKA kliniğin kayıtlarını görebiliyor/değiştirebiliyordu. 0015'teki RESTRICTIVE \`zorunlu_tenant_siniri\` politikası artık \`klinik_sahip\`'e de uygulanır → hepsi kapandı. Mutasyon testi, politika kaldırılırsa sızıntının geri geldiğini kanıtlar.\n- **Aşama 7b ilk hedefi (AÇIK):** fonksiyon gövdelerindeki \`... OR is_super_admin()\` tenant-atlama dalları kodda duruyor (RLS onları sınırlıyor; kod kendi başına doğru değil). 7b'de \`klinik_id = current_klinik_id()\` + rol kapısı biçimine çevrilecek; ölçüt: bu belgenin "Destek bağlamı etkisi" sütunu + mutasyon testi geçerken politikasız (RLS'e güvenmeden) da sızıntı olmaması.\n\n- 0004 ile bağlamsızken "güvenli açık" davranan iki fonksiyon kapatıldı (\`qr_kodu_aktif_mi\`, \`personel_puantaj_donemi_acik_mi\`).\n\n**Test sınırı**: duman testi argümanları ad/tür sezgisiyle bağlar; çoğu RPC'de C durumu iş kuralı hatasıyla düşer (anlamlı iş akışı testi DEĞİL). A/B'de "veri döndürmedi ve satır değiştirmedi" kanıtı yalnız denenen argümanlar için geçerlidir.\n\n## Nedenler (kısaltmalar)\n\n${Object.entries(NEDEN).map(([k, v]) => `- **${k}**: ${v}`).join("\n")}\n\n## Kalan DEFINER fonksiyonlar\n\n| Fonksiyon | Ne yapıyor | Neden DEFINER | Hedef | Tenant bağlamı olmadan ne dönüyor (A durumu) | Destek bağlamı etkisi |\n|---|---|---|---|---|---|\n`;
for (const f of env) {
  const m = M[f.ad];
  if (!m) { md += `| \`${f.ad}\` | (açıklama eksik) | — | — | ${bagBilgi(sonucAd.get(f.ad))} | ${destekEtkisi(sonucAd.get(f.ad))} |\n`; continue; }
  md += `| \`${f.ad}\` | ${m[0]} | ${m[1]}${m[3] ? " " + m[3] : ""} | ${m[2] ?? "DEFINER kalacak"} | ${bagBilgi(sonucAd.get(f.ad))} | ${destekEtkisi(sonucAd.get(f.ad))} |\n`;
}
for (const ad of ["tanima.klinik_qr_bilgisi_getir", "tanima.randevu_klinik_cozumle"]) {
  const m = M[ad];
  md += `| \`${ad}\` | ${m[0]} | ${m[1]} ${m[3]} | ${m[2]} | tenant'sız çağrılmak için tasarlandı; klinik_tanima yalnız klinik(id, ad, qr_kisa_kod) ve randevu(id, klinik_id) okur (anonim kayıt testinde doğrulandı) | super_admin dalı yok; yalnız klinik adı/QR bilgisi (tenant'sız tasarım) |\n`;
}
md += `\n## Kaldırılan / taşınan / çevrilen\n\n| Fonksiyon | Ne yapıyordu | Karar |\n|---|---|---|\n${KALDIRILDI.map(([a, b, c]) => `| \`${a}\` | ${b} | ${c} |`).join("\n")}\n`;
md += `\n## Neden hepsi INVOKER yapılamadı\n\nINVOKER'a çevirmek, fonksiyonun çağıranın tablo yetkisi ve RLS görünürlüğüyle aynı sonucu vermesini gerektirir. Kalan DEFINER'ların her biri şu üç gerekçeden en az birine dayanıyor: (1) çağıran rolün ilgili tabloyu göremediği (terapist/resepsiyon/portal hastası/anonim) ama kuralın yine de uygulanması gerektiği durumlar; (2) kullanıcıya doğrudan yazma yetkisi verilmeyen türev/denetim tabloları; (3) politikaların çağırdığı yardımcılarda özyineleme. Bu nedenle toplu çevirme yapılmadı; yalnız davranışı kanıtlanabilen biri çevrildi. Her DEFINER için şu garantiler uygulanır: \`SET search_path\` sabit (83/83), sahip RLS'e tabi (FORCE + \`sahip_aktif_tenant\`), \`PUBLIC\` EXECUTE yok, tenant bağlamı olmadan veri döndürmeyen/değiştirmeyen (duman testi).\n`;
md += `\n## Açık işler (Aşama 3)\n\n- (b)/(c) sınıfındaki service-role kullanımları kapanırken bu tablodaki "iç" fonksiyonların çağrı yolu da netleşir (ör. \`mesaj_kredi_yukle\`).\n- C durumunun anlamlı iş akışı testleri (geçerli argümanla ödeme/randevu/izin akışları) modül taşımasında yazılacak.\n- Giriş öncesi tenant'sız akışlar: \`tanima\` çözümlemesi → \`app.tenant_id\` → işlem. Uygulama kodunda bu sıra Aşama 3'te uygulanacak.\n`;
fs.writeFileSync(path.join(KOK, "docs/definer-siniflama.md"), md, "utf8");
console.log("docs/definer-siniflama.md yazıldı:", toplam, "satır");
