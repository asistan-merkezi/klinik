// Bellek içi klinik bazlı dağıtım (fan-out). Süreç başına tek örnek (bkz. index.ts). Saf mantık: veritabanına dokunmaz, test edilebilir.
// Tenant izolasyonu: bir olay YALNIZ olayın klinik_id'sine kayıtlı abonelere gider; abonenin klinik kimliği oturumdan gelir (istemci veremez).
import type { CanliOlay, CanliTablo, IstemciOlayi } from "./olay";

export type AboneMesaji = { tur: "olay"; olay: IstemciOlayi } | { tur: "yeniden" } | { tur: "ping" };

export type Abone = {
  klinikId: string;
  kullaniciId: string;
  tablolar: ReadonlySet<CanliTablo>;
  /** Mesajı aboneye iletir; false dönerse abone yavaş/kapalıdır ve dağıtıcı onu kaldırır. */
  gonder: (m: AboneMesaji) => boolean;
};

export class Dagitici {
  private klinikler = new Map<string, Set<Abone>>();
  private kullaniciSayaci = new Map<string, number>();

  constructor(private readonly kullaniciBasinaLimit = 5) {}

  /** Aboneliği kaydeder. Kullanıcı bağlantı sınırı aşılırsa null döner. Dönüş: aboneliği kaldıran fonksiyon (idempotent). */
  abone(a: Abone): (() => void) | null {
    if ((this.kullaniciSayaci.get(a.kullaniciId) ?? 0) >= this.kullaniciBasinaLimit) return null;
    let kume = this.klinikler.get(a.klinikId);
    if (!kume) this.klinikler.set(a.klinikId, (kume = new Set()));
    kume.add(a);
    this.kullaniciSayaci.set(a.kullaniciId, (this.kullaniciSayaci.get(a.kullaniciId) ?? 0) + 1);
    let kaldirildi = false;
    return () => {
      if (kaldirildi) return;
      kaldirildi = true;
      this.kaldir(a);
    };
  }

  private kaldir(a: Abone) {
    const kume = this.klinikler.get(a.klinikId);
    if (kume?.delete(a) && kume.size === 0) this.klinikler.delete(a.klinikId);
    const n = (this.kullaniciSayaci.get(a.kullaniciId) ?? 1) - 1;
    if (n <= 0) this.kullaniciSayaci.delete(a.kullaniciId);
    else this.kullaniciSayaci.set(a.kullaniciId, n);
  }

  /** Olayı yalnız aynı klinikteki ve o tabloya abone olanlara iletir. Dönüş: ulaşan abone sayısı. */
  dagit(o: CanliOlay): number {
    const kume = this.klinikler.get(o.klinikId);
    if (!kume) return 0;
    let n = 0;
    for (const a of [...kume]) {
      if (!a.tablolar.has(o.tablo)) continue;
      if (a.gonder({ tur: "olay", olay: { t: o.tablo, i: o.id } })) n++;
      else this.kaldir(a);
    }
    return n;
  }

  /** Dinleyici yeniden bağlandı: kesintide kaçan olaylar için TÜM abonelerden yeniden çekmeleri istenir. */
  hepsineYeniden(): void {
    this.herkeseGonder({ tur: "yeniden" });
  }

  /** Kalp atışı (ölü bağlantı tespiti + vekil sunucu zaman aşımını önler). */
  ping(): void {
    this.herkeseGonder({ tur: "ping" });
  }

  private herkeseGonder(m: AboneMesaji) {
    for (const kume of [...this.klinikler.values()]) for (const a of [...kume]) if (!a.gonder(m)) this.kaldir(a);
  }

  toplamAbone(): number {
    let n = 0;
    for (const k of this.klinikler.values()) n += k.size;
    return n;
  }

  kullaniciAboneSayisi(kullaniciId: string): number {
    return this.kullaniciSayaci.get(kullaniciId) ?? 0;
  }
}
