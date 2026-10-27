// Şifre sıfırlama e-postası. KVKK kuralı (docs/kvkk-aktarim.md): e-posta gövdesinde KİŞİSEL/SAĞLIK VERİSİ OLMAZ, yalnız bağlantı odaklı metin.
// Gönderici enjekte edilebilir: üretimde mesaj merkezi/Resend (Aşama 7a) bağlanır; bağlanana kadar varsayılan gönderici HİÇBİR ŞEY GÖNDERMEZ ve uyarı yazar.
export type EpostaGonderici = (e: { alici: string; konu: string; metin: string }) => Promise<void>;

/** Sabit, veri içermeyen konu ve gövde. `baglanti` dışında hiçbir kullanıcı/klinik bilgisi içermez. */
export function sifirlamaEpostasiIcerigi(baglanti: string): { konu: string; metin: string } {
  return {
    konu: "Klinik bildirimi",
    metin: `Şifre sıfırlama isteği alındı. Bağlantı 30 dakika geçerlidir ve yalnız bir kez kullanılabilir: ${baglanti}\nBu isteği siz yapmadıysanız bu iletiyi yok sayın.`,
  };
}

let gonderici: EpostaGonderici = async () => {
  console.warn("[eposta] Gönderici yapılandırılmadı: şifre sıfırlama e-postası GÖNDERİLMEDİ (Aşama 7a'da merkez/Resend bağlanacak).");
};

export function epostaGondericiAyarla(g: EpostaGonderici): void {
  gonderici = g;
}

export async function epostaGonder(e: { alici: string; konu: string; metin: string }): Promise<void> {
  await gonderici(e);
}
