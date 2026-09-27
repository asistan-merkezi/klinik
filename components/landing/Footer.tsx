// components/landing/Footer.tsx
import Link from "next/link";
import { Stethoscope, Mail } from "lucide-react";

const URUN = [
  { href: "#ozellikler", label: "Özellikler" },
  { href: "/fiyatlandirma", label: "Fiyatlandırma" },
  { href: "/demo", label: "Canlı demo" },
  { href: "/destek", label: "Destek" },
];

const YASAL = [
  { href: "/kvkk-aydinlatma-metni", label: "KVKK Aydınlatma Metni" },
  { href: "/gizlilik-politikasi", label: "Gizlilik Politikası" },
  { href: "/kullanim-kosullari", label: "Kullanım Koşulları" },
  { href: "/cerez-politikasi", label: "Çerez Politikası" },
];

const SIRKET = [
  { href: "/hakkimizda", label: "Hakkımızda" },
  { href: "/iletisim", label: "İletişim" },
  { href: "/giris", label: "Giriş yap" },
];

// Ticari unvan/adres/telefon henüz netleşmedi — gerçek bilgiler
// belli olunca burada güncellenecek.
const SIRKET_UNVANI = "[Ticari unvan henüz belirlenmedi]";
const SIRKET_ADRES = "[Adres henüz belirlenmedi]";
const IRTIBAT_EPOSTA = "info@klinikasistani.com";

export default function Footer() {
  return (
    <footer className="border-t border-white/5">
      <div className="mx-auto max-w-6xl px-5 py-16 lg:py-20">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="flex items-center gap-2 text-ink">
              <Stethoscope className="h-5 w-5 text-primary-500" aria-hidden />
              <span className="text-base font-semibold tracking-tight">Klinik Asistanı</span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-muted">
              Fizyoterapi klinikleri için randevu, hasta takibi ve tahsilatı tek
              ekranda toplayan klinik yönetim platformu.
            </p>
            <a
              href={`mailto:${IRTIBAT_EPOSTA}`}
              className="mt-4 flex items-center gap-2 text-sm text-ink-muted transition-colors hover:text-ink"
            >
              <Mail className="h-4 w-4 text-primary-500" aria-hidden />
              {IRTIBAT_EPOSTA}
            </a>
            <p className="mt-6 text-xs leading-relaxed text-ink-faint">
              {SIRKET_UNVANI}
              <br />
              {SIRKET_ADRES}
            </p>
          </div>

          <nav aria-label="Ürün">
            <h3 className="text-sm font-semibold text-ink">Ürün</h3>
            <ul className="mt-4 space-y-3">
              {URUN.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-sm text-ink-muted transition-colors hover:text-ink"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Yasal">
            <h3 className="text-sm font-semibold text-ink">Yasal</h3>
            <ul className="mt-4 space-y-3">
              {YASAL.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-sm text-ink-muted transition-colors hover:text-ink"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Şirket">
            <h3 className="text-sm font-semibold text-ink">Şirket</h3>
            <ul className="mt-4 space-y-3">
              {SIRKET.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-sm text-ink-muted transition-colors hover:text-ink"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-14 border-t border-white/5 pt-8 text-xs text-ink-faint">
          © {new Date().getFullYear()} Klinik Asistanı. Tüm hakları saklıdır.
        </div>
      </div>
    </footer>
  );
}
