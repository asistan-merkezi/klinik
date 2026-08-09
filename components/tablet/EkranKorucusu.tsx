import type { Klinik } from "@/types/klinik";
import type { TabletTemasi } from "@/types/tablet-ayarlari";
import { TabletLogo } from "./TabletLogo";

/** 5 dk hareketsizlikte gösterilen ekran koruyucu — arkadaki doku (TabletBackground) aynı kalır, sadece üst bar hariç merkez/alt içeriğin yerine geçer. */
export function EkranKorucusu({ klinik, tema }: { klinik: Klinik; tema: TabletTemasi }) {
  return (
    <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-4">
      <TabletLogo klinik={klinik} tema={tema} />
      <span className="text-lg font-medium text-muted-foreground">Sıradaki hasta için hazırız</span>
    </div>
  );
}
