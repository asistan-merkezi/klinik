// Log hijyeni: sunucu günlüklerine (console.*) giden metinlerden gizli/kişisel değerleri siler. instrumentation.ts console'u sarar; bakım betikleri
// (scripts/bakim/ortak.ts) JSON günlüğünü buradan geçirir. Kapsam: /b/ bağlantı belirteçleri, Bearer/Authorization, token/şifre/secret parametreleri,
// çerez değerleri, bağlantı dizesi parolaları, IBAN, kart no, T.C. kimlik, telefon, e-posta. Sağlık notu/ad-soyad desenle YAKALANAMAZ: kod, bu alanları
// log mesajına HİÇ koymaz (kural: yalnız kimlik/uuid ve hata kodu loglanır) — ihlal kod incelemesinde yakalanır.
import { metniMaskele } from "@/lib/destek-chatbot/maskele";

const KALIPLAR: [RegExp, string][] = [
  [/\/b\/[A-Za-z0-9_-]{8,}/g, "/b/[GIZLI]"],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [GIZLI]"],
  [/\b(authorization|cookie|set-cookie)\s*[:=]\s*[^\n;]+/gi, "$1: [GIZLI]"],
  [/(token|jeton|sifre|şifre|parola|password|passwd|secret|api[_-]?key|apikey|newPassword|yeniSifre|mevcutSifre)(["']?\s*[:=]\s*["']?)[^\s"'&,;}]+/gi, "$1$2[GIZLI]"],
  [/(postgres(?:ql)?:\/\/[^:\s/@]+:)[^@\s]+@/gi, "$1[GIZLI]@"],
  [/\bre_[A-Za-z0-9_]{8,}/g, "[GIZLI]"],
];

// UUID'ler (klinik/kayıt kimlikleri) ve ISO zaman damgaları hata ayıklama için KALIR; kart/telefon desenleri onları bozmasın diye parçalanıp maskelenmez.
const KORUNAN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/gi;

export function logMetniTemizle(metin: string): string {
  const once = KALIPLAR.reduce((m, [k, y]) => m.replace(k, y), metin);
  const korunanlar = once.match(KORUNAN) ?? [];
  const parcalar = once.split(KORUNAN).map((p) => metniMaskele(p));
  return parcalar.reduce((acc, p, i) => acc + p + (korunanlar[i] ?? ""), "");
}

/** console.* argümanları: string → temizlenir; Error → ad + temizlenmiş mesaj + temizlenmiş stack; nesne → JSON'a çevrilip temizlenir. */
export function logArgumaniTemizle(a: unknown): unknown {
  if (typeof a === "string") return logMetniTemizle(a);
  if (a instanceof Error) {
    const e = new Error(logMetniTemizle(a.message));
    e.name = a.name;
    e.stack = a.stack ? logMetniTemizle(a.stack) : undefined;
    return e;
  }
  if (a && typeof a === "object") {
    try {
      return JSON.parse(logMetniTemizle(JSON.stringify(a)));
    } catch {
      return "[nesne]";
    }
  }
  return a;
}

let kuruldu = false;
export function consoleTemizleyiciKur(hedef: Pick<Console, "log" | "info" | "warn" | "error"> = console): void {
  if (kuruldu && hedef === console) return;
  if (hedef === console) kuruldu = true;
  for (const seviye of ["log", "info", "warn", "error"] as const) {
    const asil = hedef[seviye].bind(hedef);
    hedef[seviye] = (...args: unknown[]) => asil(...args.map(logArgumaniTemizle));
  }
}
