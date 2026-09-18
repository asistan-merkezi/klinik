"use client";

import { useState, useTransition } from "react";
import { Tabs, TabsList, TabsTrigger, TabsPanel } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { ROL_SECENEKLERI, type KullaniciRol } from "@/types/personel";
import { SIDEBAR_YETKI_OGELERI } from "@/lib/panel/menu-gruplari";
import { sidebarMenuGorunurlukDegistir } from "./actions";

export function SidebarYetkiFormu({
  baslangicGizli,
  duzenlenebilir,
}: {
  baslangicGizli: Record<KullaniciRol, string[]>;
  duzenlenebilir: boolean;
}) {
  const [gizliByRol, setGizliByRol] = useState(baslangicGizli);
  const [pending, startTransition] = useTransition();
  const [hata, setHata] = useState<string | null>(null);

  function degistir(rol: KullaniciRol, anahtar: string, gorunur: boolean) {
    setHata(null);
    setGizliByRol((s) => ({
      ...s,
      [rol]: gorunur ? s[rol].filter((k) => k !== anahtar) : [...s[rol], anahtar],
    }));
    startTransition(async () => {
      const sonuc = await sidebarMenuGorunurlukDegistir(rol, anahtar, gorunur);
      if (sonuc && !sonuc.success) {
        setHata(sonuc.message);
        // Sunucu reddettiyse ekrandaki değişikliği geri al.
        setGizliByRol((s) => ({
          ...s,
          [rol]: gorunur ? [...s[rol], anahtar] : s[rol].filter((k) => k !== anahtar),
        }));
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Tabs defaultValue={ROL_SECENEKLERI[0].value}>
        <TabsList>
          {ROL_SECENEKLERI.map((r) => (
            <TabsTrigger key={r.value} value={r.value}>
              {r.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {ROL_SECENEKLERI.map((r) => (
          <TabsPanel key={r.value} value={r.value}>
            <ul className="flex flex-col divide-y divide-border">
              {SIDEBAR_YETKI_OGELERI.map((oge) => {
                const gorunur = !gizliByRol[r.value].includes(oge.key);
                return (
                  <li key={oge.key} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span>{oge.label}</span>
                    <Switch
                      checked={gorunur}
                      disabled={!duzenlenebilir || pending}
                      onCheckedChange={(deger) => degistir(r.value, oge.key, deger)}
                    />
                  </li>
                );
              })}
            </ul>
          </TabsPanel>
        ))}
      </Tabs>
      {hata && <p className="text-xs text-destructive">{hata}</p>}
    </div>
  );
}
