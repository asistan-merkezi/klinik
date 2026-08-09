import {
  Receipt,
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
      { href: "/panel/muhasebe/faturalar", label: "Faturalar", icon: Receipt },
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
      { href: "/panel/ayarlar/whatsapp", label: "WhatsApp", icon: MessageCircle },
      { href: "/panel/tablet", label: "Tablet", icon: Tablet },
      { href: "/panel/ayarlar/yetkilendirme", label: "Yetkilendirme", icon: ShieldCheck },
      { href: "/panel/ayarlar/arsiv-ice-aktarma", label: "Arşiv İçe Aktarma", icon: UploadCloud },
      { href: "/panel/ayarlar/qr-kodlar", label: "QR Kodları", icon: QrCode },
    ],
  },
];
