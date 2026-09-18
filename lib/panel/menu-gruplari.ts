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
  LifeBuoy,
  BookOpen,
  Bot,
  MessageSquareWarning,
  UserCog,
  Package,
  Banknote,
  DoorOpen,
  Boxes,
  CreditCard,
  Briefcase,
  type LucideIcon,
} from "lucide-react";

export type MenuOgesi = { href: string; label: string; icon: LucideIcon };
export type MenuGrubu = { key: string; label: string; icon: LucideIcon; ogeler: MenuOgesi[] };

// Sidebar'da GERÇEKTEN görünen üst seviye linkler — Ayarlar > Yetkilendirme'de
// rol bazlı aç/kapa listesi bunlarla birebir aynı (anahtarlar sidebar.tsx'teki
// ANA_OGELER hrefleriyle ve MENU_GRUPLARI'ndaki grup.key'lerle eşleşiyor).
// "Destek" bilinçli olarak burada YOK — her rol için hep açık kalıyor.
export const SIDEBAR_YETKI_OGELERI: { key: string; label: string }[] = [
  { key: "ana-ekran", label: "Ana Ekran" },
  { key: "hastalar", label: "Hastalar" },
  { key: "randevular", label: "Randevular" },
  { key: "finans", label: "Finans" },
  { key: "yonetim", label: "Yönetim" },
  { key: "ayarlar", label: "Ayarlar" },
];

// klinik_ayarlar.ayarlar.sidebar_gizli artık ROL değil DEPARTMAN (pozisyon.grup)
// bazlı — bir kullanıcının hangi departmanda olduğu personel.pozisyon_id
// üzerinden çözülüyor (bkz. app/(app)/panel/layout.tsx). Departman hiç
// özelleştirilmemişse bu varsayılana düşülür — eskiden sidebar.tsx'te sabit
// kodlu olan "terapist Finans'ı görmez" kuralıyla aynı, sadece anahtar artık
// rol değil o kuralın fiilen karşılığı olan departman. Departman adları
// Ayarlar > Personel Tanımlama'daki katalogla birebir eşleşmeli — katalog
// değişirse (departman adı değişir/silinirse) burası da elle güncellenmeli,
// merkezi bir kaynak değil (bkz. root CLAUDE.md "Teknik Borç" notu, aynı sınıf).
export const SIDEBAR_GIZLI_VARSAYILAN_DEPARTMAN: Record<string, string[]> = {
  "Klinik & Terapi Departmanı": ["finans"],
};

// Departman hiç çözülemezse (personel kaydı yok, pozisyon_id boş vb.) veya
// klinik hiç departman kullanmıyorsa düşülecek son çare — hiçbir şey gizli
// değil, sidebar tam görünür (link gizlemek erişim vermiyor/almıyor, en
// güvenli varsayılan budur).
export const SIDEBAR_GIZLI_BOS: string[] = [];

export const MENU_GRUPLARI: MenuGrubu[] = [
  {
    key: "finans",
    label: "Finans",
    icon: Wallet,
    ogeler: [
      { href: "/panel/personel", label: "Personel", icon: UserCog },
      { href: "/panel/paketler", label: "Paket & Ödeme Yönetimi", icon: Package },
      {
        href: "/panel/finans/satin-alma-faturalari",
        label: "Satın Alma Faturaları",
        icon: ShoppingCart,
      },
      { href: "/panel/finans/kasa", label: "Kasa", icon: Banknote },
      { href: "/panel/finans/banka", label: "Banka", icon: Building2 },
      { href: "/panel/finans/kredi-karti", label: "Kredi Kartı", icon: CreditCard },
      { href: "/panel/finans/kamusal-giderler", label: "Kamusal Giderler", icon: Landmark },
      { href: "/panel/finans/raporlar", label: "Raporlar", icon: BarChart3 },
      { href: "/panel/finans/gelirler-takibi", label: "Gelirler Takibi ve Faturalandırma", icon: HandCoins },
      { href: "/panel/finans/giderler", label: "Giderler", icon: TrendingDown },
      {
        href: "/panel/finans/kategori-iskonto-oranlari",
        label: "Kategori / İskonto Oranları",
        icon: Percent,
      },
    ],
  },
  {
    key: "yonetim",
    label: "Yönetim",
    icon: Boxes,
    ogeler: [
      { href: "/panel/paketler", label: "Paketler", icon: Package },
      { href: "/panel/kaynaklar", label: "Donanım", icon: DoorOpen },
      { href: "/panel/islemler", label: "Tedaviler", icon: ClipboardList },
      { href: "/panel/tedavi-protokolleri", label: "Tedavi Protokolleri", icon: ListChecks },
    ],
  },
  {
    key: "ayarlar",
    label: "Ayarlar",
    icon: Settings,
    ogeler: [
      { href: "/panel/ayarlar/sirket-bilgileri", label: "Şirket Bilgileri", icon: Building2 },
      { href: "/panel/ayarlar/personel-tanimlama", label: "Personel Tanımlama", icon: Briefcase },
      { href: "/panel/ayarlar/muhasebe-sync", label: "Muhasebe Sync", icon: RefreshCw },
      { href: "/panel/ayarlar/mesajlasma", label: "SMS/Whatsapp/Mail Ayarları", icon: MessageCircle },
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
  {
    key: "destek",
    label: "Destek",
    icon: LifeBuoy,
    ogeler: [
      { href: "/panel/destek/kullanim-kilavuzu", label: "Kullanım Kılavuzu", icon: BookOpen },
      { href: "/panel/destek/chatbot", label: "Destek Chatbotu", icon: Bot },
      { href: "/panel/destek/talep-sikayetler", label: "Talep ve Şikayetler", icon: MessageSquareWarning },
    ],
  },
];
