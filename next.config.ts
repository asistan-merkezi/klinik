import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Şirket Bilgileri formu tek istekte 2 logo dosyası gönderebiliyor;
      // istemci tarafında sıkıştırılsalar da (bkz. sirket-bilgileri-formu.tsx)
      // SVG sıkıştırılmadan geçtiği için Next.js'in 1 MB'lık varsayımı yerine
      // güvenli bir pay bırakılıyor.
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
