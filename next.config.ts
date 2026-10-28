import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

const nextConfig: NextConfig = {
  // Windows Server dağıtımı (deploy/windows/guncelle.ps1): `.next/standalone/server.js` + izlenen node_modules tek klasörde çıkar;
  // `.next/static` ve `public` sürüm klasörüne betikle kopyalanır. Sunucuda `npm ci` gerekmez, `node server.js` yeter.
  output: "standalone",
  // puppeteer-core Node.js API'lerine (fs, child_process) dayanır: Next'in bundler'ı paketlemesin, node_modules'ten olduğu gibi yüklensin.
  // PDF için tarayıcı sistem Chrome/Edge'dir (CHROMIUM_PATH); pakete ikili dosya GİRMEZ.
  serverExternalPackages: ["puppeteer-core"],
  async headers() {
    return [
      {
        // Service worker betiği asla CDN/tarayıcı önbelleğinde kalmasın —
        // güncelleme kontrolü her seferinde sunucuya gitsin.
        source: "/tablet-sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
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

export default withBundleAnalyzer(nextConfig);
