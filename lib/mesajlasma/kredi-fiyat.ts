import type { MesajKanal } from "@/types/mesajlasma";

export type KrediPaket = { miktar: number; tutar: number };

/**
 * Örnek/geçici fiyatlandırma — gerçek fiyatlar netleşince burası güncellenecek.
 * Kredi Yükle formunda admin bu paketlerden birine tıklayıp miktar/tutarı
 * otomatik doldurabilir, ya da elle serbest bir miktar girebilir.
 *
 * TODO(payment-integration): şu an "Kredi Yükle" sadece admin'in manuel miktar
 * girdiği bir kayıt formu (mesaj_kredi_yukle RPC'si) — gerçek bir ödeme alınmıyor.
 * Ödeme entegrasyonu (İyzico/Stripe) geldiğinde bu paketler checkout akışının
 * kaynağı olacak, RPC imzası muhtemelen değişmeyecek.
 */
export const KREDI_PAKETLERI: KrediPaket[] = [
  { miktar: 100, tutar: 150 },
  { miktar: 500, tutar: 650 },
  { miktar: 1000, tutar: 1200 },
];

export const KANAL_BIRIM_FIYAT: Record<MesajKanal, number> = {
  sms: 1.5,
  whatsapp: 1.3,
  mail: 0.5,
};
