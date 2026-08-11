import { BAKIYE_HAREKET_ETIKETLERI, type HastaBakiyeHareket } from "@/types/hasta-detay";
import { YONTEM_ETIKETLERI } from "@/types/odeme";
import { adSoyadMaskele } from "@/lib/utils";

export type HareketGorunum = {
  hareket: HastaBakiyeHareket;
  islemAdi: string;
  terapistAdi: string | null;
  kategoriIskontoTutari: number;
  manuelIskontoTutari: number;
  iskontoUygulayanAdi: string | null;
  tutarBrut: number;
  bakiyeSonrasi: number;
  odemeYontemMetni: string;
};

// hareketler created_at DESC (en yeni ilk) sırayla geliyor — kümülatif bakiye
// güncelBakiye'den (o anki gerçek toplam) geriye doğru hesaplanıyor, ki
// pencere (sayfada son 30, PDF'te daha geniş) boyutundan bağımsız rakamlar
// doğru kalsın.
//
// Sistem (kullanıcı kararı, en basit hâli): borç satırı randevu/seans
// tamamlanınca otomatik oluşuyor; iskonto doğrudan o satırın kendi
// `iskonto_tutari` kolonunda tutuluyor (borç satırına tıklanınca düzenlenir)
// — ayrı bir "borç kapama" satırı/durumu YOK. Bağımsız "Ödeme Ekle" ise
// tamamen ayrı bir hareket olarak toplam bakiyeyi doğrudan azaltıyor.
//
// Bakiye etkisi v_hasta_ozet ile AYNI kural olmalı (migration 20260813160000):
//   kredi                              → +tutar
//   borc                               → -(tutar - iskonto_tutari)
//   odeme, odeme_id NULL (Ödeme Ekle)  → +tutar
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

    let islemAdi = BAKIYE_HAREKET_ETIKETLERI[h.tur];
    let terapistAdi: string | null = null;
    let kategoriIskontoTutari = 0;
    let manuelIskontoTutari = 0;
    let iskontoUygulayanAdi: string | null = null;
    let tutarBrut = h.tutar;
    const odemeYontemMetni = (h.odeme?.odeme_satiri ?? [])
      .map((s) => YONTEM_ETIKETLERI[s.yontem] ?? s.yontem)
      .join(" + ");

    if (h.tur === "borc" && h.randevu) {
      islemAdi = h.randevu.islem_tanimi?.ad ?? islemAdi;
      terapistAdi = h.randevu.terapist?.personel?.ad_soyad ?? null;
      manuelIskontoTutari = h.iskonto_tutari;
      // KVKK: iskontoyu uygulayan personelin adı maskeli gösteriliyor
      // ("Ahmet Y." gibi — bkz. tablet kiosk'taki aynı hasta-adı maskeleme
      // kararı, burada personel için yeniden kullanıldı).
      if (h.iskonto_tutari > 0 && h.iskonto_uygulayan) {
        iskontoUygulayanAdi = adSoyadMaskele(h.iskonto_uygulayan.ad_soyad);
      }
      if (h.randevu.islem_tanimi) {
        kategoriIskontoTutari = Math.max(0, h.randevu.islem_tanimi.vita_fiyat - h.tutar);
      }
    } else if (h.tur === "odeme" && h.odeme) {
      // odeme_olustur'dan gelen peşin satın alma ödemesi — hasta_bakiye_hareket.tutar
      // zaten NET (manuel iskonto düşülmüş), brüt (indirim öncesi) tutar
      // manuel iskonto geri eklenerek yeniden kuruluyor.
      manuelIskontoTutari = h.odeme.iskonto_tutari;
      tutarBrut = h.tutar + manuelIskontoTutari;
      const adlar = h.odeme.odeme_kalemi.map((k) => k.islem_tanimi?.ad ?? k.paket_satis?.paket?.ad ?? "—");
      if (adlar.length > 0) islemAdi = adlar.join(", ");
      kategoriIskontoTutari = h.odeme.odeme_kalemi.reduce((acc, k) => {
        if (!k.islem_tanimi) return acc;
        return acc + Math.max(0, (k.islem_tanimi.vita_fiyat - k.birim_fiyat) * k.miktar);
      }, 0);
    }
    // else: bağımsız "Ödeme Ekle" — generic "Ödeme" (+yöntem) olarak kalıyor.

    const etki =
      h.tur === "kredi"
        ? h.tutar
        : h.tur === "borc"
          ? -(h.tutar - h.iskonto_tutari)
          : h.tur === "odeme" && h.odeme_id === null
            ? h.tutar
            : 0;
    bakiye -= etki;

    sonuc.push({
      hareket: h,
      islemAdi,
      terapistAdi,
      kategoriIskontoTutari,
      manuelIskontoTutari,
      iskontoUygulayanAdi,
      tutarBrut,
      bakiyeSonrasi,
      odemeYontemMetni,
    });
  }

  return sonuc;
}
