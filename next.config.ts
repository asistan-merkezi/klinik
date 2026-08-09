import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // puppeteer-core + @sparticuz/chromium Node.js API'lerine (fs, child_process)
  // ve büyük native binary'lere dayanıyor — Next.js'in serverless fonksiyon
  // bundler'ının bunları paketlemeye çalışıp bozması yerine dışarıda
  // (node_modules'ten olduğu gibi) bırakılması gerekiyor.
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
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
