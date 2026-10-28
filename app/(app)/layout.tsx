import type { Metadata } from "next";
import { headers } from "next/headers";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import "../globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";

// docs/DESIGN.md: Plus Jakarta Sans, latin + latin-ext (ş/ğ/ı/İ/ö/ü/ç için).
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Nonce'lu CSP için her sayfa istek başına işlenmelidir (statik üretim nonce taşıyamaz): lib/guvenlik/csp.ts.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Klinik Asistanı",
  description: "Fizyoterapi kliniği muayene yönetim paneli",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="tr"
      className={`${jakarta.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider nonce={nonce} attribute="class" defaultTheme="dark" enableSystem={false}>
          {children}
          <ThemeToggle />
        </ThemeProvider>
      </body>
    </html>
  );
}
