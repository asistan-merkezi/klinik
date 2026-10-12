/**
 * Randevu mesajlarının SAF kuralları (veritabanı/ağ yok → birim testli).
 * Kuyruğa yazma `lib/mesaj/randevu-mesaji.ts`'te.
 */

const DK = 60_000;
const SAAT = 60 * DK;

export type RandevuHatirlatmaKodu = "randevu_hatirlatma_1gun" | "randevu_hatirlatma_2saat";

/**
 * Hatırlatmanın "randevuya kalan süre" penceresi: tarama her 5 dakikada bir çalıştığı için pencere
 * geniş tutulur (bir çalıştırma kaçsa sonraki yakalar), mükerrer gönderimi kuyruğun idempotency
 * anahtarı engeller. `oncedenEnAz`: randevunun bu kadar önceden alınmış olması gerekir — randevu
 * hatırlatma zamanından SONRA alınmışsa ("randevunuz oluşturuldu" mesajı zaten gitti) ayrıca
 * "1 gün kaldı" demek anlamsız.
 */
export const HATIRLATMA_KURALLARI: Record<
  RandevuHatirlatmaKodu,
  { kalanMinMs: number; kalanMaxMs: number; oncedenEnAzMs: number; enGecKalanMs: number }
> = {
  randevu_hatirlatma_1gun: { kalanMinMs: 23 * SAAT, kalanMaxMs: 24 * SAAT, oncedenEnAzMs: 24 * SAAT, enGecKalanMs: 1 * SAAT },
  randevu_hatirlatma_2saat: { kalanMinMs: 1 * SAAT, kalanMaxMs: 2 * SAAT, oncedenEnAzMs: 2 * SAAT, enGecKalanMs: 30 * DK },
};

/**
 * Sessiz saat hatırlatmayı erteleyecekse en geç bu ana kadar ertelenebilir (randevudan `enGecKalanMs` önce);
 * daha geç kalacaksa hatırlatma hiç gönderilmez (anlamsız olurdu).
 */
export function hatirlatmaEnGecGonderimZamani(kod: RandevuHatirlatmaKodu, randevuBaslangic: string): Date {
  return new Date(new Date(randevuBaslangic).getTime() - HATIRLATMA_KURALLARI[kod].enGecKalanMs);
}

/** `baslangic` bu aralıkta (min exclusive, max inclusive) olan 'planlandi' randevular hatırlatılır. */
export function hatirlatmaPenceresi(kod: RandevuHatirlatmaKodu, simdi: Date): { alt: string; ust: string } {
  const k = HATIRLATMA_KURALLARI[kod];
  return {
    alt: new Date(simdi.getTime() + k.kalanMinMs).toISOString(),
    ust: new Date(simdi.getTime() + k.kalanMaxMs).toISOString(),
  };
}

/** Randevu hatırlatma zamanından ÖNCE alınmış mı (bkz. `oncedenEnAzMs`)? */
export function hatirlatmaGerekliMi(
  kod: RandevuHatirlatmaKodu,
  randevu: { created_at: string; baslangic: string }
): boolean {
  const k = HATIRLATMA_KURALLARI[kod];
  return new Date(randevu.baslangic).getTime() - new Date(randevu.created_at).getTime() >= k.oncedenEnAzMs;
}

export type RandevuOlayKodu =
  | "randevu_onay"
  | "randevu_iptal"
  | "randevu_gelmedi"
  | RandevuHatirlatmaKodu;

/**
 * Kuyruk idempotency anahtarı (kanal eki kuyruk fonksiyonunda eklenir). Aynı olay iki kez tetiklense de
 * tek mesaj gider; farklı olay (ör. iptal → geri al → yeniden iptal) ayrı mesajdır.
 * - onay/gelmedi: randevu başına tek.
 * - hatırlatma: randevu + başlangıç (ertelenip yeni saate taşınırsa yeni hatırlatma hakkı doğar).
 * - iptal/erteleme: randevu + durum + başlangıç + iptal zamanı (her iptal/erteleme ayrı bildirim).
 */
export function randevuMesajAnahtari(
  kod: RandevuOlayKodu,
  r: { id: string; baslangic: string; durum?: string | null; iptal_tarihi?: string | null }
): string {
  switch (kod) {
    case "randevu_onay":
    case "randevu_gelmedi":
      return `${kod}:${r.id}`;
    case "randevu_hatirlatma_1gun":
    case "randevu_hatirlatma_2saat":
      return `${kod}:${r.id}:${r.baslangic}`;
    case "randevu_iptal":
      return `${kod}:${r.id}:${r.durum ?? ""}:${r.baslangic}:${r.iptal_tarihi ?? ""}`;
  }
}
