import type { MesajBolum } from "@/types/mesajlasma";
import { GENEL_MESAJ_METNI, IZINLI_DEGISKENLER } from "./icerik";

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
  /** Şablon içinde kullanılabilecek {{degisken}} beyaz listesi: KVKK gereği TÜM tetikleyicilerde yalnız klinik_adi ve baglanti (lib/mesaj/icerik.ts). */
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
    gecerliDegiskenler: [...IZINLI_DEGISKENLER],
    varsayilanMesajMetni: GENEL_MESAJ_METNI,
    baglanmaNotu:
      "BAĞLI (2026-10-12): panelden hastaOlustur (resepsiyon/yönetici) sonrası lib/mesaj/hasta-mesaji.ts kuyruğa yazar; hasta başına tek. QR self-servis kaydına BİLİNÇLİ bağlı DEĞİL — form anonim, telefon doğrulanmıyor, başkasının numarasına klinik kredisiyle SMS attırılabilirdi (telefon doğrulaması gelirse bağlanabilir). Arşiv içe aktarma da bağlı değil (toplu).",
  },
  {
    kod: "hasta_paket_satis_ozet",
    bolum: "hasta",
    ad: "Paket satın alınca paket özeti",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: [...IZINLI_DEGISKENLER],
    varsayilanMesajMetni: GENEL_MESAJ_METNI,
    baglanmaNotu:
      "BAĞLI (2026-10-12): hastanın Cari & Ödeme'deki satış akışı (odemeAl, paket kalemi içeren) sonrası lib/mesaj/hasta-mesaji.ts; satılan her paket için hastanın o paketten son 2 dk içinde oluşan paket_satis satırı okunur ({{seans_sayisi}} = o satırın kalan_adet'i), satış satırı başına tek mesaj. Paketler sayfasındaki satış diyaloğu da aynı odemeAl'ı çağırdığı için dahil; arşiv içe aktarma (ayrı yol) bağlı değil.",
  },
  {
    kod: "hasta_paket_seans_azaldi",
    bolum: "hasta",
    ad: "Paket bitmek üzere — yenileme hatırlatması",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: [...IZINLI_DEGISKENLER],
    varsayilanMesajMetni: GENEL_MESAJ_METNI,
    baglanmaNotu:
      "BAĞLI (2026-09-30): randevuSeansiTamamla, paketten düşülmüş bir seans bitince kalan hak 1-2 ise (lib/paket/yenileme-esigi.ts) kuyruğa yazar. Kalan hak check-in'de düşer (randevu_gelis_isaretle), mesaj seans BİTİNCE gider. mesaj_kurallari'nda satır yoksa/aktif değilse pasif; merkez servisi bağlanana kadar kuyrukta bekler.",
  },
  {
    kod: "hasta_paket_sure_bitiyor",
    bolum: "hasta",
    ad: "Paket süresi dolmadan hatırlatma",
    icerikTipi: "hizmet",
    tetiklemeTipi: "zamanlanmis",
    zamanlamaAciklamasi: "Paketin süresi dolmadan günlük tarama",
    gecerliDegiskenler: [...IZINLI_DEGISKENLER],
    varsayilanMesajMetni: GENEL_MESAJ_METNI,
    baglanmaNotu:
      "ÇAKIŞMA: paket_satis artık hiç tarih bazlı geçerlilik tutmuyor (2026-08-14'te \"Paket Bitiş Tarihi\" satış kesim tarihine çevrildi, hastanın satın aldığı paketin süresi kavramı kaldırıldı — CLAUDE.md). Taranacak bir tarih alanı YOK; bu tetikleyici muhtemelen hasta_paket_seans_azaldi ile birleştirilmeli veya kapsam dışı bırakılmalı — ürün kararı gerekiyor.",
  },
  {
    kod: "hasta_ilk_seans_anket",
    bolum: "hasta",
    ad: "İlk seans sonrası memnuniyet anketi",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: [...IZINLI_DEGISKENLER],
    varsayilanMesajMetni: GENEL_MESAJ_METNI,
    baglanmaNotu:
      "\"İlk seans\" mı yoksa mevcut seans_degerlendirme (Seans Sonu Anket QR) akışı mı kullanılacak netleşmeli — iki ayrı anket mekanizması çakışmasın.",
  },
  {
    kod: "hasta_seans_sonrasi_anket",
    bolum: "hasta",
    ad: "Her seans sonrası kısa anket",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: [...IZINLI_DEGISKENLER],
    varsayilanMesajMetni: GENEL_MESAJ_METNI,
    baglanmaNotu:
      "Bu proje QR ile tablette anlık \"Seans Sonu Anket\" (seans_degerlendirme, migration 20260810110000) zaten kurulu — bu tetikleyici onunla AYNI olay mı yoksa ayrı bir SMS/WhatsApp kanalı mı, netleşmeli (mükerrer anket riski).",
  },
  {
    kod: "hasta_program_tamamlandi",
    bolum: "hasta",
    ad: "Tedavi programı tamamlandığında kapanış anketi",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: [...IZINLI_DEGISKENLER],
    varsayilanMesajMetni: GENEL_MESAJ_METNI,
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
    gecerliDegiskenler: [...IZINLI_DEGISKENLER],
    varsayilanMesajMetni: GENEL_MESAJ_METNI,
  },
  {
    kod: "hasta_ozledik",
    bolum: "hasta",
    ad: "Uzun süredir gelmeyen hastaya hatırlatma",
    icerikTipi: "ticari",
    tetiklemeTipi: "zamanlanmis",
    zamanlamaAciklamasi: "Son ziyaretten N gün sonra, günlük tarama (mv_hasta_aktiflik churn view'ından beslenebilir)",
    gecerliDegiskenler: [...IZINLI_DEGISKENLER],
    varsayilanMesajMetni: GENEL_MESAJ_METNI,
  },

  // ---- Randevu (6) ----
  {
    kod: "randevu_onay",
    bolum: "randevu",
    ad: "Randevu oluşturulunca onay mesajı",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: [...IZINLI_DEGISKENLER],
    varsayilanMesajMetni: GENEL_MESAJ_METNI,
    baglanmaNotu:
      "BAĞLI (2026-10-12): randevuOlustur (tek randevu) başarılı olunca lib/mesaj/randevu-mesaji.ts kuyruğa yazar. Periyodik randevu oluşturma bilinçli bağlı DEĞİL (her seans için ayrı onay mesajı yağardı); portal talebinden onaylanan randevu da randevuOlustur'dan geçtiği için dahil.",
  },
  {
    kod: "randevu_hatirlatma_1gun",
    bolum: "randevu",
    ad: "Randevudan 1 gün önce hatırlatma",
    icerikTipi: "hizmet",
    tetiklemeTipi: "zamanlanmis",
    zamanlamaAciklamasi: "Randevu saatinden 1 gün önce, günlük tarama",
    gecerliDegiskenler: [...IZINLI_DEGISKENLER],
    varsayilanMesajMetni: GENEL_MESAJ_METNI,
    baglanmaNotu:
      "BAĞLI (2026-10-12): mesaj-kuyruk-isle cron'unun başında randevuHatirlatmalariniTara (lib/mesaj/randevu-mesaji.ts). Randevuya 23-24 saat kala, durumu 'planlandi', en az 24 saat önceden alınmış randevular; idempotency randevu+başlangıç.",
  },
  {
    kod: "randevu_hatirlatma_2saat",
    bolum: "randevu",
    ad: "Randevudan 2 saat önce hatırlatma",
    icerikTipi: "hizmet",
    tetiklemeTipi: "zamanlanmis",
    zamanlamaAciklamasi: "Randevu saatinden 2 saat önce (1 günlük hatırlatma taramasıyla aynı geçişte hesaplanıp planlanan_zaman ile kuyruğa yazılabilir)",
    gecerliDegiskenler: [...IZINLI_DEGISKENLER],
    varsayilanMesajMetni: GENEL_MESAJ_METNI,
    baglanmaNotu:
      "BAĞLI (2026-10-12): 1 günlük hatırlatmayla aynı tarama (randevuHatirlatmalariniTara); randevuya 1-2 saat kala, 'planlandi', en az 2 saat önceden alınmış randevular. Gönderim zamanı 5 dk'lık cron granülaritesindedir.",
  },
  {
    kod: "randevu_iptal",
    bolum: "randevu",
    ad: "Randevu iptal/erteleme bildirimi",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: [...IZINLI_DEGISKENLER],
    varsayilanMesajMetni: GENEL_MESAJ_METNI,
    baglanmaNotu:
      "BAĞLI (2026-10-12): randevuIptalEt, iptalTalebiOnayla ve randevuErtele sonrası lib/mesaj/randevu-mesaji.ts kuyruğa yazar. {{randevu_durumu}} = \"iptal edildi\" ya da \"<yeni tarih> tarihine ertelendi\" ({{randevu_tarihi}} her iki durumda ESKİ tarih). Periyodik randevu toplu iptali (periyodikRandevuIptalEt) bilinçli bağlı DEĞİL — hasta başına onlarca mesaj gitmesin.",
  },
  {
    kod: "randevu_gelmedi",
    bolum: "randevu",
    ad: "Randevuya gelmedi (no-show) sonrası mesaj",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: [...IZINLI_DEGISKENLER],
    varsayilanMesajMetni: GENEL_MESAJ_METNI,
    baglanmaNotu:
      "BAĞLI (2026-10-12): randevuDurumGuncelle('gelmedi') başarılı olunca lib/mesaj/randevu-mesaji.ts kuyruğa yazar; randevu başına tek mesaj (yanlış 'Gelmedi' düzeltilip tekrar işaretlense de ikinci mesaj gitmez).",
  },
  {
    kod: "randevu_sonraki_oneri",
    bolum: "randevu",
    ad: "Randevu sonrası sıradaki randevu önerisi",
    icerikTipi: "ticari",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: [...IZINLI_DEGISKENLER],
    varsayilanMesajMetni: GENEL_MESAJ_METNI,
    baglanmaNotu: "randevuSeansiTamamla action'ı sonrası tetiklenebilir (aynı olay hasta_seans_sonrasi_anket ile de paylaşılıyor).",
  },

  // ---- Personel (7) ----
  {
    kod: "personel_hosgeldin",
    bolum: "personel",
    ad: "İşe başlama hoş geldiniz mesajı",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: [...IZINLI_DEGISKENLER],
    varsayilanMesajMetni: GENEL_MESAJ_METNI,
  },
  {
    kod: "personel_gunluk_program",
    bolum: "personel",
    ad: "Günlük vardiya/randevu programı bildirimi",
    icerikTipi: "hizmet",
    tetiklemeTipi: "zamanlanmis",
    zamanlamaAciklamasi: "Her sabah, günlük tarama",
    gecerliDegiskenler: [...IZINLI_DEGISKENLER],
    varsayilanMesajMetni: GENEL_MESAJ_METNI,
  },
  {
    kod: "personel_bordro_hazir",
    bolum: "personel",
    ad: "Maaş bordrosu hazır bildirimi",
    icerikTipi: "hizmet",
    tetiklemeTipi: "zamanlanmis",
    zamanlamaAciklamasi: "Ay başı, aylık tarama",
    gecerliDegiskenler: [...IZINLI_DEGISKENLER],
    varsayilanMesajMetni: GENEL_MESAJ_METNI,
    baglanmaNotu: "Kod tabanında \"bordroyu kapat/finalize et\" şeklinde ayrı bir admin aksiyonu yok — tetikleme anı ürün kararı gerektiriyor (ay başı otomatik mi, admin'in elle tetiklemesiyle mi).",
  },
  {
    kod: "personel_performans_ozet",
    bolum: "personel",
    ad: "Aylık performans/prim özeti",
    icerikTipi: "hizmet",
    tetiklemeTipi: "zamanlanmis",
    zamanlamaAciklamasi: "Ay sonu, aylık tarama",
    gecerliDegiskenler: [...IZINLI_DEGISKENLER],
    varsayilanMesajMetni: GENEL_MESAJ_METNI,
  },
  {
    kod: "personel_izin_talebi_yeni",
    bolum: "personel",
    ad: "Yeni izin talebi geldiğinde yöneticiye bildirim",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: [...IZINLI_DEGISKENLER],
    varsayilanMesajMetni: GENEL_MESAJ_METNI,
    baglanmaNotu:
      "personel_izin_talep_olustur RPC'si başarılı dönünce, klinikteki tüm klinik_admin personellerine (kullanici_id + telefon/eposta doluysa) enqueue edilir — lib/mesaj/anlik-tetikle.ts.",
  },
  {
    kod: "personel_izin_sonuc",
    bolum: "personel",
    ad: "İzin talebi onay/red bildirimi",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: [...IZINLI_DEGISKENLER],
    varsayilanMesajMetni: GENEL_MESAJ_METNI,
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
    gecerliDegiskenler: [...IZINLI_DEGISKENLER],
    varsayilanMesajMetni: GENEL_MESAJ_METNI,
    baglanmaNotu: "Kod tabanında eğitim/toplantı kaydı tutan bir tablo yok — bu tetikleyicinin taranacak bir veri kaynağı şu an YOK, önce bir \"eğitim/toplantı\" veri modeli gerekiyor.",
  },

  // ---- Muhasebe (6) ----
  {
    kod: "muhasebe_fatura_kesildi",
    bolum: "muhasebe",
    ad: "Fatura kesildi bildirimi",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: [...IZINLI_DEGISKENLER],
    varsayilanMesajMetni: GENEL_MESAJ_METNI,
    baglanmaNotu: "fatura.durum='kesildi' olunca tetiklenmeli — ama gerçek Paraşüt entegrasyonu henüz yok (CLAUDE.md), bu yüzden bu tetikleyici pratikte hiç ateşlenmeyecek durum değişikliği bekliyor olacak.",
  },
  {
    kod: "muhasebe_odeme_yaklasiyor",
    bolum: "muhasebe",
    ad: "Ödeme vadesi yaklaşıyor hatırlatması",
    icerikTipi: "hizmet",
    tetiklemeTipi: "zamanlanmis",
    zamanlamaAciklamasi: "Vade tarihinden önce, günlük tarama",
    gecerliDegiskenler: [...IZINLI_DEGISKENLER],
    varsayilanMesajMetni: GENEL_MESAJ_METNI,
    baglanmaNotu: "ÇAKIŞMA: hastaya ait ödemelerde (odeme_satiri/hasta_bakiye_hareket) bir vade_tarihi/taksit alanı YOK (proje notlarında \"taksit takibi ileride eklenecek\" olarak duruyor, henüz yapılmadı). Taranacak veri yok — şema eklenmeden bağlanamaz.",
  },
  {
    kod: "muhasebe_odeme_gecikti",
    bolum: "muhasebe",
    ad: "Ödeme gecikmesi uyarısı",
    icerikTipi: "hizmet",
    tetiklemeTipi: "zamanlanmis",
    zamanlamaAciklamasi: "Açık borç belirli bir süreyi geçince, günlük tarama",
    gecerliDegiskenler: [...IZINLI_DEGISKENLER],
    varsayilanMesajMetni: GENEL_MESAJ_METNI,
    baglanmaNotu: "Gerçek bir \"vade\" yok ama hasta_bakiye_hareket'te tur='borc' olan açık satırlar üzerinden \"N gündür açık\" yaklaşımıyla YAKLAŞIK olarak bağlanabilir — kesin \"gecikti\" değil, ürün kararı gerekiyor.",
  },
  {
    kod: "muhasebe_odeme_alindi",
    bolum: "muhasebe",
    ad: "Ödeme alındı teşekkür mesajı",
    icerikTipi: "hizmet",
    tetiklemeTipi: "anlik",
    gecerliDegiskenler: [...IZINLI_DEGISKENLER],
    varsayilanMesajMetni: GENEL_MESAJ_METNI,
    baglanmaNotu:
      "BAĞLI (2026-10-12): bakiyeHareketiEkle (tur='odeme', Cari & Ödeme > Ödeme Ekle) ve randevuSeansOdemesiEkle (Randevu Çizelgesi > Ödeme Ekle) sonrası lib/mesaj/hasta-mesaji.ts kuyruğa yazar; ödeme satırı başına tek mesaj. İade ve borç düzenleme (faturalama) mesaj ÜRETMEZ. Randevu seans ödemesinde idempotency randevu başına (RPC satır id'si dönmez).",
  },
  {
    kod: "muhasebe_taksit_hatirlatma",
    bolum: "muhasebe",
    ad: "Sıradaki taksit hatırlatması",
    icerikTipi: "hizmet",
    tetiklemeTipi: "zamanlanmis",
    zamanlamaAciklamasi: "Taksit vadesinden önce, günlük tarama",
    gecerliDegiskenler: [...IZINLI_DEGISKENLER],
    varsayilanMesajMetni: GENEL_MESAJ_METNI,
    baglanmaNotu: "ÇAKIŞMA: projede taksitli ödeme/taksit takibi kavramı henüz İNŞA EDİLMEDİ (CLAUDE.md'de \"taksit takibi ileride odeme_satiri'ye vade alanı eklenerek çözülecek\" notu var, hâlâ yapılmamış). Şema eklenmeden bağlanamaz.",
  },
  {
    kod: "muhasebe_donem_ekstre",
    bolum: "muhasebe",
    ad: "Dönem sonu mutabakat/ekstre bildirimi",
    icerikTipi: "hizmet",
    tetiklemeTipi: "zamanlanmis",
    zamanlamaAciklamasi: "Ay sonu, aylık tarama",
    gecerliDegiskenler: [...IZINLI_DEGISKENLER],
    varsayilanMesajMetni: GENEL_MESAJ_METNI,
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
