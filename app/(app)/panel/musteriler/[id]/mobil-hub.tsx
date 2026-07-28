"use client";

import {
  User,
  CalendarDays,
  ClipboardList,
  TrendingUp,
  CreditCard,
  FolderOpen,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MusteriDetay } from "@/types/musteri";
import type { MusteriOzet, MusteriDetayOzet } from "@/types/musteri-detay";
import type { SekmeAnahtari } from "./sekme-tanimlari";

const IKONLAR: Record<SekmeAnahtari, LucideIcon> = {
  genel: User,
  randevu: CalendarDays,
  tedavi: ClipboardList,
  gelisim: TrendingUp,
  cari: CreditCard,
  belgeler: FolderOpen,
  iletisim: MessageSquare,
};

function gorelZaman(tarih: string | null): string {
  if (!tarih) return "Henüz mesaj yok";
  const farkMs = Date.now() - new Date(tarih).getTime();
  const gun = Math.floor(farkMs / 86_400_000);
  if (gun <= 0) return "Bugün";
  if (gun === 1) return "Dün";
  return `${gun} gün önce`;
}

function randevuZamani(tarih: string): string {
  const d = new Date(tarih);
  const tarihMetni = d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" });
  const saatMetni = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  return `Sonraki: ${tarihMetni} ${saatMetni}`;
}

function ozetDegeri(
  sekme: SekmeAnahtari,
  musteri: MusteriDetay,
  ozet: MusteriOzet | null,
  detayOzet: MusteriDetayOzet | null | undefined,
  yukleniyor: boolean
): { deger: string; uyari?: boolean } {
  switch (sekme) {
    case "genel": {
      const eksikOnay = !musteri.kvkk_onay_tarihi || !musteri.ozel_nitelikli_veri_onay_tarihi;
      return { deger: "Kimlik & onaylar", uyari: eksikOnay };
    }
    case "randevu": {
      if (yukleniyor) return { deger: "Yükleniyor…" };
      return { deger: detayOzet?.sonraki_randevu_tarihi ? randevuZamani(detayOzet.sonraki_randevu_tarihi) : "Randevu yok" };
    }
    case "tedavi": {
      if (yukleniyor) return { deger: "Yükleniyor…" };
      const ad = detayOzet?.aktif_protokol_ad;
      if (!ad) return { deger: "Program yok" };
      const kisaltilmis = ad.length > 24 ? `${ad.slice(0, 24)}…` : ad;
      return { deger: `Aktif tanı: ${kisaltilmis}` };
    }
    case "gelisim": {
      const skor = detayOzet?.son_vas_skoru ?? ozet?.son_vas_skoru;
      const sayi = yukleniyor ? "…" : (detayOzet?.olcum_sayisi ?? 0);
      return { deger: `${sayi} kayıt · VAS ${skor ?? "—"}` };
    }
    case "cari": {
      const bakiye = ozet?.bakiye ?? 0;
      return { deger: bakiye.toLocaleString("tr-TR", { style: "currency", currency: "TRY" }) };
    }
    case "belgeler": {
      if (yukleniyor) return { deger: "Yükleniyor…" };
      return { deger: `${detayOzet?.belge_sayisi ?? 0} dosya` };
    }
    case "iletisim": {
      if (yukleniyor) return { deger: "Yükleniyor…" };
      return { deger: `Son mesaj: ${gorelZaman(detayOzet?.son_iletisim_tarihi ?? null)}` };
    }
  }
}

export function MobilHub({
  musteri,
  ozet,
  detayOzet,
  yukleniyor,
  gorunurSekmeler,
  onKartTikla,
}: {
  musteri: MusteriDetay;
  ozet: MusteriOzet | null;
  detayOzet: MusteriDetayOzet | null | undefined;
  yukleniyor: boolean;
  gorunurSekmeler: { deger: SekmeAnahtari; etiket: string }[];
  onKartTikla: (deger: SekmeAnahtari) => void;
}) {
  const tekKalanKartVar = gorunurSekmeler.length % 2 === 1;

  return (
    <div className="grid grid-cols-2 gap-3">
      {gorunurSekmeler.map((s, i) => {
        const Ikon = IKONLAR[s.deger];
        const { deger, uyari } = ozetDegeri(s.deger, musteri, ozet, detayOzet, yukleniyor);
        const sonKartTek = tekKalanKartVar && i === gorunurSekmeler.length - 1;
        return (
          <button
            key={s.deger}
            type="button"
            onClick={() => onKartTikla(s.deger)}
            className={cn(
              "group flex min-h-28 flex-col items-start gap-2 rounded-2xl border border-white/10 bg-card/70 p-4 text-left backdrop-blur-md transition-all",
              "hover:border-primary/40 hover:bg-card active:scale-95",
              "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              sonKartTek && "col-span-2 mx-auto w-1/2"
            )}
          >
            <div className="flex w-full items-center justify-between">
              <Ikon className="size-6 text-primary" />
              {uyari && <span className="size-2 rounded-full bg-amber-500" aria-label="Eksik bilgi" />}
            </div>
            <span className="text-sm font-medium text-foreground">{s.etiket}</span>
            <span className="text-xs text-muted-foreground">{deger}</span>
          </button>
        );
      })}
    </div>
  );
}
