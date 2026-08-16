import type { MesajBolum } from "@/types/mesajlasma";

/**
 * Tetikleyici KATALOĞU — kodda sabit tek kaynak. Veritabanı (`mesaj_kurallari`)
 * sadece bir kliniğin bu kataloğun ÜSTÜNE yazdığı ayarları (aktif mi, hangi
 * kanallar, mesaj metni) tutar; hiçbir zaman kod/ad/bölüm gibi katalog
 * bilgisini kopyalamaz. Yeni bir klinik açıldığında burada 27 satır varsa
 * bile DB'de hiç satır OLUŞTURULMAZ — bir kural için DB'de satır yoksa
 * "pasif" kabul edilir (bkz. `lib/mesaj/kural-cozumle.ts`).
 *
 * Yeni bir tetikleyici eklemek için: buraya bir satır ekle, migration/seed
 * GEREKMEZ — panel otomatik olarak "pasif" görünümle listeye ekler, admin
 * kaydettiğinde DB'de satır oluşur (upsert).
 */

export type MesajTetiklemeTipi = "anlik" | "zamanlanmis";
export type MesajIcerikTipi = "hizmet" | "ticari";

export type TetikleyiciTanimi = {
  kod: string;
  bolum: MesajBolum;
  ad: string;
  /**
   * KVKK/ticari ileti ayrımı: 'hizmet' = mevcut/satın alınmış bir hizmetin
   * doğal parçası (randevu hatırlatma, fatura bildirimi, hesap durumu vb.),
   * izin aranmadan gönderilebilir; 'ticari' = pazarlama/ilişki yönetimi
   * amaçlı (kampanya, doğum günü, geri kazanım), alıcının ilgili kanal
   * izni yoksa gönderilemez. Bu sınıflandırma bir hukuki/ticari karardır —
   * kesin değildir, klinik/hukuk danışmanıyla teyit edilmesi önerilir.
   */
  icerikTipi: MesajIcerikTipi;
  tetiklemeTipi: MesajTetiklemeTipi;
  /** Sadece tetiklemeTipi='zamanlanmis' olanlarda: hangi taramanın ürettiği bir zamanlama. */
  zamanlamaAciklamasi?: string;
  /** Şablon içinde kullanılabilecek {{degisken}} beyaz listesi. */
  gecerliDegiskenler: string[];
  /** Yeni bir kural ilk kez düzenlenirken textarea'yı boş bırakmamak için öneri metni (kaydedilene kadar DB'ye yazılmaz). */
  varsayilanMesajMetni: string;
  /**
   * Faz 4'te (olay tetikleme) bu tetikleyiciyi gerçek bir koda bağlarken
   * dikkat edilmesi gereken, kod tabanında BUGÜN İTİBARIYLA karşılığı
   * belirsiz/eksik olan noktalar. Boşsa net bir çağrı noktası var demektir.
   */
  baglanmaNotu?: string;
};

export const TETIKLEYICILER: readonly TetikleyiciTanimi[] = [
  // ---- Hasta (9) ----
  {
    kod: "hasta_kayit_hosgeldin",
    bolum: "hasta",
    ad: "Kayıt olunca hoş geldiniz mesajı",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: ["hasta_adi", "klinik_adi"],
    varsayilanMesajMetni: "Merhaba {{hasta_adi}}, {{klinik_adi}}'ne hoş geldiniz! Kaydınız başarıyla oluşturuldu.",
  },
  {
    kod: "hasta_paket_satis_ozet",
    bolum: "hasta",
    ad: "Paket satın alınca paket özeti",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: ["hasta_adi", "paket_adi", "seans_sayisi", "klinik_adi"],
    varsayilanMesajMetni: "Merhaba {{hasta_adi}}, {{paket_adi}} paketiniz tanımlandı ({{seans_sayisi}} seans).",
  },
  {
    kod: "hasta_paket_seans_azaldi",
    bolum: "hasta",
    ad: "Paket seans hakkı azaldığında uyarı",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: ["hasta_adi", "paket_adi", "kalan_seans", "klinik_adi"],
    varsayilanMesajMetni: "Merhaba {{hasta_adi}}, {{paket_adi}} paketinizde {{kalan_seans}} seans hakkınız kaldı.",
    baglanmaNotu:
      "randevu_gelis_isaretle RPC'sinin paket_satis.kalan_adet'i düşürdüğü an — eşik (örn. \"son 2 seans\") ürün kararı gerektirir.",
  },
  {
    kod: "hasta_paket_sure_bitiyor",
    bolum: "hasta",
    ad: "Paket süresi dolmadan hatırlatma",
    icerikTipi: "hizmet",
    tetiklemeTipi: "zamanlanmis",
    zamanlamaAciklamasi: "Paketin süresi dolmadan günlük tarama",
    gecerliDegiskenler: ["hasta_adi", "paket_adi", "klinik_adi"],
    varsayilanMesajMetni: "Merhaba {{hasta_adi}}, {{paket_adi}} paketinizin süresi yakında sona eriyor.",
    baglanmaNotu:
      "ÇAKIŞMA: paket_satis artık hiç tarih bazlı geçerlilik tutmuyor (2026-08-14'te \"Paket Bitiş Tarihi\" satış kesim tarihine çevrildi, hastanın satın aldığı paketin süresi kavramı kaldırıldı — CLAUDE.md). Taranacak bir tarih alanı YOK; bu tetikleyici muhtemelen hasta_paket_seans_azaldi ile birleştirilmeli veya kapsam dışı bırakılmalı — ürün kararı gerekiyor.",
  },
  {
    kod: "hasta_ilk_seans_anket",
    bolum: "hasta",
    ad: "İlk seans sonrası memnuniyet anketi",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: ["hasta_adi", "klinik_adi"],
    varsayilanMesajMetni: "Merhaba {{hasta_adi}}, ilk seansınız nasıl geçti? Görüşlerinizi bizimle paylaşır mısınız?",
    baglanmaNotu:
      "\"İlk seans\" mı yoksa mevcut seans_degerlendirme (Seans Sonu Anket QR) akışı mı kullanılacak netleşmeli — iki ayrı anket mekanizması çakışmasın.",
  },
  {
    kod: "hasta_seans_sonrasi_anket",
    bolum: "hasta",
    ad: "Her seans sonrası kısa anket",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: ["hasta_adi", "terapist_adi", "klinik_adi"],
    varsayilanMesajMetni: "Merhaba {{hasta_adi}}, bugünkü seansınızla ilgili kısa bir değerlendirme yapmak ister misiniz?",
    baglanmaNotu:
      "Bu proje QR ile tablette anlık \"Seans Sonu Anket\" (seans_degerlendirme, migration 20260810110000) zaten kurulu — bu tetikleyici onunla AYNI olay mı yoksa ayrı bir SMS/WhatsApp kanalı mı, netleşmeli (mükerrer anket riski).",
  },
  {
    kod: "hasta_program_tamamlandi",
    bolum: "hasta",
    ad: "Tedavi programı tamamlandığında kapanış anketi",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: ["hasta_adi", "klinik_adi"],
    varsayilanMesajMetni: "Merhaba {{hasta_adi}}, tedavi programınız tamamlandı. Sürecimizi nasıl değerlendirirsiniz?",
    baglanmaNotu:
      "hasta_protokol'de \"tamamlandı\" durumunu taşıyan bir alan var mı doğrulanmalı — mevcut protokol ataması sadece başlangıç/atama tutuyor olabilir.",
  },
  {
    kod: "hasta_dogum_gunu",
    bolum: "hasta",
    ad: "Doğum günü kutlaması",
    icerikTipi: "ticari",
    tetiklemeTipi: "zamanlanmis",
    zamanlamaAciklamasi: "hasta.dogum_tarihi ay/gün eşleşmesi, günlük tarama",
    gecerliDegiskenler: ["hasta_adi", "klinik_adi"],
    varsayilanMesajMetni: "Doğum gününüz kutlu olsun {{hasta_adi}}! {{klinik_adi}} ailesi olarak sağlıklı bir yıl dileriz.",
  },
  {
    kod: "hasta_ozledik",
    bolum: "hasta",
    ad: "Uzun süredir gelmeyen hastaya hatırlatma",
    icerikTipi: "ticari",
    tetiklemeTipi: "zamanlanmis",
    zamanlamaAciklamasi: "Son ziyaretten N gün sonra, günlük tarama (mv_hasta_aktiflik churn view'ından beslenebilir)",
    gecerliDegiskenler: ["hasta_adi", "klinik_adi"],
    varsayilanMesajMetni: "Sizi bir süredir aramızda göremedik {{hasta_adi}}, sizi özledik! Yeni bir randevu almak ister misiniz?",
  },

  // ---- Randevu (6) ----
  {
    kod: "randevu_onay",
    bolum: "randevu",
    ad: "Randevu oluşturulunca onay mesajı",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: ["hasta_adi", "randevu_tarihi", "terapist_adi", "klinik_adi"],
    varsayilanMesajMetni: "Merhaba {{hasta_adi}}, randevunuz {{randevu_tarihi}} tarihine oluşturuldu. Sizi bekliyoruz.",
  },
  {
    kod: "randevu_hatirlatma_1gun",
    bolum: "randevu",
    ad: "Randevudan 1 gün önce hatırlatma",
    icerikTipi: "hizmet",
    tetiklemeTipi: "zamanlanmis",
    zamanlamaAciklamasi: "Randevu saatinden 1 gün önce, günlük tarama",
    gecerliDegiskenler: ["hasta_adi", "randevu_tarihi", "terapist_adi", "klinik_adi"],
    varsayilanMesajMetni: "Merhaba {{hasta_adi}}, yarınki {{randevu_tarihi}} randevunuzu hatırlatmak isteriz.",
  },
  {
    kod: "randevu_hatirlatma_2saat",
    bolum: "randevu",
    ad: "Randevudan 2 saat önce hatırlatma",
    icerikTipi: "hizmet",
    tetiklemeTipi: "zamanlanmis",
    zamanlamaAciklamasi: "Randevu saatinden 2 saat önce (1 günlük hatırlatma taramasıyla aynı geçişte hesaplanıp planlanan_zaman ile kuyruğa yazılabilir)",
    gecerliDegiskenler: ["hasta_adi", "randevu_tarihi", "terapist_adi", "klinik_adi"],
    varsayilanMesajMetni: "Merhaba {{hasta_adi}}, randevunuza 2 saat kaldı, sizi bekliyoruz.",
  },
  {
    kod: "randevu_iptal",
    bolum: "randevu",
    ad: "Randevu iptal/erteleme bildirimi",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: ["hasta_adi", "randevu_tarihi", "klinik_adi"],
    varsayilanMesajMetni: "Merhaba {{hasta_adi}}, randevunuz iptal edildi/ertelendi. Yeni bir randevu için bizimle iletişime geçebilirsiniz.",
  },
  {
    kod: "randevu_gelmedi",
    bolum: "randevu",
    ad: "Randevuya gelmedi (no-show) sonrası mesaj",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: ["hasta_adi", "randevu_tarihi", "klinik_adi"],
    varsayilanMesajMetni: "Merhaba {{hasta_adi}}, bugünkü randevunuza gelemediğinizi fark ettik. Yeni bir randevu planlamak ister misiniz?",
  },
  {
    kod: "randevu_sonraki_oneri",
    bolum: "randevu",
    ad: "Randevu sonrası sıradaki randevu önerisi",
    icerikTipi: "ticari",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: ["hasta_adi", "klinik_adi"],
    varsayilanMesajMetni: "Merhaba {{hasta_adi}}, bir sonraki randevunuzu şimdiden planlamak ister misiniz?",
    baglanmaNotu: "randevuSeansiTamamla action'ı sonrası tetiklenebilir (aynı olay hasta_seans_sonrasi_anket ile de paylaşılıyor).",
  },

  // ---- Personel (7) ----
  {
    kod: "personel_hosgeldin",
    bolum: "personel",
    ad: "İşe başlama hoş geldiniz mesajı",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: ["personel_adi", "klinik_adi"],
    varsayilanMesajMetni: "Merhaba {{personel_adi}}, {{klinik_adi}} ekibine hoş geldiniz! Size başarılar dileriz.",
  },
  {
    kod: "personel_gunluk_program",
    bolum: "personel",
    ad: "Günlük vardiya/randevu programı bildirimi",
    icerikTipi: "hizmet",
    tetiklemeTipi: "zamanlanmis",
    zamanlamaAciklamasi: "Her sabah, günlük tarama",
    gecerliDegiskenler: ["personel_adi", "klinik_adi"],
    varsayilanMesajMetni: "Günaydın {{personel_adi}}, bugünkü randevu/vardiya programınız hazır.",
  },
  {
    kod: "personel_bordro_hazir",
    bolum: "personel",
    ad: "Maaş bordrosu hazır bildirimi",
    icerikTipi: "hizmet",
    tetiklemeTipi: "zamanlanmis",
    zamanlamaAciklamasi: "Ay başı, aylık tarama",
    gecerliDegiskenler: ["personel_adi", "klinik_adi"],
    varsayilanMesajMetni: "Merhaba {{personel_adi}}, bu ayki bordronuz hazırlandı.",
    baglanmaNotu: "Kod tabanında \"bordroyu kapat/finalize et\" şeklinde ayrı bir admin aksiyonu yok — tetikleme anı ürün kararı gerektiriyor (ay başı otomatik mi, admin'in elle tetiklemesiyle mi).",
  },
  {
    kod: "personel_performans_ozet",
    bolum: "personel",
    ad: "Aylık performans/prim özeti",
    icerikTipi: "hizmet",
    tetiklemeTipi: "zamanlanmis",
    zamanlamaAciklamasi: "Ay sonu, aylık tarama",
    gecerliDegiskenler: ["personel_adi", "klinik_adi"],
    varsayilanMesajMetni: "Merhaba {{personel_adi}}, bu ayki performans ve prim özetiniz hazır.",
  },
  {
    kod: "personel_izin_talebi_yeni",
    bolum: "personel",
    ad: "Yeni izin talebi geldiğinde yöneticiye bildirim",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: ["personel_adi", "izin_tip", "tarih_araligi", "klinik_adi"],
    varsayilanMesajMetni:
      "Merhaba, {{personel_adi}} {{tarih_araligi}} tarihleri için {{izin_tip}} talebinde bulundu. Onay bekliyor.",
    baglanmaNotu:
      "personel_izin_talep_olustur RPC'si başarılı dönünce, klinikteki tüm klinik_admin personellerine (kullanici_id + telefon/eposta doluysa) enqueue edilir — lib/mesaj/anlik-tetikle.ts.",
  },
  {
    kod: "personel_izin_sonuc",
    bolum: "personel",
    ad: "İzin talebi onay/red bildirimi",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: ["personel_adi", "izin_durumu", "klinik_adi"],
    varsayilanMesajMetni: "Merhaba {{personel_adi}}, izin talebiniz {{izin_durumu}}.",
    baglanmaNotu:
      "personel_izin_talebi_onayla/_reddet RPC'leri başarılı dönünce talebi açan personele enqueue edilir — lib/mesaj/anlik-tetikle.ts. (Not: bu satır Faz 1'den beri kataloglaydı, o zaman kaldırılmış terapist_izin tablosuna işaret ediyordu — artık personel_izin_talebi'ne bağlı.)",
  },
  {
    kod: "personel_egitim_hatirlatma",
    bolum: "personel",
    ad: "Eğitim/toplantı hatırlatması",
    icerikTipi: "hizmet",
    tetiklemeTipi: "zamanlanmis",
    zamanlamaAciklamasi: "Eğitim/toplantı tarihinden önce, günlük tarama",
    gecerliDegiskenler: ["personel_adi", "klinik_adi"],
    varsayilanMesajMetni: "Merhaba {{personel_adi}}, yaklaşan eğitim/toplantınızı hatırlatmak isteriz.",
    baglanmaNotu: "Kod tabanında eğitim/toplantı kaydı tutan bir tablo yok — bu tetikleyicinin taranacak bir veri kaynağı şu an YOK, önce bir \"eğitim/toplantı\" veri modeli gerekiyor.",
  },

  // ---- Muhasebe (6) ----
  {
    kod: "muhasebe_fatura_kesildi",
    bolum: "muhasebe",
    ad: "Fatura kesildi bildirimi",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: ["hasta_adi", "tutar", "klinik_adi"],
    varsayilanMesajMetni: "Merhaba {{hasta_adi}}, faturanız kesildi. Ekte/linkte e-Arşiv PDF'inizi bulabilirsiniz.",
    baglanmaNotu: "fatura.durum='kesildi' olunca tetiklenmeli — ama gerçek Paraşüt entegrasyonu henüz yok (CLAUDE.md), bu yüzden bu tetikleyici pratikte hiç ateşlenmeyecek durum değişikliği bekliyor olacak.",
  },
  {
    kod: "muhasebe_odeme_yaklasiyor",
    bolum: "muhasebe",
    ad: "Ödeme vadesi yaklaşıyor hatırlatması",
    icerikTipi: "hizmet",
    tetiklemeTipi: "zamanlanmis",
    zamanlamaAciklamasi: "Vade tarihinden önce, günlük tarama",
    gecerliDegiskenler: ["hasta_adi", "tutar", "klinik_adi"],
    varsayilanMesajMetni: "Merhaba {{hasta_adi}}, ödeme vadeniz yaklaşıyor.",
    baglanmaNotu: "ÇAKIŞMA: hastaya ait ödemelerde (odeme_satiri/hasta_bakiye_hareket) bir vade_tarihi/taksit alanı YOK (proje notlarında \"taksit takibi ileride eklenecek\" olarak duruyor, henüz yapılmadı). Taranacak veri yok — şema eklenmeden bağlanamaz.",
  },
  {
    kod: "muhasebe_odeme_gecikti",
    bolum: "muhasebe",
    ad: "Ödeme gecikmesi uyarısı",
    icerikTipi: "hizmet",
    tetiklemeTipi: "zamanlanmis",
    zamanlamaAciklamasi: "Açık borç belirli bir süreyi geçince, günlük tarama",
    gecerliDegiskenler: ["hasta_adi", "tutar", "klinik_adi"],
    varsayilanMesajMetni: "Merhaba {{hasta_adi}}, ödemenizde bir gecikme tespit ettik, en kısa sürede tamamlamanızı rica ederiz.",
    baglanmaNotu: "Gerçek bir \"vade\" yok ama hasta_bakiye_hareket'te tur='borc' olan açık satırlar üzerinden \"N gündür açık\" yaklaşımıyla YAKLAŞIK olarak bağlanabilir — kesin \"gecikti\" değil, ürün kararı gerekiyor.",
  },
  {
    kod: "muhasebe_odeme_alindi",
    bolum: "muhasebe",
    ad: "Ödeme alındı teşekkür mesajı",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: ["hasta_adi", "tutar", "klinik_adi"],
    varsayilanMesajMetni: "Merhaba {{hasta_adi}}, {{tutar}} tutarındaki ödemeniz alındı, teşekkür ederiz.",
    baglanmaNotu: "\"Ödeme Ekle\" ve borç düzenleme (hasta_bakiye_hareket_borc_duzenle) akışlarının ikisi de aday çağrı noktası.",
  },
  {
    kod: "muhasebe_taksit_hatirlatma",
    bolum: "muhasebe",
    ad: "Sıradaki taksit hatırlatması",
    icerikTipi: "hizmet",
    tetiklemeTipi: "zamanlanmis",
    zamanlamaAciklamasi: "Taksit vadesinden önce, günlük tarama",
    gecerliDegiskenler: ["hasta_adi", "tutar", "klinik_adi"],
    varsayilanMesajMetni: "Merhaba {{hasta_adi}}, sıradaki taksit ödemenizi hatırlatmak isteriz.",
    baglanmaNotu: "ÇAKIŞMA: projede taksitli ödeme/taksit takibi kavramı henüz İNŞA EDİLMEDİ (CLAUDE.md'de \"taksit takibi ileride odeme_satiri'ye vade alanı eklenerek çözülecek\" notu var, hâlâ yapılmamış). Şema eklenmeden bağlanamaz.",
  },
  {
    kod: "muhasebe_donem_ekstre",
    bolum: "muhasebe",
    ad: "Dönem sonu mutabakat/ekstre bildirimi",
    icerikTipi: "hizmet",
    tetiklemeTipi: "zamanlanmis",
    zamanlamaAciklamasi: "Ay sonu, aylık tarama",
    gecerliDegiskenler: ["hasta_adi", "klinik_adi"],
    varsayilanMesajMetni: "Merhaba {{hasta_adi}}, dönem sonu hesap ekstreniz hazır.",
  },
] as const;

const KOD_HARITASI = new Map(TETIKLEYICILER.map((t) => [t.kod, t] as const));

export function tetikleyiciGetir(kod: string): TetikleyiciTanimi | undefined {
  return KOD_HARITASI.get(kod);
}

export function gecerliTetikleyiciMi(kod: string): boolean {
  return KOD_HARITASI.has(kod);
}

export function bolumeGoreTetikleyiciler(bolum: MesajBolum): TetikleyiciTanimi[] {
  return TETIKLEYICILER.filter((t) => t.bolum === bolum);
}
