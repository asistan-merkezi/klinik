import { BAKIYE_HAREKET_ETIKETLERI, type HastaBakiyeHareket } from "@/types/hasta-detay";
import { YONTEM_ETIKETLERI } from "@/types/odeme";

export type HareketGorunum = {
  hareket: HastaBakiyeHareket;
  islemAdi: string;
  terapistAdi: string | null;
  kategoriIskontoTutari: number;
  manuelIskontoTutari: number;
  tutarBrut: number;
  bakiyeSonrasi: number;
  odemeYontemMetni: string;
};

// hareketler created_at DESC (en yeni ilk) sırayla geliyor — kümülatif bakiye
// güncelBakiye'den (o anki gerçek toplam) geriye doğru hesaplanıyor, ki
// pencere (sayfada son 30, PDF'te daha geniş) boyutundan bağımsız rakamlar
// doğru kalsın.
//
// Borç Kapatma artık İKİ AYRI, KALICI satır üretiyor (migration
// 20260813120000, kullanıcı kararı: "işlem ayrı satır, ödeme ayrı satır,
// borç gelir ödeme girersin borç düşer") — orijinal borç satırı hiç
// değişmiyor (tur='borc', tutar hep orijinal), kapatma anında AYRI bir
// 'odeme' satırı ekleniyor (aynı randevu_id'ye bağlı — SADECE bakiye
// formülünün sinyali için, ekranda tedavi/terapist bilgisi GÖSTERİLMİYOR).
//
// Bakiye etkisi v_hasta_ozet ile AYNI kural olmalı (migration 20260813130000):
//   kredi                                  → +tutar
//   borc                                   → -tutar (kapatılmış olsa bile)
//   odeme, odeme_id NULL (manuel Ödeme Ekle)         → +tutar
//   odeme, randevu_id dolu (borç kapatmanın ödemesi) → +(tutar + iskonto) —
//     iskonto dahil TAM orijinal borç tutarı kadar telafi ediyor (indirim
//     klinik tarafından üstlenilen bir write-off)
//   diğer (odeme_olustur'dan peşin satın alma ödemesi) → 0 (zaten hiç borç
//     yaratmamıştı)
export function hareketleriGorunumeCevir(
  hareketler: HastaBakiyeHareket[],
  guncelBakiye: number
): HareketGorunum[] {
  let bakiye = guncelBakiye;
  const sonuc: HareketGorunum[] = [];

  for (const h of hareketler) {
    const bakiyeSonrasi = bakiye;

    // İskonto sorusu iki yerde var: Borç Kapatma dialogu (BORÇ satırına
    // tıklanınca) ve Ödeme Al'ın peşin satın alma ekranı (odeme_olustur,
    // randevu_id hiç yok) — "Ödeme Ekle"de iskonto sorusu YOK. Bu yüzden
    // borç kapatmanın ürettiği "Ödeme" satırında (randevu_id dolu) iskonto
    // hiç gösterilmiyor, tıklanan asıl borç satırında gösteriliyor.
    // `iskontoTutari` bakiye formülü için ayrı tutuluyor (borç kapatmanın
    // ödeme satırının etkisine dahil edilmesi gerekiyor, görüntülemeden
    // bağımsız).
    const iskontoTutari = h.odeme?.iskonto_tutari ?? 0;
    const manuelIskontoTutari =
      h.tur === "borc" || (h.tur === "odeme" && h.randevu === null) ? iskontoTutari : 0;
    const odemeYontemMetni = (h.odeme?.odeme_satiri ?? [])
      .map((s) => YONTEM_ETIKETLERI[s.yontem] ?? s.yontem)
      .join(" + ");

    let islemAdi = BAKIYE_HAREKET_ETIKETLERI[h.tur];
    let terapistAdi: string | null = null;
    let kategoriIskontoTutari = 0;
    let tutarBrut = h.tutar;

    if (h.tur === "borc" && h.randevu) {
      islemAdi = h.randevu.islem_tanimi?.ad ?? islemAdi;
      terapistAdi = h.randevu.terapist?.personel?.ad_soyad ?? null;
      if (h.randevu.islem_tanimi) {
        kategoriIskontoTutari = Math.max(0, h.randevu.islem_tanimi.vita_fiyat - h.tutar);
      }
    } else if (h.tur === "odeme" && h.odeme && h.randevu === null) {
      // odeme_olustur'dan gelen peşin satın alma ödemesi — hasta_bakiye_hareket.tutar
      // zaten NET (manuel iskonto düşülmüş), brüt (indirim öncesi) tutar
      // manuel iskonto geri eklenerek yeniden kuruluyor.
      tutarBrut = h.tutar + iskontoTutari;
      const adlar = h.odeme.odeme_kalemi.map((k) => k.islem_tanimi?.ad ?? k.paket_satis?.paket?.ad ?? "—");
      if (adlar.length > 0) islemAdi = adlar.join(", ");
      kategoriIskontoTutari = h.odeme.odeme_kalemi.reduce((acc, k) => {
        if (!k.islem_tanimi) return acc;
        return acc + Math.max(0, (k.islem_tanimi.vita_fiyat - k.birim_fiyat) * k.miktar);
      }, 0);
    }
    // else: bağımsız "Ödeme Ekle" VEYA borç kapatmanın ödeme satırı —
    // kullanıcı kararıyla İşlem Türü sütununda tedavi/terapist bilgisi
    // gösterilmiyor, generic "Ödeme" (+yöntem) olarak kalıyor.

    const etki =
      h.tur === "kredi"
        ? h.tutar
        : h.tur === "borc"
          ? -h.tutar
          : h.tur === "odeme" && h.odeme_id === null
            ? h.tutar
            : h.tur === "odeme" && h.randevu !== null
              ? h.tutar + iskontoTutari
              : 0;
    bakiye -= etki;

    sonuc.push({
      hareket: h,
      islemAdi,
      terapistAdi,
      kategoriIskontoTutari,
      manuelIskontoTutari,
      tutarBrut,
      bakiyeSonrasi,
      odemeYontemMetni,
    });
  }

  return sonuc;
}

