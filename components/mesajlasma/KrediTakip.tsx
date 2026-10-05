import Link from "next/link";
import { cn } from "@/lib/utils";
import { BOLUM_ETIKET, type MesajBolum } from "@/types/mesajlasma";

export type KrediTakipGorunum = "gunluk" | "aylik" | "yillik";

/** Günlük görünümde tek tek mesaj; Aylık'ta gün, Yıllık'ta ay bazında toplam. */
export type KrediTakipMesaj = {
  id: string;
  saat: string;
  tetikleyiciAdi: string;
  bolum: MesajBolum | null;
  /** Maskelenmiş alıcı adresi (telefon/e-posta). */
  alici: string;
};

export type KrediTakipToplamSatiri = { etiket: string; adet: number };

export type KrediTakipNav = {
  etiket: string;
  onceki: string | null;
  sonraki: string | null;
  gorunumHref: Record<KrediTakipGorunum, string>;
};

const GORUNUM_ETIKET: Record<KrediTakipGorunum, string> = { gunluk: "Günlük", aylik: "Aylık", yillik: "Yıllık" };
const GORUNUM_SIRASI: KrediTakipGorunum[] = ["gunluk", "aylik", "yillik"];

export function KrediTakip({
  gorunum,
  nav,
  toplam,
  mesajlar,
  toplamSatirlari,
}: {
  gorunum: KrediTakipGorunum;
  nav: KrediTakipNav;
  toplam: number;
  mesajlar: KrediTakipMesaj[];
  toplamSatirlari: KrediTakipToplamSatiri[];
}) {
  const gezinmeDugmesi = "rounded-lg border border-border px-3 py-1.5 hover:bg-muted/60";
  const pasifDugme = "rounded-lg border border-border px-3 py-1.5 text-muted-foreground opacity-50";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl bg-muted/60 p-1 text-sm">
          {GORUNUM_SIRASI.map((g) => (
            <Link
              key={g}
              href={nav.gorunumHref[g]}
              className={cn(
                "rounded-lg px-3.5 py-1.5 font-medium transition-colors",
                gorunum === g ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {GORUNUM_ETIKET[g]}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 text-sm">
          {nav.onceki ? (
            <Link className={gezinmeDugmesi} href={nav.onceki}>
              ‹ Önceki
            </Link>
          ) : (
            <span className={pasifDugme}>‹ Önceki</span>
          )}
          <span className="min-w-36 text-center font-medium capitalize">{nav.etiket}</span>
          {nav.sonraki ? (
            <Link className={gezinmeDugmesi} href={nav.sonraki}>
              Sonraki ›
            </Link>
          ) : (
            <span className={pasifDugme}>Sonraki ›</span>
          )}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Bu dönemde gönderilen mesaj: <span className="font-semibold tabular-nums text-foreground">{toplam}</span>
      </p>

      {toplam === 0 ? (
        <p className="text-sm text-muted-foreground">Bu dönemde gönderim kaydı yok.</p>
      ) : gorunum === "gunluk" ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Saat</th>
                <th className="px-3 py-2 text-left font-medium">Mesaj</th>
                <th className="px-3 py-2 text-left font-medium">Bölüm</th>
                <th className="px-3 py-2 text-left font-medium">Alıcı</th>
              </tr>
            </thead>
            <tbody>
              {mesajlar.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{m.saat}</td>
                  <td className="px-3 py-2">{m.tetikleyiciAdi}</td>
                  <td className="px-3 py-2">{m.bolum ? BOLUM_ETIKET[m.bolum] : "—"}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{m.alici}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[320px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">{gorunum === "aylik" ? "Gün" : "Ay"}</th>
                <th className="px-3 py-2 text-right font-medium">Gönderilen Mesaj</th>
              </tr>
            </thead>
            <tbody>
              {toplamSatirlari.map((s) => (
                <tr key={s.etiket} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 capitalize">{s.etiket}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.adet}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
