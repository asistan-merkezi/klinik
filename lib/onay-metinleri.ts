/**
 * KVKK/sağlık verisi/WhatsApp bildirimi/ticari ileti onaylarının açıklama
 * metinleri — Hasta Detay > Kişisel Bilgiler (web) ve Kayıt Formu (PDF)
 * arasında tek kaynak olsun diye paylaşılıyor.
 */
export const ONAY_ACIKLAMALARI = {
  kvkk: {
    baslik: "KVKK Onayı",
    metin:
      "6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında; ad-soyad, iletişim bilgileriniz ve klinik kayıtlarınızın randevu planlama, tedavi süreçlerinin yürütülmesi ve yasal yükümlülüklerin yerine getirilmesi amacıyla işlenmesine onay verirsiniz. Verileriniz yalnızca klinik hizmetleri kapsamında saklanır, izniniz olmadan üçüncü kişilerle paylaşılmaz.",
  },
  saglik: {
    baslik: "Sağlık Verisi İşleme Onayı",
    metin:
      "Özel nitelikli kişisel veri sayılan sağlık bilgileriniz (tıbbi geçmiş, alerjiler, kullanılan ilaçlar, ağrı skalası, tedavi notları vb.) yalnızca tedavi planınızın oluşturulması ve takibi amacıyla işlenir. Bu onay verilmeden sağlık geçmişi bilgileriniz sisteme kaydedilemez.",
  },
  whatsapp: {
    baslik: "WhatsApp Bildirim Onayı",
    metin:
      "Randevu hatırlatmaları, paket durumu ve bakiye bilgilendirmesi için WhatsApp üzerinden mesaj almayı kabul edersiniz. Bu izni istediğiniz zaman WhatsApp'tan \"DUR\" yazarak veya kliniğe bildirerek geri çekebilirsiniz.",
  },
  ticari: {
    baslik: "Ticari İleti (SMS/E-posta) Onayı",
    metin:
      "Randevu hatırlatmaları dışında; kampanya, indirim ve bilgilendirme amaçlı SMS ve e-posta mesajları almayı kabul edersiniz. Bu onayı istediğiniz zaman geri çekebilirsiniz.",
  },
} as const;

export type OnayTuru = keyof typeof ONAY_ACIKLAMALARI;
