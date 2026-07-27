// app/(marketing)/layout.tsx
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Türkçe karakter desteği için latin-ext zorunlu (ğ ş ı İ ç ö ü)
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Klinik Asistanı — Akıllı Klinik & Randevu Yönetim Sistemi",
  description:
    "Yapay zeka destekli canlı randevu çizelgesi, otomatik WhatsApp hatırlatmaları ve hasta takibi tek platformda.",
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={`${inter.variable} ${mono.variable}`}>
      <body className="bg-canvas font-sans text-ink">{children}</body>
    </html>
  );
}
