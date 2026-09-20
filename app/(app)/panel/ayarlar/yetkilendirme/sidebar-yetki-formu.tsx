"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { SIDEBAR_YETKI_OGELERI } from "@/lib/panel/menu-gruplari";
import { sidebarMenuGorunurlukDegistir } from "./actions";

export function SidebarYetkiFormu({
  departmanlar,
  departmanRolleri,
  baslangicGizli,
  duzenlenebilir,
}: {
  departmanlar: string[];
  departmanRolleri: Record<string, string[]>;
  baslangicGizli: Record<string, string[]>;
  duzenlenebilir: boolean;
}) {
  const [gizliByDepartman, setGizliByDepartman] = useState(baslangicGizli);
  const [pending, startTransition] = useTransition();
  const [hata, setHata] = useState<string | null>(null);

  function degistir(departman: string, anahtar: string, gorunur: boolean) {
    setHata(null);
    setGizliByDepartman((s) => ({
      ...s,
      [departman]: gorunur ? (s[departman] ?? []).filter((k) => k !== anahtar) : [...(s[departman] ?? []), anahtar],
    }));
    startTransition(async () => {
      const sonuc = await sidebarMenuGorunurlukDegistir(departman, anahtar, gorunur);
      if (sonuc && !sonuc.success) {
        setHata(sonuc.message);
        // Sunucu reddettiyse ekrandaki değişikliği geri al.
        setGizliByDepartman((s) => ({
          ...s,
          [departman]: gorunur ? [...(s[departman] ?? []), anahtar] : (s[departman] ?? []).filter((k) => k !== anahtar),
        }));
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 rounded-xl border border-border p-4">
        <h3 className="text-sm font-medium">Hastalar</h3>
        <p className="text-xs text-muted-foreground">
          Not: hastalar personel değildir, bir departmana girmez. Kendi şifresiyle Hasta Portalı&apos;na giriş
          yaptığında yalnızca kendi hasta detay bölümünü görür.
        </p>
      </div>
      {departmanlar.length === 0 && (
        <p className="text-sm text-muted-foreground">Önce Personel Tanımlama&apos;dan bir departman/pozisyon eklenmeli.</p>
      )}
      {departmanlar.map((departman) => (
        <div key={departman} className="flex flex-col gap-1 rounded-xl border border-border p-4">
          <h3 className="text-sm font-medium">
            {departman}
            {departmanRolleri[departman]?.length ? (
              <span className="font-normal text-muted-foreground"> ({departmanRolleri[departman].join(", ")})</span>
            ) : null}
          </h3>
          <ul className="flex flex-col divide-y divide-border">
            {SIDEBAR_YETKI_OGELERI.map((oge) => {
              const gorunur = !(gizliByDepartman[departman] ?? []).includes(oge.key);
              return (
                <li key={oge.key} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span>{oge.label}</span>
                  <Switch
                    checked={gorunur}
                    disabled={!duzenlenebilir || pending}
                    onCheckedChange={(deger) => degistir(departman, oge.key, deger)}
                  />
                </li>
              );
            })}
          </ul>
          {departman === "Klinik & Terapi Departmanı" && (
            <p className="pt-2 text-xs text-muted-foreground">
              Not: bu departmandaki kişiler (terapist), departmandan bağımsız olarak Hasta Detayı&apos;nda Kişisel
              Bilgiler ve Cari &amp; Ödeme bölümlerini hiçbir zaman göremez.
            </p>
          )}
        </div>
      ))}
      {hata && <p className="text-xs text-destructive">{hata}</p>}
    </div>
  );
}
