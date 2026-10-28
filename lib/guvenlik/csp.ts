// Content-Security-Policy (nonce tabanlı) ve ortak güvenlik başlıkları. Sorumluluk dağılımı: docs/guvenlik-baseline.md.
//   - script-src: yalnız bu isteğin nonce'u + 'strict-dynamic' (satır içi/yabancı betik çalışmaz). Üretimde 'unsafe-eval' YOK (geliştirmede React için gerekir).
//   - style-src: 'unsafe-inline' (React `style=` öznitelikleri, framer-motion, Base UI konumlandırması nonce'la verilemez); stil enjeksiyonu betik çalıştıramaz.
//   - img-src blob:/data: (hasta fotoğraf önizlemesi, QR), connect-src 'self' (SSE + fetch aynı köken), worker-src (tablet service worker).
//   - frame-ancestors 'none' + form-action 'self' + base-uri 'self' + object-src 'none'.
export function nonceUret(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

export function cspMetni(nonce: string, uretim: boolean): string {
  const k = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${uretim ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (uretim) k.push("upgrade-insecure-requests");
  return k.join("; ");
}

/** next.config.ts headers(): CSP dışındaki, her yanıta eklenen başlıklar (Caddy aynılarını ayrıca koyar; HSTS yalnız Caddy'de — TLS orada sonlanır). */
export const ORTAK_BASLIKLAR: { key: string; value: string }[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];
