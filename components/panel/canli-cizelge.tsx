"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { gunAraligi } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { RandevuSatir } from "@/types/randevu";
import { Activity } from "lucide-react";

const DURUM_ETIKET: Record<RandevuSatir["durum"], string> = {
  planlandi: "Planlandı",
  geldi: "Geldi",
  iptal: "İptal",
  gelmedi: "Gelmedi",
};

function saatFormat(tarih: string) {
  return new Date(tarih).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

export function CanliCizelge({ baslangicRandevular }: { baslangicRandevular: RandevuSatir[] }) {
  const [randevular, setRandevular] = useState(baslangicRandevular);
  const [simdi, setSimdi] = useState<Date | null>(null);
  const [saat, setSaat] = useState<string | null>(null);

  useEffect(() => {
    setSimdi(new Date());
    setSaat(new Date().toLocaleTimeString("tr-TR"));
    const id = setInterval(() => {
      setSimdi(new Date());
      setSaat(new Date().toLocaleTimeString("tr-TR"));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let kanal: ReturnType<typeof supabase.channel> | null = null;
    let iptalEdildi = false;

    async function listeyiYenile() {
      const { baslangic, bitis } = gunAraligi();
      const { data } = await supabase
        .from("randevu")
        .select(
          "id, baslangic, bitis, durum, musteri(ad_soyad), oda(ad), terapist(personel(ad_soyad))"
        )
        .gte("baslangic", baslangic)
        .lt("baslangic", bitis)
        .order("baslangic")
        .returns<RandevuSatir[]>();

      if (data) {
        setRandevular(data);
      }
    }

    async function abonelikKur() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }
      if (iptalEdildi) return;

      kanal = supabase
        .channel("randevu-panel-canli")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "randevu" },
          () => {
            listeyiYenile();
          }
        )
        .subscribe();
    }

    abonelikKur();

    return () => {
      iptalEdildi = true;
      if (kanal) {
        supabase.removeChannel(kanal);
      }
    };
  }, []);

  const devamEdenSayisi = useMemo(() => {
    if (!simdi) return 0;
    return randevular.filter(
      (r) =>
        r.durum === "geldi" &&
        new Date(r.baslangic) <= simdi &&
        new Date(r.bitis) >= simdi
    ).length;
  }, [randevular, simdi]);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card text-card-foreground">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-primary" aria-hidden />
          <h2 className="text-sm font-semibold">Bugünün Çizelgesi</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-primary ring-1 ring-inset ring-primary/30">
            <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
            Canlı
          </span>
          <time suppressHydrationWarning className="font-mono text-sm tabular-nums text-muted-foreground">
            {saat ?? "--:--:--"}
          </time>
        </div>
      </header>

      <div className="px-4 pb-4 sm:px-5">
        {randevular.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">Bugün için randevu yok.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {randevular.map((randevu) => {
              const baslangicTarih = new Date(randevu.baslangic);
              const bitisTarih = new Date(randevu.bitis);
              const devamEdiyor =
                simdi !== null &&
                randevu.durum === "geldi" &&
                baslangicTarih <= simdi &&
                bitisTarih >= simdi;
              const gecmis = simdi !== null && bitisTarih < simdi;

              return (
                <li
                  key={randevu.id}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-lg px-2 py-3 text-sm transition-colors",
                    devamEdiyor && "bg-primary/5 ring-1 ring-inset ring-primary/30",
                    gecmis && randevu.durum !== "geldi" && "opacity-60"
                  )}
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{randevu.musteri?.ad_soyad ?? "—"}</span>
                    <span className="text-muted-foreground">
                      {randevu.terapist?.personel?.ad_soyad ?? "—"} · {randevu.oda?.ad ?? "—"}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="tabular-nums">{saatFormat(randevu.baslangic)}</span>
                    <span
                      className={cn(
                        "text-xs",
                        devamEdiyor ? "font-semibold text-primary" : "text-muted-foreground"
                      )}
                    >
                      {devamEdiyor ? "Seansta" : DURUM_ETIKET[randevu.durum]}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
        {devamEdenSayisi > 0 ? `${devamEdenSayisi} muayene devam ediyor` : "Şu an aktif seans yok"}
      </footer>
    </div>
  );
}
