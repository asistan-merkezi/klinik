"use client";

/**
 * Kök layout'un kendisi hata verdiğinde (font/tema sağlayıcısı dahil hiçbir şey
 * yüklenemez) devreye girer — bu yüzden kendi <html>'ini çizer ve tasarım
 * token'larına/bileşenlere dayanmaz.
 */
export default function KokHata({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="tr">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 16 }}>
          <h1 style={{ fontSize: 18, marginBottom: 8 }}>Bir sorun oluştu</h1>
          <p style={{ fontSize: 14, opacity: 0.7, marginBottom: 16 }}>Sayfa yüklenemedi. Lütfen tekrar deneyin.</p>
          <button type="button" onClick={reset} style={{ padding: "8px 16px", borderRadius: 8, cursor: "pointer" }}>
            Tekrar Dene
          </button>
        </div>
      </body>
    </html>
  );
}
