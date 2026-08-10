"use client";

import { type ReactNode, useState, useTransition } from "react";
import { QrKart } from "./qr-kart";
import type { QrKodTipi } from "@/lib/qr/qr-kod-tanimlari";
import { qrKoduDurumGuncelle } from "@/app/(app)/panel/ayarlar/qr-kodlar/actions";

type QrKartYonetilebilirProps = {
  tip: QrKodTipi;
  icon: ReactNode;
  baslik: string;
  aciklama: string;
  yol: string;
  dosyaAdi: string;
  goruntuleHref?: string;
  goruntuleEtiket?: string;
  baslangicAktif: boolean;
};

/**
 * QR Kodları yönetim listesindeki satır — QrKart'ı sarmalayıp "Aktif"
 * checkbox'ını anında kaydeden bir server action çağrısına bağlar (Kişisel
 * Bilgi Giriş Formu'ndaki onay checkbox'larıyla aynı UX: ayrı bir "Kaydet"
 * butonu yok, işaretlenince direkt kaydediliyor). Optimistic değil — sunucu
 * yanıtı gelene kadar checkbox eski değerinde kalır, hata olursa geri alınır.
 *
 * `icon` burada ReactNode olarak alınıyor (LucideIcon component referansı
 * DEĞİL) — çünkü bu bileşen Server Component'ten prop alıyor, ikon
 * component'ini içeren bir obje/fonksiyon RSC sınırını serialize edilemeden
 * geçemiyor ("Functions cannot be passed directly to Client Components").
 * İkon çağıran Server Component'te (page.tsx) önceden render edilmeli.
 */
export function QrKartYonetilebilir({
  tip,
  icon,
  baslik,
  aciklama,
  yol,
  dosyaAdi,
  goruntuleHref,
  goruntuleEtiket,
  baslangicAktif,
}: QrKartYonetilebilirProps) {
  const [aktif, setAktif] = useState(baslangicAktif);
  const [hata, setHata] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function degistir(yeni: boolean) {
    setHata(null);
    startTransition(async () => {
      const sonuc = await qrKoduDurumGuncelle(tip, yeni);
      if (sonuc?.success) {
        setAktif(yeni);
      } else {
        setHata(sonuc?.message ?? "Kaydedilemedi, lütfen tekrar deneyin.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <QrKart
        icon={icon}
        baslik={baslik}
        aciklama={aciklama}
        yol={yol}
        dosyaAdi={dosyaAdi}
        goruntuleHref={goruntuleHref}
        goruntuleEtiket={goruntuleEtiket}
        aktifDurumu={{ deger: aktif, degistir, pending: isPending }}
      />
      {hata && <p className="text-xs text-destructive">{hata}</p>}
      {!aktif && (
        <p className="text-xs text-muted-foreground">
          Bu QR pasif — okutan kişiye &quot;kullanım dışı&quot; mesajı gösterilir, yeni kayıt/gönderim alınmaz.
        </p>
      )}
    </div>
  );
}
