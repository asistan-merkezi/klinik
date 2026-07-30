"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { gunAraligi } from "@/lib/utils";
import { formatTime } from "@/lib/datetime";
import type { RandevuSatir } from "@/types/randevu";

const DURUM_ETIKET: Record<RandevuSatir["durum"], string> = {
  planlandi: "Planlandı",
  geldi: "Geldi",
  iptal: "İptal",
  gelmedi: "Gelmedi",
};

export function TabletEkrani({
  odaId,
  baslangicRandevular,
}: {
  odaId: string;
  baslangicRandevular: RandevuSatir[];
}) {
  const [randevular, setRandevular] = useState(baslangicRandevular);
  const [simdi, setSimdi] = useState(() => new Date());

  useEffect(() => {
    const supabase = createClient();
    let kanal: ReturnType<typeof supabase.channel> | null = null;
    let iptalEdildi = false;

    async function gunlukListeyiYenile() {
      const { baslangic, bitis } = gunAraligi();
      const { data } = await supabase
        .from("randevu")
        .select(
          "id, baslangic, bitis, durum, hasta(ad_soyad), oda(ad), terapist(personel(ad_soyad))"
        )
        .eq("oda_id", odaId)
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
        .channel(`randevu-oda-${odaId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "randevu", filter: `oda_id=eq.${odaId}` },
          () => {
            gunlukListeyiYenile();
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
  }, [odaId]);

  useEffect(() => {
    const zamanlayici = setInterval(() => setSimdi(new Date()), 30_000);
    return () => clearInterval(zamanlayici);
  }, []);

  const { mevcut, sonraki } = useMemo(() => {
    const icerdeOlan = randevular.find((r) => r.durum === "geldi");
    if (icerdeOlan) {
      return { mevcut: icerdeOlan, sonraki: null };
    }

    const gelecekPlanli = randevular
      .filter((r) => r.durum === "planlandi" && new Date(r.baslangic) >= simdi)
      .sort((a, b) => new Date(a.baslangic).getTime() - new Date(b.baslangic).getTime());

    return { mevcut: null, sonraki: gelecekPlanli[0] ?? null };
  }, [randevular, simdi]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      {mevcut ? (
        <>
          <span className="text-sm uppercase tracking-widest text-emerald-400">İçeride</span>
          <span className="text-5xl font-bold">{mevcut.hasta?.ad_soyad ?? "—"}</span>
          <span className="text-xl text-foreground/80">
            {mevcut.terapist?.personel?.ad_soyad ?? "—"}
          </span>
        </>
      ) : sonraki ? (
        <>
          <span className="text-sm uppercase tracking-widest text-muted-foreground">Sıradaki</span>
          <span className="text-5xl font-bold">{sonraki.hasta?.ad_soyad ?? "—"}</span>
          <span className="text-xl text-foreground/80">
            {sonraki.terapist?.personel?.ad_soyad ?? "—"} · {formatTime(sonraki.baslangic)}
          </span>
        </>
      ) : (
        <span className="text-3xl font-semibold text-muted-foreground">Oda boş</span>
      )}

      {randevular.length > 0 && (
        <div className="mt-8 w-full max-w-md text-left">
          <h2 className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
            Bugünkü program
          </h2>
          <ul className="flex flex-col divide-y divide-border text-sm">
            {randevular.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2">
                <span className={r.durum === "iptal" ? "text-muted-foreground line-through" : ""}>
                  {formatTime(r.baslangic)} — {r.hasta?.ad_soyad ?? "—"}
                </span>
                <span className="text-muted-foreground">{DURUM_ETIKET[r.durum]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
