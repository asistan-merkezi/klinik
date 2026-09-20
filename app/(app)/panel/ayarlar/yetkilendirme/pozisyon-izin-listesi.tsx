import { Tabs, TabsList, TabsTrigger, TabsPanel } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Pozisyon } from "@/types/pozisyon";
import { PozisyonIzinDialog } from "./pozisyon-izin-dialog";

export function PozisyonIzinListesi({
  departmanlar,
  pozisyonlarByDepartman,
  duzenlenebilir,
}: {
  departmanlar: string[];
  pozisyonlarByDepartman: Record<string, Pozisyon[]>;
  duzenlenebilir: boolean;
}) {
  if (departmanlar.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Önce Personel Tanımlama&apos;dan bir departman/pozisyon eklenmeli.
      </p>
    );
  }

  return (
    <Tabs defaultValue={departmanlar[0]}>
      <TabsList>
        {departmanlar.map((d) => (
          <TabsTrigger key={d} value={d}>
            {d}
          </TabsTrigger>
        ))}
      </TabsList>
      {departmanlar.map((departman) => (
        <TabsPanel key={departman} value={departman}>
          <ul className="flex flex-col divide-y divide-border">
            {(pozisyonlarByDepartman[departman] ?? []).map((poz) => (
              <li key={poz.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={poz.aktif ? "font-medium" : "font-medium text-muted-foreground line-through"}>
                    {poz.ad}
                  </span>
                  {poz.varsayilan_rol === "klinik_admin" && <StatusBadge tone="indigo">Tam Yetkili</StatusBadge>}
                </div>
                <PozisyonIzinDialog pozisyon={poz} duzenlenebilir={duzenlenebilir} />
              </li>
            ))}
          </ul>
        </TabsPanel>
      ))}
    </Tabs>
  );
}
