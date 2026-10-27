// Gece zorunlu çıkış kuralı (eski components/scheduled-logout.tsx'in SUNUCU tarafı karşılığı): resepsiyon ve terapist oturumları
// 20:00-07:00 arası her tam saatte kapanır (20, 21, 22, 23, 00, 01, ..., 07). Mesai boyunca (08:00-19:59) kesintisiz açık kalır.
// Diğer roller (klinik_admin, muhasebe, super_admin) ve hasta portalı bu kısıtlamaya tabi DEĞİLDİR. Saat dilimi Europe/Istanbul.
// Sunucuda uygulanır: tarayıcı zamanlayıcısına (kapatılabilir/atlatılabilir) bağlı kalmaz; kapanış anından ÖNCE açılmış oturum geçersizdir.
export const GECE_KAPANIS_SAATLERI: ReadonlySet<number> = new Set([20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6, 7]);
export const GECE_KAPANIS_ROLLERI: ReadonlySet<string> = new Set(["resepsiyon", "terapist"]);

const SAAT_BICIMI = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", hourCycle: "h23" });
const istanbulSaati = (d: Date) => Number(SAAT_BICIMI.format(d));

/** `simdi`den önceki (veya eşit) en son tam saat başı kapanış anı. Istanbul UTC+3 sabittir (yaz saati yok): tam saat sınırları UTC saat sınırlarıyla çakışır. */
export function sonKapanisAni(simdi: Date): Date {
  const saatBasi = new Date(simdi);
  saatBasi.setUTCMinutes(0, 0, 0);
  for (let geri = 0; geri <= 24; geri++) {
    const aday = new Date(saatBasi.getTime() - geri * 3600_000);
    if (GECE_KAPANIS_SAATLERI.has(istanbulSaati(aday))) return aday;
  }
  return saatBasi; // erişilmemeli
}

// --- Yalnız testler için ayar noktaları (üretim kodu çağırmaz) ---
let testSaati: (() => Date) | null = null;
let testDevreDisi = false;
export function testSaatiAyarla(saglayici: (() => Date) | null): void {
  testSaati = saglayici;
}
export function testGeceKapanisiDevreDisi(devreDisi: boolean): void {
  testDevreDisi = devreDisi;
}

/** true = bu rol için oturum son kapanış anından önce açılmış, yani artık geçersiz. */
export function geceKapanisinaTakildi(rol: string, oturumOlusturma: Date, simdi?: Date): boolean {
  if (!GECE_KAPANIS_ROLLERI.has(rol)) return false;
  if (testDevreDisi && !simdi && !testSaati) return false;
  const an = simdi ?? testSaati?.() ?? new Date();
  return oturumOlusturma.getTime() < sonKapanisAni(an).getTime();
}
