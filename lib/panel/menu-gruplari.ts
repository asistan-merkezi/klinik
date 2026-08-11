import {
  Landmark,
  TrendingDown,
  BarChart3,
  Building2,
  RefreshCw,
  MessageCircle,
  Tablet,
  ShieldCheck,
  Wallet,
  Settings,
  ClipboardList,
  ListChecks,
  UploadCloud,
  QrCode,
  Percent,
  ShoppingCart,
  HandCoins,
  type LucideIcon,
} from "lucide-react";

export type MenuOgesi = { href: string; label: string; icon: LucideIcon };
export type MenuGrubu = { key: string; label: string; icon: LucideIcon; ogeler: MenuOgesi[] };

export const MENU_GRUPLARI: MenuGrubu[] = [
  {
    key: "tedaviler",
    label: "Tedaviler",
    icon: ClipboardList,
    ogeler: [
      { href: "/panel/islemler", label: "Tedaviler", icon: ClipboardList },
      { href: "/panel/tedavi-protokolleri", label: "Tedavi Protokolleri", icon: ListChecks },
    ],
  },
  {
    key: "muhasebe",
    label: "Muhasebe",
    icon: Wallet,
    ogeler: [
      { href: "/panel/muhasebe/gelirler-takibi", label: "Gelirler Takibi ve Faturalandırma", icon: HandCoins },
      {
        href: "/panel/muhasebe/satin-alma-faturalari",
        label: "Satın Alma Faturaları",
        icon: ShoppingCart,
      },
      { href: "/panel/muhasebe/kamusal-giderler", label: "Kamusal Giderler", icon: Landmark },
      { href: "/panel/muhasebe/giderler", label: "Giderler", icon: TrendingDown },
      { href: "/panel/muhasebe/raporlar", label: "Raporlar", icon: BarChart3 },
      {
        href: "/panel/muhasebe/kategori-iskonto-oranlari",
        label: "Kategori / İskonto Oranları",
        icon: Percent,
      },
    ],
  },
  {
    key: "ayarlar",
    label: "Ayarlar",
    icon: Settings,
    ogeler: [
      { href: "/panel/ayarlar/sirket-bilgileri", label: "Şirket Bilgileri", icon: Building2 },
      { href: "/panel/ayarlar/muhasebe-sync", label: "Muhasebe Sync", icon: RefreshCw },
      { href: "/panel/ayarlar/whatsapp", label: "WhatsApp, Mail ve Mesaj Ayarları", icon: MessageCircle },
      { href: "/panel/tablet", label: "Kapı Tablet Ayarları", icon: Tablet },
      { href: "/panel/ayarlar/yetkilendirme", label: "Yetkilendirme", icon: ShieldCheck },
      {
        href: "/panel/ayarlar/arsiv-ice-aktarma",
        label: "Arşiv Yükleme ve Yedekleme",
        icon: UploadCloud,
      },
      { href: "/panel/ayarlar/qr-kodlar", label: "QR Kodları", icon: QrCode },
    ],
  },
];
