// Süreç başına TEK Postgres LISTEN bağlantısı (havuz DIŞI: havuz bağlantıları LISTEN için uygun değildir, sürekli açık kalmalı).
// Hata/kopma: üstel geri çekilmeyle yeniden bağlanır; yeniden bağlanınca kesintide kaçan olaylar için aboneler "yeniden" ile uyarılır.
import pg from "pg";
import { CANLI_KANALI, olayCoz } from "./olay";
import type { Dagitici } from "./dagitici";

export type DinleyiciSecenekleri = { baglantiAdresi: string; ilkBekleMs?: number; enFazlaBekleMs?: number; log?: Pick<Console, "warn" | "error"> };

export class PgDinleyici {
  private istemci: pg.Client | null = null;
  private zamanlayici: ReturnType<typeof setTimeout> | null = null;
  private durduruldu = true;
  private bekleMs: number;
  private ilkBaglanti = true;
  private readonly ilkBekle: number;
  private readonly enFazlaBekle: number;
  private readonly log: Pick<Console, "warn" | "error">;
  /** Test/izleme için: tamamlanan başarılı bağlantı sayısı. */
  baglantiSayisi = 0;

  constructor(private readonly dagitici: Dagitici, private readonly sec: DinleyiciSecenekleri) {
    this.ilkBekle = sec.ilkBekleMs ?? 1000;
    this.enFazlaBekle = sec.enFazlaBekleMs ?? 30_000;
    this.bekleMs = this.ilkBekle;
    this.log = sec.log ?? console;
  }

  baslat(): void {
    if (!this.durduruldu) return;
    this.durduruldu = false;
    void this.baglan();
  }

  async durdur(): Promise<void> {
    this.durduruldu = true;
    if (this.zamanlayici) clearTimeout(this.zamanlayici);
    this.zamanlayici = null;
    const c = this.istemci;
    this.istemci = null;
    if (c) await c.end().catch(() => {});
  }

  private planla() {
    if (this.durduruldu || this.zamanlayici) return;
    this.zamanlayici = setTimeout(() => {
      this.zamanlayici = null;
      void this.baglan();
    }, this.bekleMs);
    this.zamanlayici.unref?.();
    this.bekleMs = Math.min(this.bekleMs * 2, this.enFazlaBekle);
  }

  private async baglan() {
    if (this.durduruldu) return;
    const c = new pg.Client({ connectionString: this.sec.baglantiAdresi, application_name: "klinik-canli-dinleyici", keepAlive: true });
    let dustu = false;
    const kopus = (neden: string) => {
      if (dustu) return;
      dustu = true;
      if (this.istemci === c) this.istemci = null;
      c.removeAllListeners();
      c.on("error", () => {}); // kapanırken gelen son hatalar süreci düşürmesin
      c.end().catch(() => {});
      if (!this.durduruldu) {
        this.log.warn(`[canli] dinleyici bağlantısı koptu (${neden}); yeniden denenecek`);
        this.planla();
      }
    };
    c.on("error", (e) => kopus(e.message));
    c.on("end", () => kopus("bağlantı kapandı"));
    c.on("notification", (m) => {
      if (m.channel !== CANLI_KANALI) return;
      const olay = olayCoz(m.payload);
      if (olay) this.dagitici.dagit(olay);
    });
    try {
      await c.connect();
      await c.query(`LISTEN ${CANLI_KANALI}`);
    } catch (e) {
      kopus((e as Error).message);
      return;
    }
    if (this.durduruldu) {
      await c.end().catch(() => {});
      return;
    }
    this.istemci = c;
    this.baglantiSayisi++;
    this.bekleMs = this.ilkBekle;
    // İlk bağlantıdan sonraki her bağlantı bir yeniden bağlanmadır: kesintide kaçan olaylar için abonelere telafi çağrısı.
    if (!this.ilkBaglanti) this.dagitici.hepsineYeniden();
    this.ilkBaglanti = false;
  }
}
