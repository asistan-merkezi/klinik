// Güvenlik taban çizgisi birim testleri (docs/guvenlik-baseline.md): başlıklar, CSP, CSRF/köken, log hijyeni, SVG, girdi şemaları, uç taraması, hız sınırı fail-closed.
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { cspMetni, ORTAK_BASLIKLAR } from "./csp";
import { ayniKokenMi } from "./origin";
import { logArgumaniTemizle, logMetniTemizle } from "./log-temizle";
import { svgGuvenliMi } from "@/lib/dosya/imza";
import { arsivParcasiSemasi, girisFormuSemasi, sifreDegistirFormuSemasi, uuidZorunlu, GecersizGirdi } from "./girdi";

const KOK = path.resolve(__dirname, "../..");
const oku = (g: string) => fs.readFileSync(path.join(KOK, g), "utf8");
const gez = (y: string): string[] => {
  const tam = path.join(KOK, y);
  if (fs.statSync(tam).isFile()) return [y.split(path.sep).join("/")];
  return fs.readdirSync(tam).flatMap((a) => (a === "node_modules" || a === ".next" ? [] : gez(path.join(y, a))));
};

describe("CSP ve başlıklar", () => {
  it("üretim CSP'si: nonce'lu betik + strict-dynamic, unsafe-eval YOK, betikte unsafe-inline YOK, frame-ancestors none, upgrade-insecure-requests", () => {
    const c = cspMetni("abc123", true);
    expect(c).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(c).not.toContain("unsafe-eval");
    expect(c.match(/script-src[^;]*/)![0]).not.toContain("unsafe-inline");
    for (const d of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", "connect-src 'self'", "upgrade-insecure-requests"]) expect(c, d).toContain(d);
    expect(c).not.toMatch(/\*|https?:/); // dış kaynak yok
  });
  it("geliştirmede unsafe-eval (React) var, upgrade-insecure-requests yok", () => {
    const c = cspMetni("n", false);
    expect(c).toContain("'unsafe-eval'");
    expect(c).not.toContain("upgrade-insecure-requests");
  });
  it("ortak başlıklar next.config.ts'ten her yola eklenir", async () => {
    const adlar = ORTAK_BASLIKLAR.map((b) => b.key);
    for (const k of ["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy"]) expect(adlar).toContain(k);
    const cfg = (await import("../../next.config")).default as unknown as { headers: () => Promise<{ source: string; headers: { key: string }[] }[]> };
    const h = await cfg.headers();
    expect(h.find((x) => x.source === "/:path*")!.headers.map((x) => x.key)).toEqual(adlar);
  });
  it("sunucu eylemleri için allowedOrigins GENİŞLETİLMEMİŞ (yalnız aynı köken; Next Origin↔Host denetimi) ve CORS başlığı hiçbir yerde yok", () => {
    expect(oku("next.config.ts")).not.toContain("allowedOrigins");
    const dosyalar = [...gez("app"), ...gez("lib"), "proxy.ts", "next.config.ts"].filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f));
    for (const f of dosyalar) expect(oku(f), f).not.toMatch(/Access-Control-Allow-/i);
  });
  it("Caddy: HSTS, nosniff, frame, referrer, permissions başlıkları ve sunucu bilgisi gizleme tanımlı (HSTS yalnız Caddy'de — TLS orada sonlanır)", () => {
    const c = oku("deploy/windows/Caddyfile");
    // Erişim günlüğü: belirteçli adresler ve çerez/yetki başlıkları dosyaya yazılmaz
    for (const b of ["format filter", "request>uri regexp", "/b/", "reset-password", "request>headers>Cookie delete", "request>headers>Authorization delete", "resp_headers>Set-Cookie delete"]) expect(c, b).toContain(b);
    const desen = /request>uri regexp "([^"]+)" "([^"]+)"/.exec(c)!;
    const caddyRe = new RegExp(desen[1].replace("[^/?&\s]+", "[^/?&\s]+"), "g");
    for (const u of ["/b/AbCdEfGhIjKlMnOpQrStUvWxYz012345", "/sifre-sifirla?token=abc123secret&x=1", "/api/auth/reset-password/tokentokentoken?callbackURL=/x"]) {
      const t = u.replace(caddyRe, (_m, g1: string) => `${g1}[GIZLI]`);
      expect(t, u).toContain("[GIZLI]");
      expect(t, u).not.toMatch(/AbCdEfGh|abc123secret|tokentokentoken/);
    }
    for (const b of ["Strict-Transport-Security", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy", "-Server", "-X-Powered-By", "max_size"]) expect(c, b).toContain(b);
  });
});

describe("hata sızıntısı ve çerez/oturum ayarları", () => {
  it("route handler'lar yanıt gövdesine istisna mesajı/stack yazmaz; next.config X-Powered-By ve kaynak haritası kapalı", () => {
    for (const f of gez("app").filter((x) => /route\.ts$/.test(x))) {
      const kod = oku(f);
      expect(kod, f).not.toMatch(/(Response\.json|NextResponse\.json|new Response)\([^;]*(e|err|hata|error)\.(message|stack)/);
    }
    const cfg = oku("next.config.ts");
    expect(cfg).toContain("poweredByHeader: false");
    expect(cfg).toContain("productionBrowserSourceMaps: false");
  });
  it("çerezler: httpOnly + SameSite=Lax + üretimde Secure; oturum 12 saat, cookieCache kapalı (iptal anında etkili); kayıt kapalı", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_SECRET", "x".repeat(40));
    vi.stubEnv("BETTER_AUTH_URL", "https://klinik.ornek.com.tr");
    vi.stubEnv("DATABASE_URL", "postgres://u:p@localhost:1/x");
    vi.stubEnv("KIMLIK_DATABASE_URL", "postgres://u:p@localhost:1/x");
    vi.resetModules();
    const { kimlik, kimlikSifirla } = await import("@/lib/auth/auth");
    kimlikSifirla();
    const o = kimlik().options as unknown as { advanced: { useSecureCookies: boolean; defaultCookieAttributes: Record<string, unknown>; cookiePrefix: string }; session: { expiresIn: number; cookieCache: { enabled: boolean } }; emailAndPassword: { disableSignUp: boolean; revokeSessionsOnPasswordReset: boolean; resetPasswordTokenExpiresIn: number } };
    expect(o.advanced.useSecureCookies).toBe(true);
    expect(o.advanced.defaultCookieAttributes).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true });
    expect(o.session.expiresIn).toBeLessThanOrEqual(12 * 3600);
    expect(o.session.cookieCache.enabled).toBe(false);
    expect(o.emailAndPassword).toMatchObject({ disableSignUp: true, revokeSessionsOnPasswordReset: true, resetPasswordTokenExpiresIn: 1800 });
    kimlikSifirla();
    vi.unstubAllEnvs();
    // cihaz çerezi (lib/auth/next.ts) da aynı öznitelikleri taşır
    expect(oku("lib/auth/next.ts")).toMatch(/httpOnly: true, sameSite: "lax", secure: process\.env\.NODE_ENV === "production"/);
  });
});

describe("CSRF: köken denetimi (route handler POST)", () => {
  const istek = (basliklar: Record<string, string>) => new Request("http://localhost:3000/api/x", { method: "POST", headers: basliklar });
  it("aynı köken / başlıksız kabul; farklı Origin ve cross-site reddedilir", () => {
    process.env.BETTER_AUTH_URL = "https://klinik.ornek.com.tr";
    expect(ayniKokenMi(istek({ origin: "https://klinik.ornek.com.tr", "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(ayniKokenMi(istek({}))).toBe(true);
    expect(ayniKokenMi(istek({ origin: "https://evil.example" }))).toBe(false);
    expect(ayniKokenMi(istek({ origin: "https://klinik.ornek.com.tr.evil.example" }))).toBe(false);
    expect(ayniKokenMi(istek({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(ayniKokenMi(istek({ "sec-fetch-site": "same-site" }))).toBe(false);
    expect(ayniKokenMi(istek({ origin: "null" }))).toBe(false);
    delete process.env.BETTER_AUTH_URL;
  });
});

describe("log hijyeni", () => {
  it("/b/ belirteci, Bearer, şifre/token parametreleri, bağlantı dizesi parolası, TC, IBAN, e-posta, telefon, Resend anahtarı silinir", () => {
    const girdiler = [
      "GET /b/AbCdEfGhIjKlMnOpQrStUvWxYz012345 yönlendirildi",
      "Authorization: Bearer abcdef0123456789abcdef",
      'body {"sifre":"Gizli123!","mevcut_sifre":"Eski123!"}',
      "url ?token=xyz987secret&x=1",
      "bağlandı postgres://klinik_uygulama:SuperParola@localhost:5432/klinik",
      "TC 12345678901 IBAN TR330006100519786457841326",
      "ayse@ornek.com 05321112233",
      "key re_abcdef123456789",
    ];
    const ciktilar = girdiler.map(logMetniTemizle).join("\n");
    for (const sir of ["AbCdEfGhIjKlMnOpQrStUvWxYz012345", "abcdef0123456789abcdef", "Gizli123!", "Eski123!", "xyz987secret", "SuperParola", "12345678901", "TR3300061005", "ayse@ornek.com", "05321112233", "re_abcdef123456789"]) expect(ciktilar, sir).not.toContain(sir);
  });
  it("UUID ve ISO zaman damgası hata ayıklama için KORUNUR", () => {
    const u = "11111111-1111-4111-8111-111111111111";
    expect(logMetniTemizle(`klinik ${u} 2026-10-28T09:04:49.245Z`)).toBe(`klinik ${u} 2026-10-28T09:04:49.245Z`);
  });
  it("Error: mesaj ve stack temizlenir, ad korunur; nesne JSON olarak temizlenir", () => {
    const e = new Error("bağlantı postgres://u:Parola1@h/db koptu");
    const t = logArgumaniTemizle(e) as Error;
    expect(t.message).not.toContain("Parola1");
    expect(t.stack ?? "").not.toContain("Parola1");
    expect(JSON.stringify(logArgumaniTemizle({ token: "abcgizli", not: "x", eposta: "a@b.com" }))).not.toMatch(/abcgizli|a@b\.com/);
  });
  it("kuruluysa console.error gerçekten temizler", async () => {
    const { consoleTemizleyiciKur } = await import("./log-temizle");
    const yakalanan: unknown[][] = [];
    const sahte = { log: (...a: unknown[]) => yakalanan.push(a), info: (...a: unknown[]) => yakalanan.push(a), warn: (...a: unknown[]) => yakalanan.push(a), error: (...a: unknown[]) => yakalanan.push(a) };
    consoleTemizleyiciKur(sahte as unknown as Console);
    sahte.error("şifre=Gizli123 /b/AbCdEfGhIjKlMnOpQrStUv");
    expect(JSON.stringify(yakalanan)).not.toMatch(/Gizli123|AbCdEfGhIjKlMnOpQrStUv/);
  });
});

describe("dosya: SVG güvenliği", () => {
  const svg = (ic: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">${ic}</svg>`);
  it("temiz SVG geçer; betik/olay işleyicisi/gömülü içerik/dış href/XXE reddedilir (büyük-küçük harf, boşluk varyantları dahil)", () => {
    expect(svgGuvenliMi(svg('<rect width="5" height="5"/>'))).toBe(true);
    expect(svgGuvenliMi(svg('<use href="#a"/>'))).toBe(true);
    for (const kotu of ["<script>alert(1)</script>", "<SCRIPT >x</SCRIPT>", '<rect onclick="x()"/>', '<rect OnMouseOver = "x"/>', "<foreignObject><body/></foreignObject>", '<a xlink:href="javascript:alert(1)"><rect/></a>', '<image href="https://evil.example/x.png"/>', '<use xlink:href="http://evil.example/a.svg#x"/>', "<iframe src=x />", '<animate attributeName="href" values="javascript:x"/>']) expect(svgGuvenliMi(svg(kotu)), kotu).toBe(false);
    expect(svgGuvenliMi(Buffer.from('<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x SYSTEM "file:///c:/windows/win.ini">]><svg>&x;</svg>'))).toBe(false);
    expect(svgGuvenliMi(Buffer.from("düz metin"))).toBe(false);
  });
});

describe("girdi doğrulama", () => {
  it("uuidZorunlu: geçerli döner, bozuk GecersizGirdi fırlatır (iç ayrıntı yok)", () => {
    expect(uuidZorunlu("11111111-1111-4111-8111-111111111111")).toBe("11111111-1111-4111-8111-111111111111");
    for (const k of ["", "x", "1; drop table hasta", "../../etc/passwd", null, undefined, 5]) expect(() => uuidZorunlu(k, "hastaId")).toThrow(GecersizGirdi);
    expect(() => uuidZorunlu("x", "hastaId")).toThrow("Geçersiz hastaId.");
  });
  it("kimlik formlarında uzunluk üst sınırı (devasa parola/ad reddedilir)", () => {
    expect(girisFormuSemasi.safeParse({ giris_adi: "a@b.com", sifre: "x".repeat(128) }).success).toBe(true);
    expect(girisFormuSemasi.safeParse({ giris_adi: "a@b.com", sifre: "x".repeat(129) }).success).toBe(false);
    expect(girisFormuSemasi.safeParse({ giris_adi: "a".repeat(255), sifre: "x" }).success).toBe(false);
    expect(sifreDegistirFormuSemasi.safeParse({ mevcut_sifre: "a", yeni_sifre: "b".repeat(1_000_000), yeni_sifre_tekrar: "" }).success).toBe(false);
  });
  it("arşiv parçası: 500 satır / 1000 karakter / 60 alan sınırı", () => {
    const tek = { ad: "x" };
    expect(arsivParcasiSemasi.safeParse({ kayitlar: Array(500).fill(tek), baslangicSatirNo: 0 }).success).toBe(true);
    expect(arsivParcasiSemasi.safeParse({ kayitlar: Array(501).fill(tek), baslangicSatirNo: 0 }).success).toBe(false);
    expect(arsivParcasiSemasi.safeParse({ kayitlar: [{ ad: "x".repeat(1001) }], baslangicSatirNo: 0 }).success).toBe(false);
    expect(arsivParcasiSemasi.safeParse({ kayitlar: [Object.fromEntries(Array.from({ length: 61 }, (_, i) => [`k${i}`, "x"]))], baslangicSatirNo: 0 }).success).toBe(false);
    expect(arsivParcasiSemasi.safeParse({ kayitlar: [], baslangicSatirNo: -1 }).success).toBe(false);
  });
});

// Yeni bir server action / route eklenip girdisi doğrulanmazsa BU TEST kırılır: ya zod/uuidZorunlu/Semasi ekle ya da (gerekçeyle) listeye yaz.
describe("uç taraması: girdi doğrulaması", () => {
  const ISTISNALAR: Record<string, string> = {
    "app/(app)/panel/actions.ts": "çıkış: girdisi yok",
    "app/(app)/panel/ayarlar/mesajlasma/kredi/[kanal]/actions.ts": "kanal beyaz liste + paketId merkezin güncel listesiyle eşleştirilir",
    "app/(app)/panel/finans/giderler/gelen-faturalar/actions.ts": "girdisi yok (tetikleyici butonlar)",
    "app/api/auth/[...all]/route.ts": "Better Auth kendi şemalarıyla doğrular",
    "app/api/canli/route.ts": "tabloListesiCoz beyaz liste",
    "app/api/dosya/logo/route.ts": "girdisi yok (tenant oturumdan)",
    "app/api/hasta-arama/route.ts": "tek q parametresi: kırpılır, 100 karakter sınırı, parametreli sorgu",
    "app/api/hasta-belge/foto-yukle/route.ts": "alan alan doğrulama: UUID regex, kategori beyaz liste, tarih regex; dosya imza+boyut servis katmanında",
    "app/api/hasta-belge/[id]/route.ts": "id UUID regex (belgeIcerigiGetir), islem beyaz liste",
    "app/api/hasta-kayit-formu/pdf/route.ts": "girdisi yok (oturum kliniği)",
    "app/api/is-basvuru-formu/pdf/route.ts": "girdisi yok (oturum kliniği)",
    "app/api/logo/[kisaKod]/route.ts": "kısa kod anonim uçta çözümlenir (bilinmeyen = 404, hız sınırı)",
    "app/api/oturum-cikis/route.ts": "girdisi yok",
    "app/api/personel-belge/izin/[talepId]/route.ts": "talepId UUID regex (lib/dosya/personel-belge.ts)",
    "app/api/personel-belge/kase/[personelId]/route.ts": "personelId UUID regex (lib/dosya/personel-belge.ts)",
    "app/api/saglik/route.ts": "girdisi yok",
    "app/b/[token]/route.ts": "TOKEN_KALIBI (lib/mesaj/baglanti-coz.ts)",
  };
  const adaylar = [...gez("app"), ...gez("lib")].filter((f) => /\.ts$/.test(f) && !/\.test\./.test(f)).filter((f) => /\/route\.ts$/.test(f) || oku(f).startsWith('"use server"'));
  it("her server action ve route ya doğrulama kullanır ya da gerekçeli istisna listesindedir", () => {
    const dogrulamasiz = adaylar.filter((f) => !/from "zod"|safeParse|uuidZorunlu|Semasi\b|\.parse\(/.test(oku(f)));
    expect(dogrulamasiz.sort()).toEqual(Object.keys(ISTISNALAR).sort());
  });
});

describe("hız sınırı: FAIL-CLOSED", () => {
  it("sayaç yazılamazsa (DB hatası) istek REDDEDİLİR (503), aşılırsa 429 + Retry-After", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db", () => ({
      withGlobal: async () => {
        throw new Error("db yok");
      },
      sql: (s: TemplateStringsArray) => s.join(""),
    }));
    const { sinirKontrol } = await import("./istek-siniri");
    expect(await sinirKontrol("pdf", "kullanici-1")).toMatchObject({ izin: false, durum: 503 });
    vi.doUnmock("@/lib/db");
    vi.doMock("@/lib/db", () => ({ withGlobal: async () => ({ rows: [{ izin: false }] }), sql: (s: TemplateStringsArray) => s.join("") }));
    vi.resetModules();
    const m2 = await import("./istek-siniri");
    expect(await m2.sinirKontrol("pdf", "kullanici-1")).toMatchObject({ izin: false, durum: 429 });
    const y = await m2.sinirYaniti("dosyaYukle", "k");
    expect(y!.status).toBe(429);
    expect(y!.headers.get("retry-after")).toBeTruthy();
    vi.doUnmock("@/lib/db");
  });
});
