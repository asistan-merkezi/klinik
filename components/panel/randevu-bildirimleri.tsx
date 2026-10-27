"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Toast } from "@base-ui/react/toast";
import { CalendarClock, PackageOpen, UserCheck, X } from "lucide-react";
import { paketYenilemeGerekliMi } from "@/lib/paket/yenileme-esigi";
import { bildirimBaslangicVerisiGetir, bildirimBilgisiGetir, randevuDurumGetir } from "@/app/(app)/panel/randevular/veri-actions";
import { useCanliOlaylar } from "@/lib/realtime/use-canli-olaylar";
import { formatTime } from "@/lib/datetime";

/**
 * Klinik içi hızlı bildirimler: terapist muayene odasındayken resepsiyonun
 * yaptığı check-in ("Geldi"/"Gecikmeli Geldi") ve erteleme anında panelin
 * herhangi bir ekranında hafif bir toast olarak görünür. Tablet ekranlarında
 * (/panel/tablet/*) hiç çalışmaz — tablet kiosk, salt-okunur ve kendi akışı var.
 *
 * Kime: `terapist` yalnız KENDİ randevularını, `klinik_admin` hepsini görür.
 * `resepsiyon` check-in/erteleme toast'larından bilinçli hariç — eylemi zaten
 * kendisi yapıyor, kendi tıklamasının bildirimi gürültü olurdu (muhasebe de
 * hariç, ilgisi yok). TEK istisna "paket bitmek üzere" toast'ı (2026-09-30):
 * seans terapist tarafından bitirilince, pakette 1-2 hak kalmışsa resepsiyon
 * (ve klinik_admin) hastayı yenilemeye yönlendirebilsin diye `tamamlandi`
 * geçişinde yalnız bu iki role gösterilir (terapiste gösterilmez — satış onun işi değil).
 *
 * Geçiş tespiti: `randevu` REPLICA IDENTITY DEFAULT olduğu için UPDATE olayında
 * `old` yalnız PK taşır — önceki durum payload'dan okunamaz. Bu yüzden bugünün
 * randevularının id→durum haritası istemcide tutulur; toast YALNIZ haritadaki
 * önceki durum yeni durumdan farklıysa atılır (not/oda gibi alakasız bir
 * güncelleme "geldi" satırını yeniden bildirmez). Haritada olmayan randevu
 * (başka günün kaydı) sessizce atlanır. Migration gerektirmez.
 */
const BILDIRIM_DURUMLARI = ["geldi", "gecikmeli_geldi", "ertelendi", "tamamlandi"] as const;
type BildirimDurumu = (typeof BILDIRIM_DURUMLARI)[number];

type RandevuSatiriOlay = {
  id: string;
  durum: string;
  terapist_id: string | null;
};

type ToastVerisi = { tur: BildirimDurumu };

function bildirimDurumuMu(durum: string): durum is BildirimDurumu {
  return (BILDIRIM_DURUMLARI as readonly string[]).includes(durum);
}

function BildirimDinleyici({ kullaniciId, rol }: { kullaniciId: string; rol: string }) {
  const toastYoneticisi = Toast.useToastManager<ToastVerisi>();
  const pathname = usePathname();

  const rolGorur = rol === "terapist" || rol === "klinik_admin" || rol === "resepsiyon";
  const tabletteMi = pathname.startsWith("/panel/tablet");
  const aktif = rolGorur && !tabletteMi;
  const olayYoneticisi = useRef<{ olay: (randevuId: string) => void; senkron: () => void } | null>(null);

  useEffect(() => {
    if (!aktif) return;

    const durumlar = new Map<string, string>();
    let iptalEdildi = false;
    let kendiTerapistId: string | null = null;

    // Bugünün randevularının durum haritasını (ve terapistse kendi terapist.id'sini) yeniden kurar. Bildirim ATMAZ —
    // kesinti sırasında kaçırılan geçişler sessizce yutulur (eski olaylar için "az önce geldi" demek yanıltıcı olurdu).
    async function haritayiYukle() {
      try {
        const v = await bildirimBaslangicVerisiGetir();
        if (iptalEdildi) return;
        durumlar.clear();
        for (const satir of v.durumlar) durumlar.set(satir.id, satir.durum);
        kendiTerapistId = v.kendiTerapistId;
      } catch {
        /* oturum/bağlantı hatası: harita eski kalır */
      }
    }

    async function bildir(randevuId: string, tur: BildirimDurumu) {
      const data = await bildirimBilgisiGetir(randevuId).catch(() => null);
      if (!data || iptalEdildi) return;

      if (tur === "tamamlandi") {
        // Yalnız paketten düşülmüş ve hakkı azalmış seanslar toast üretir.
        const kalan = data.paket_satis?.kalan_adet;
        if (!paketYenilemeGerekliMi(kalan)) return;
        toastYoneticisi.add({
          title: "Paket bitmek üzere",
          description: `${data.hasta?.ad_soyad ?? "Hasta"} · ${data.paket_satis?.paket?.ad ?? "Paket"} · ${kalan} seans kaldı — yenileme önerin`,
          timeout: 15000,
          data: { tur },
        });
        return;
      }

      const parcalar = [data.hasta?.ad_soyad ?? "Hasta", data.oda?.ad, formatTime(data.baslangic)].filter(Boolean);
      toastYoneticisi.add({
        title:
          tur === "ertelendi"
            ? "Randevu ertelendi"
            : tur === "gecikmeli_geldi"
              ? "Hasta gecikmeli geldi"
              : "Hasta geldi",
        description: parcalar.join(" · "),
        timeout: 10000,
        data: { tur },
      });
    }

    // Olay yükünde veri yok ({t,i}): satırın güncel durumu yetkili yoldan çekilir, sonra geçiş tespiti aynı kurallarla yapılır.
    async function olayGeldi(randevuId: string) {
      const yeni: RandevuSatiriOlay | null = await randevuDurumGetir(randevuId).catch(() => null);
      if (iptalEdildi) return;
      if (!yeni) {
        durumlar.delete(randevuId); // silinmiş (ya da görünmeyen) randevu
        return;
      }
      const onceki = durumlar.get(yeni.id);
      durumlar.set(yeni.id, yeni.durum);

      if (onceki === undefined || onceki === yeni.durum) return;
      if (!bildirimDurumuMu(yeni.durum)) return;
      // tamamlandi → yalnız resepsiyon/klinik_admin (paket yenileme); diğer
      // geçişler → terapist/klinik_admin (resepsiyon eylemi kendisi yapıyor).
      if (yeni.durum === "tamamlandi") {
        if (rol !== "resepsiyon" && rol !== "klinik_admin") return;
      } else if (rol === "resepsiyon") {
        return;
      }
      if (rol === "terapist" && (!kendiTerapistId || yeni.terapist_id !== kendiTerapistId)) return;

      void bildir(yeni.id, yeni.durum);
    }

    olayYoneticisi.current = {
      olay: (id) => void olayGeldi(id),
      // Yeniden bağlanmada kesintide kaçan değişiklikleri sessizce içeri al (bildirim atmadan).
      senkron: () => void haritayiYukle(),
    };
    void haritayiYukle();

    return () => {
      iptalEdildi = true;
      olayYoneticisi.current = null;
    };
    // toastYoneticisi kararlı bir referans değil — olay içinde yalnız add() çağrılıyor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktif, kullaniciId, rol]);

  // Canlı olaylar lib/realtime'dan (SSE); yük yalnız {t,i}. Tablet ekranlarında ve izinsiz rollerde bağlanılmaz.
  useCanliOlaylar({
    tablolar: ["randevu"],
    etkin: aktif,
    onOlay: (o) => olayYoneticisi.current?.olay(o.i),
    onSenkron: () => olayYoneticisi.current?.senkron(),
  });

  return null;
}

function BildirimListesi() {
  const { toasts } = Toast.useToastManager<ToastVerisi>();

  return toasts.map((toast) => {
    const Ikon =
      toast.data?.tur === "ertelendi" ? CalendarClock : toast.data?.tur === "tamamlandi" ? PackageOpen : UserCheck;
    return (
      <Toast.Root
        key={toast.id}
        toast={toast}
        className="pointer-events-auto flex w-80 items-start gap-3 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-lg transition-all duration-200 data-[ending-style]:translate-y-2 data-[ending-style]:opacity-0 data-[starting-style]:translate-y-2 data-[starting-style]:opacity-0"
      >
        <span
          className={
            toast.data?.tur === "ertelendi"
              ? "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-800 dark:bg-sky-500/10 dark:text-sky-400"
              : toast.data?.tur === "tamamlandi"
                ? "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-400"
                : "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400"
          }
        >
          <Ikon className="size-4" aria-hidden="true" />
        </span>
        <Toast.Content className="min-w-0 flex-1">
          <Toast.Title className="text-sm font-semibold" />
          <Toast.Description className="mt-0.5 line-clamp-2 text-sm text-muted-foreground" />
        </Toast.Content>
        <Toast.Close
          aria-label="Bildirimi kapat"
          className="-mr-1 -mt-1 flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
        >
          <X className="size-4" aria-hidden="true" />
        </Toast.Close>
      </Toast.Root>
    );
  });
}

export function RandevuBildirimleri({ kullaniciId, rol }: { kullaniciId: string; rol: string }) {
  return (
    <Toast.Provider limit={4}>
      <BildirimDinleyici kullaniciId={kullaniciId} rol={rol} />
      <Toast.Portal>
        <Toast.Viewport className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
          <BildirimListesi />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}
