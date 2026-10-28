// Eşzamanlılık sınırı: aynı anda en fazla `maks` iş çalışır, fazlası kuyrukta bekler (en çok `kuyrukMaks` bekleyen; dolduysa HEMEN reddedilir —
// bellek tüketimi ve istek yığılması sınırlı kalsın). Bekleme `beklemeMs`'i aşarsa iş reddedilir. Saf (Chrome'dan bağımsız), test edilebilir.
export class PdfKuyrukDolu extends Error {
  constructor(public readonly neden: "kuyruk_dolu" | "bekleme_zaman_asimi") {
    super(neden === "kuyruk_dolu" ? "PDF kuyruğu dolu, lütfen biraz sonra tekrar deneyin." : "PDF için sıra beklenirken zaman aşımı.");
    this.name = "PdfKuyrukDolu";
  }
}

export class Semafor {
  private aktif = 0;
  private readonly bekleyenler: { coz: () => void; zamanlayici: ReturnType<typeof setTimeout>; reddet: (e: Error) => void }[] = [];

  constructor(
    private readonly maks: number,
    private readonly kuyrukMaks: number,
    private readonly beklemeMs: number
  ) {}

  get durum() {
    return { aktif: this.aktif, bekleyen: this.bekleyenler.length };
  }

  async calistir<T>(is: () => Promise<T>): Promise<T> {
    await this.al();
    try {
      return await is();
    } finally {
      this.birak();
    }
  }

  private al(): Promise<void> {
    if (this.aktif < this.maks) {
      this.aktif++;
      return Promise.resolve();
    }
    if (this.bekleyenler.length >= this.kuyrukMaks) return Promise.reject(new PdfKuyrukDolu("kuyruk_dolu"));
    return new Promise<void>((coz, reddet) => {
      const kayit = {
        coz: () => {
          clearTimeout(kayit.zamanlayici);
          coz();
        },
        reddet,
        zamanlayici: setTimeout(() => {
          const i = this.bekleyenler.indexOf(kayit);
          if (i >= 0) this.bekleyenler.splice(i, 1);
          reddet(new PdfKuyrukDolu("bekleme_zaman_asimi"));
        }, this.beklemeMs),
      };
      this.bekleyenler.push(kayit);
    });
  }

  private birak(): void {
    const siradaki = this.bekleyenler.shift();
    if (siradaki) siradaki.coz(); // yuva doğrudan devredilir (aktif sayısı değişmez)
    else this.aktif--;
  }
}
