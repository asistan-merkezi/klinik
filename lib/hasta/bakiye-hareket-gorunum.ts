import { BAKIYE_HAREKET_ETIKETLERI, type HastaBakiyeHareket } from "@/types/hasta-detay";

export type HareketGorunum = {
  hareket: HastaBakiyeHareket;
  islemAdi: string;
  terapistAdi: string | null;
  kategoriIskontoTutari: number;
  manuelIskontoTutari: number;
  bakiyeSonrasi: number;
};

// hareketler created_at DESC (en yeni ilk) sırayla geliyor — kümülatif bakiye
// güncelBakiye'den (o anki gerçek toplam) geriye doğru hesaplanıyor, ki
// pencere (sayfada son 30, PDF'te daha geniş) boyutundan bağımsız rakamlar
// doğru kalsın. Bakiye etkisi v_hasta_ozet ile aynı kural: kredi +, borç −,
// ödeme/iade bakiyeyi değiştirmez (ödeme zaten tahsilatın audit-trail kaydı,
// borç/kredi cari hesabı oluşturur). Ekrandaki tablo (cari-odeme-sekmesi.tsx)
// ve Cari Hareketler PDF'i (api/hasta-cari-hareketler/pdf) aynı kaynağı
// paylaşıyor — rakamların iki yerde de birbirinden sapmaması için.
export function hareketleriGorunumeCevir(
  hareketler: HastaBakiyeHareket[],
  guncelBakiye: number
): HareketGorunum[] {
  let bakiye = guncelBakiye;
  const sonuc: HareketGorunum[] = [];

  for (const h of hareketler) {
    const bakiyeSonrasi = bakiye;
    const etki = h.tur === "kredi" ? h.tutar : h.tur === "borc" ? -h.tutar : 0;
    bakiye -= etki;

    let islemAdi = BAKIYE_HAREKET_ETIKETLERI[h.tur];
    let terapistAdi: string | null = null;
    let kategoriIskontoTutari = 0;
    let manuelIskontoTutari = 0;

    if (h.randevu) {
      islemAdi = h.randevu.islem_tanimi?.ad ?? islemAdi;
      terapistAdi = h.randevu.terapist?.personel?.ad_soyad ?? null;
      if (h.randevu.islem_tanimi) {
        kategoriIskontoTutari = Math.max(0, h.randevu.islem_tanimi.vita_fiyat - h.tutar);
      }
    } else if (h.odeme) {
      const adlar = h.odeme.odeme_kalemi.map((k) => k.islem_tanimi?.ad ?? k.paket_satis?.paket?.ad ?? "—");
      if (adlar.length > 0) islemAdi = adlar.join(", ");
      kategoriIskontoTutari = h.odeme.odeme_kalemi.reduce((acc, k) => {
        if (!k.islem_tanimi) return acc;
        return acc + Math.max(0, (k.islem_tanimi.vita_fiyat - k.birim_fiyat) * k.miktar);
      }, 0);
      manuelIskontoTutari = h.odeme.iskonto_tutari;
    }

    sonuc.push({ hareket: h, islemAdi, terapistAdi, kategoriIskontoTutari, manuelIskontoTutari, bakiyeSonrasi });
  }

  return sonuc;
}
