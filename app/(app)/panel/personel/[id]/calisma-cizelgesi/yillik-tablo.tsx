import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import { saatEtiket } from "@/lib/puantaj";
import type { YillikAySatiri } from "@/types/puantaj";

const AY_ADLARI = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

export function YillikTablo({ personelId, yil, aylar }: { personelId: string; yil: number; aylar: YillikAySatiri[] }) {
  const toplam = aylar.reduce(
    (acc, a) => ({
      netSaat: acc.netSaat + a.netSaat,
      onayliFmSaat: acc.onayliFmSaat + a.onayliFmSaat,
      eksikSaat: acc.eksikSaat + a.eksikSaat,
      izinGun: acc.izinGun + a.izinGun,
      devamsizlikGun: acc.devamsizlikGun + a.devamsizlikGun,
    }),
    { netSaat: 0, onayliFmSaat: 0, eksikSaat: 0, izinGun: 0, devamsizlikGun: 0 }
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <th className="px-3 py-2 text-left font-medium">Ay</th>
            <th className="px-2 py-2 text-right font-medium">Net Saat</th>
            <th className="px-2 py-2 text-right font-medium">Onaylı FM</th>
            <th className="px-2 py-2 text-right font-medium">Eksik</th>
            <th className="px-2 py-2 text-right font-medium">İzin Günü</th>
            <th className="px-2 py-2 text-right font-medium">Devamsızlık</th>
            <th className="px-2 py-2 text-left font-medium">Dönem Durumu</th>
          </tr>
        </thead>
        <tbody>
          {aylar.map((a) => (
            <tr key={a.ay} className="border-b border-border last:border-b-0">
              <td className="px-3 py-2">
                <Link
                  href={`/panel/personel/${personelId}/calisma-cizelgesi?gorunum=aylik&ay=${yil}-${String(a.ay).padStart(2, "0")}`}
                  className="font-medium underline decoration-dotted underline-offset-2 hover:text-primary"
                >
                  {AY_ADLARI[a.ay - 1]}
                </Link>
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{saatEtiket(a.netSaat)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{saatEtiket(a.onayliFmSaat)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{saatEtiket(a.eksikSaat)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{a.izinGun}</td>
              <td className="px-2 py-2 text-right tabular-nums">{a.devamsizlikGun}</td>
              <td className="px-2 py-2">
                <StatusBadge tone={a.donemDurum === "kapali" ? "slate" : "emerald"}>
                  {a.donemDurum === "kapali" ? "Kapalı" : "Açık"}
                </StatusBadge>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border bg-muted/40">
            <td className="px-3 py-2 font-semibold">Yıl Toplamı</td>
            <td className="px-2 py-2 text-right font-semibold tabular-nums">{saatEtiket(toplam.netSaat)}</td>
            <td className="px-2 py-2 text-right font-semibold tabular-nums">{saatEtiket(toplam.onayliFmSaat)}</td>
            <td className="px-2 py-2 text-right font-semibold tabular-nums">{saatEtiket(toplam.eksikSaat)}</td>
            <td className="px-2 py-2 text-right font-semibold tabular-nums">{toplam.izinGun}</td>
            <td className="px-2 py-2 text-right font-semibold tabular-nums">{toplam.devamsizlikGun}</td>
            <td className="px-2 py-2" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
