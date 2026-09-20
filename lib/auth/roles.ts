/**
 * Yetkilendirme mimarisinin TEK gerçeklik kaynağı — Sidebar görünürlüğü ve
 * (hub sayfalarındaki) route koruması buradan besleniyor. Şartnamedeki
 * `MODULE_TREE`/`ROUTE_TO_MODULE`/`canAccessModule`/`resolveHubRedirect`
 * fonksiyonlarının bu projenin GERÇEK route envanterine uyarlanmış hali —
 * kapsam/sapma notları için plan dosyasına (yetkilendirme oturumu) bakılabilir.
 *
 * Bu dosya BİLİNÇLİ olarak saf/istemci-güvenli tutuluyor (server-only import
 * YOK) — `components/panel/sidebar.tsx` gibi "use client" bileşenler de
 * doğrudan import ediyor. DB'ye erişen taraf (`kullaniciModulleriGetir`,
 * `erisimKontrolEt`) `lib/auth/roles-server.ts`'te, AYRI dosyada — aksi halde
 * `next/headers`/Supabase server client'ı client bundle'a sızıyor (bu ayrım
 * olmadan `next build` "You're importing a module that depends on
 * next/headers" hatasıyla kırıldı, gerçek build'te bulundu).
 *
 * Bilinçli sapma: gerçek edge middleware yerine `roles-server.ts`'teki
 * fonksiyonlar hub page'lerden çağrılıyor (`erisimKontrolEt`) — bu proje
 * middleware'de HİÇ DB sorgusu yapmıyor (yerel JWT doğrulama, performans
 * kararı, bkz. lib/supabase/middleware.ts), o yüzden modül kontrolünü de
 * oraya taşımak bu kararla çelişirdi. Aynı sebeple `permissions_version`
 * kolonu DB trigger'larıyla otomatik artıyor ama JWT claim'e gömülmüyor —
 * her sayfa zaten Server Component olarak taze render olduğundan (SPA değil)
 * "bayat JWT" sorunu yok.
 */

export interface ModuleNode {
  key: string;
  label: string;
  path?: string;
  children?: ModuleNode[];
}

export const MODULE_TREE: ModuleNode[] = [
  { key: "ana_ekran", label: "Ana Ekran", path: "/panel" },
  { key: "hastalar", label: "Hastalar", path: "/panel/hastalar" },
  { key: "randevular", label: "Randevular", path: "/panel/randevular" },
  {
    key: "finans",
    label: "Finans",
    path: "/panel/finans",
    children: [
      // Personel ve Paketler URL olarak /panel/finans altında değil (sidebar
      // grubu ile URL hiyerarşisi bu projede örtüşmüyor) — modül anahtarı
      // yine de finans.* altında, izin kontrolü buna göre yapılır.
      { key: "finans.personel", label: "Personel", path: "/panel/personel" },
      { key: "finans.paketler", label: "Paket & Ödeme Yönetimi", path: "/panel/paketler" },
      { key: "finans.satin_alma_faturalari", label: "Satın Alma Faturaları", path: "/panel/finans/satin-alma-faturalari" },
      { key: "finans.kasa", label: "Kasa", path: "/panel/finans/kasa" },
      { key: "finans.banka", label: "Banka", path: "/panel/finans/banka" },
      { key: "finans.kredi_karti", label: "Kredi Kartı", path: "/panel/finans/kredi-karti" },
      { key: "finans.kamusal_giderler", label: "Kamusal Giderler", path: "/panel/finans/kamusal-giderler" },
      { key: "finans.raporlar", label: "Raporlar", path: "/panel/finans/raporlar" },
      { key: "finans.gelirler_takibi", label: "Gelirler Takibi ve Faturalandırma", path: "/panel/finans/gelirler-takibi" },
      { key: "finans.giderler", label: "Giderler", path: "/panel/finans/giderler" },
      { key: "finans.kategori_iskonto_oranlari", label: "Kategori / İskonto Oranları", path: "/panel/finans/kategori-iskonto-oranlari" },
    ],
  },
  {
    key: "yonetim",
    label: "Yönetim",
    path: "/panel/yonetim",
    children: [
      { key: "yonetim.kaynaklar", label: "Donanım", path: "/panel/kaynaklar" },
      { key: "yonetim.islemler", label: "Tedaviler", path: "/panel/islemler" },
      { key: "yonetim.tedavi_protokolleri", label: "Tedavi Protokolleri", path: "/panel/tedavi-protokolleri" },
    ],
  },
  {
    key: "ayarlar",
    label: "Ayarlar",
    path: "/panel/ayarlar",
    children: [
      { key: "ayarlar.sirket_bilgileri", label: "Şirket Bilgileri", path: "/panel/ayarlar/sirket-bilgileri" },
      { key: "ayarlar.personel_tanimlama", label: "Personel Tanımlama", path: "/panel/ayarlar/personel-tanimlama" },
      { key: "ayarlar.muhasebe_sync", label: "Muhasebe Sync", path: "/panel/ayarlar/muhasebe-sync" },
      { key: "ayarlar.mesajlasma", label: "SMS/Whatsapp/Mail Ayarları", path: "/panel/ayarlar/mesajlasma" },
      // Ayarlar linki /panel/tablet'in kendisine gider (oda seçici) — asıl
      // kiosk görünümü /panel/tablet/[odaId] bu modül sisteminin KAPSAMI
      // DIŞINDA bırakıldı (fiziksel cihaz ekranı, normal rol akışının parçası
      // değil).
      { key: "ayarlar.tablet", label: "Kapı Tablet Ayarları", path: "/panel/tablet" },
      { key: "ayarlar.yetkilendirme", label: "Yetkilendirme", path: "/panel/ayarlar/yetkilendirme" },
      { key: "ayarlar.arsiv_ice_aktarma", label: "Arşiv Yükleme ve Yedekleme", path: "/panel/ayarlar/arsiv-ice-aktarma" },
      { key: "ayarlar.qr_kodlar", label: "QR Kodları", path: "/panel/ayarlar/qr-kodlar" },
    ],
  },
  // Her zaman erişilebilir — canAccessModule'de özel durum, allowed_modules
  // içinde hiç saklanmasına gerek yok.
  { key: "destek", label: "Destek", path: "/panel/destek" },
];

function agaciDuzlestir(dugumler: ModuleNode[], sonuc: Record<string, string> = {}): Record<string, string> {
  for (const dugum of dugumler) {
    if (dugum.path) sonuc[dugum.path] = dugum.key;
    if (dugum.children) agaciDuzlestir(dugum.children, sonuc);
  }
  return sonuc;
}

/** path -> module key. MODULE_TREE'den türetilir, elle senkron tutulmaz. */
export const ROUTE_TO_MODULE: Record<string, string> = agaciDuzlestir(MODULE_TREE);

/**
 * `/panel/finans/giderler/yeni` gibi bir alt path'i en UZUN eşleşen kayıtlı
 * path'e (`/panel/finans/giderler`) göre çözer.
 */
export function moduleKeyForRoute(pathname: string): string | null {
  const adaylar = Object.keys(ROUTE_TO_MODULE)
    .filter((yol) => pathname === yol || pathname.startsWith(`${yol}/`))
    .sort((a, b) => b.length - a.length);
  return adaylar.length > 0 ? ROUTE_TO_MODULE[adaylar[0]] : null;
}

/**
 * Kullanıcının modüle erişim izni olup olmadığını kontrol eder. Üst modül
 * izni (ör. 'finans') otomatik olarak tüm alt modüllere (ör.
 * 'finans.giderler') erişim sağlar.
 */
export function canAccessModule(userModules: string[] | undefined, targetModuleKey: string): boolean {
  if (!userModules || !Array.isArray(userModules)) return false;
  if (userModules.includes("*")) return true;
  if (targetModuleKey === "destek") return true;

  if (userModules.includes(targetModuleKey)) return true;

  const parts = targetModuleKey.split(".");
  if (parts.length > 1 && userModules.includes(parts[0])) return true;

  return false;
}

/**
 * Kullanıcının doğrudan hub sayfasına (ör. /panel/finans) erişimi yoksa
 * yetkili olduğu ilk alt modülün path'ini döner.
 */
export function resolveHubRedirect(userModules: string[] | undefined, hubKey: string): string | null {
  if (!userModules) return null;

  const hubNode = MODULE_TREE.find((m) => m.key === hubKey);
  if (!hubNode?.children?.length) return null;

  const ilkYetkiliAltModul = hubNode.children.find((child) => canAccessModule(userModules, child.key));
  return ilkYetkiliAltModul?.path ?? null;
}
