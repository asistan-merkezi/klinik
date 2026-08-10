import type { LucideIcon } from "lucide-react";
import { UserPlus, ClipboardEdit, LogIn, LogOut } from "lucide-react";

export type QrKodTipi = "hasta_on_kayit" | "anket" | "puantaj_giris" | "puantaj_cikis";

export type QrKodTanimi = {
  tip: QrKodTipi;
  icon: LucideIcon;
  baslik: string;
  aciklama: string;
  yol: (klinikId: string) => string;
  dosyaAdi: string;
  goruntuleHref?: string;
  goruntuleEtiket?: string;
};

/**
 * QR Kodları yönetim listesindeki (bkz. /panel/ayarlar/qr-kodlar) SADECE
 * statik/kapı QR'ları — /anket/seans/[randevuId] gibi randevuya özel dinamik
 * QR'lar buraya dahil DEĞİL (tablette anlık üretiliyor, aç/kapa anlamsız).
 */
export const QR_KOD_TANIMLARI: QrKodTanimi[] = [
  {
    tip: "hasta_on_kayit",
    icon: UserPlus,
    baslik: "Hasta Ön Kayıt",
    aciklama:
      "Hasta kendi ad-soyad, telefon ve kimlik bilgilerini girerek ön kayıt oluşturur. Kayıtlar doğrudan Hastalar listesinde görünür.",
    yol: (klinikId) => `/kayit/hasta/${klinikId}`,
    dosyaAdi: "hasta-on-kayit-qr",
    goruntuleHref: "/panel/hastalar",
    goruntuleEtiket: "Hastalar listesini görüntüle",
  },
  {
    tip: "anket",
    icon: ClipboardEdit,
    baslik: "Anket ve Öneriler",
    aciklama: "Hasta memnuniyet puanı ve öneri bırakır; isim/telefon opsiyoneldir.",
    yol: (klinikId) => `/anket/${klinikId}`,
    dosyaAdi: "anket-oneri-qr",
    goruntuleHref: "/panel/ayarlar/qr-kodlar/anket-yanitlari",
  },
  {
    tip: "puantaj_giris",
    icon: LogIn,
    baslik: "Personel Puantaj — Giriş",
    aciklama:
      "Personel bu kodu kapıdan kendi telefonuyla okutur, açılan ekranda sadece 6 haneli Puantaj PIN'ini girer. PIN'i her personel kendi Personel Detay sayfasından belirler.",
    yol: (klinikId) => `/puantaj/${klinikId}/giris`,
    dosyaAdi: "personel-puantaj-giris-qr",
  },
  {
    tip: "puantaj_cikis",
    icon: LogOut,
    baslik: "Personel Puantaj — Çıkış",
    aciklama:
      "Personel bu kodu kapıdan kendi telefonuyla okutur, açılan ekranda sadece 6 haneli Puantaj PIN'ini girer. PIN'i her personel kendi Personel Detay sayfasından belirler.",
    yol: (klinikId) => `/puantaj/${klinikId}/cikis`,
    dosyaAdi: "personel-puantaj-cikis-qr",
  },
];
