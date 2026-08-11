import { BAKIYE_HAREKET_ETIKETLERI, type HastaBakiyeHareket } from "@/types/hasta-detay";

export type HareketGorunum = {
  hareket: HastaBakiyeHareket;
  islemAdi: string;
  terapistAdi: string | null;
  kategoriIskontoTutari: number;
  manuelIskontoTutari: number;
  tutarBrut: number;
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

    // Kapatılmış bir borç satırı hem randevu'ya (terapist/işlem adı için) hem
    // odeme'ye (borç kapatırken/ödeme alırken girilen manuel iskonto için) bağlı.
    // h.tutar bu noktada zaten NET (manuel iskonto düşülmüş, bkz.
    // hasta_bakiye_hareket_borc_kapat/odeme_olustur) — bu yüzden hem kategori
    // iskontosunu manuel iskontodan ayrıştırmak hem de brüt (indirim öncesi)
    // tutarı göstermek için önce manuel iskonto geri eklenip orijinal tutar
    // yeniden kuruluyor.
    const manuelIskontoTutari = h.odeme?.iskonto_tutari ?? 0;
    const tutarBrut = h.tutar + manuelIskontoTutari;

    if (h.randevu) {
      islemAdi = h.randevu.islem_tanimi?.ad ?? islemAdi;
      terapistAdi = h.randevu.terapist?.personel?.ad_soyad ?? null;
      if (h.randevu.islem_tanimi) {
        kategoriIskontoTutari = Math.max(0, h.randevu.islem_tanimi.vita_fiyat - tutarBrut);
      }
    } else if (h.odeme) {
      const adlar = h.odeme.odeme_kalemi.map((k) => k.islem_tanimi?.ad ?? k.paket_satis?.paket?.ad ?? "—");
      if (adlar.length > 0) islemAdi = adlar.join(", ");
      kategoriIskontoTutari = h.odeme.odeme_kalemi.reduce((acc, k) => {
        if (!k.islem_tanimi) return acc;
        return acc + Math.max(0, (k.islem_tanimi.vita_fiyat - k.birim_fiyat) * k.miktar);
      }, 0);
    }

    sonuc.push({ hareket: h, islemAdi, terapistAdi, kategoriIskontoTutari, manuelIskontoTutari, tutarBrut, bakiyeSonrasi });
  }

  return sonuc;
}

export type BakiyeSatirTuru = "tekli" | "islem" | "odeme";

export type BakiyeSatirGorunum = {
  key: string;
  tip: BakiyeSatirTuru;
  tarih: string;
  hareket: HastaBakiyeHareket;
  islemAdi: string;
  terapistAdi: string | null;
  kategoriIskontoTutari: number;
  manuelIskontoTutari: number;
  tutarBrut: number;
  bakiyeSonrasi: number | null;
};

// Kapatılmış (eskiden borç, şimdi tur='odeme') ve bir randevuya bağlı
// hareketler ekranda "İşlem" (orijinal tedavi tarihi/tutarı) ve "Ödeme"
// (kapatma anının tarihi/tahsilatı) diye iki ayrı satıra bölünüyor —
// kullanıcı kararı. Bölünen satırlar kendi gerçek tarihleriyle (İşlem:
// hareket.created_at, Ödeme: hareket.odeme.created_at) tekrar sıralanıyor;
// aksi halde ikisi hep aynı (eski, check-in anındaki) konumda bitişik
// gösterilir ve aradaki başka hareketlerle sıralama karışırdı.
export function bakiyeSatirlariOlustur(gorunumler: HareketGorunum[]): BakiyeSatirGorunum[] {
  const satirlar: BakiyeSatirGorunum[] = [];

  for (const g of gorunumler) {
    const kapaliBorc = g.hareket.tur === "odeme" && g.hareket.randevu !== null;

    if (!kapaliBorc) {
      satirlar.push({
        key: g.hareket.id,
        tip: "tekli",
        tarih: g.hareket.created_at,
        hareket: g.hareket,
        islemAdi: g.islemAdi,
        terapistAdi: g.terapistAdi,
        kategoriIskontoTutari: g.kategoriIskontoTutari,
        manuelIskontoTutari: g.manuelIskontoTutari,
        tutarBrut: g.tutarBrut,
        bakiyeSonrasi: g.bakiyeSonrasi,
      });
      continue;
    }

    satirlar.push({
      key: `${g.hareket.id}-islem`,
      tip: "islem",
      tarih: g.hareket.created_at,
      hareket: g.hareket,
      islemAdi: g.islemAdi,
      terapistAdi: g.terapistAdi,
      kategoriIskontoTutari: g.kategoriIskontoTutari,
      // İskonto (kategori de manuel de) tedavinin/işlemin kendisine uygulanıyor
      // — kapatma anındaki tahsilat (Ödeme satırı) sadece ne kadar para
      // alındığını gösteriyor, indirim orada gösterilmiyor.
      manuelIskontoTutari: g.manuelIskontoTutari,
      tutarBrut: g.tutarBrut,
      bakiyeSonrasi: null,
    });
    satirlar.push({
      key: `${g.hareket.id}-odeme`,
      tip: "odeme",
      tarih: g.hareket.odeme?.created_at ?? g.hareket.created_at,
      hareket: g.hareket,
      islemAdi: g.islemAdi,
      terapistAdi: null,
      kategoriIskontoTutari: 0,
      manuelIskontoTutari: 0,
      tutarBrut: g.hareket.tutar,
      bakiyeSonrasi: g.bakiyeSonrasi,
    });
  }

  return satirlar.sort((a, b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime());
}
