"use client";

import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";

/**
 * Oda tableti salt-okunur/kiosk kalıyor (bilinçli — PIN'siz, bkz. CLAUDE.md);
 * bu bileşen sadece GÖRÜNTÜLEME, tablete hiçbir yazma aksiyonu eklemiyor.
 * Seans "tamamlandi" olunca (Randevu Detay Paneli veya Hasta Detay'daki
 * "Seansı Bitir"den — ikisi de aynı server action'a iniyor) otomatik belirir,
 * bir sonraki hasta odaya check-in olunca (mevcut dolduğunda) otomatik kaybolur
 * (bkz. tablet-ekrani.tsx'teki sonTamamlanan hesaplaması — ek kod gerekmiyor).
 */
export function SeansSonuAnketQr({ randevuId }: { randevuId: string }) {
  const { data: qrDataUrl } = useQuery({
    queryKey: ["seans-sonu-anket-qr", randevuId],
    queryFn: async () => {
      const url = `${window.location.origin}/anket/seans/${randevuId}`;
      return QRCode.toDataURL(url, { width: 320, margin: 1 });
    },
  });

  return (
    <div className="flex flex-col items-center gap-4">
      <span className="text-2xl font-medium tracking-tight md:text-3xl">Seansınız Tamamlandı</span>
      <span className="text-base text-foreground/80">Değerlendirmek için QR kodu telefonunuzla okutun</span>
      <div className="flex size-48 items-center justify-center rounded-lg bg-white p-2">
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrDataUrl} alt="Seans değerlendirme kare kodu" className="size-full" />
        ) : (
          <div className="size-full animate-pulse rounded bg-muted" />
        )}
      </div>
    </div>
  );
}
