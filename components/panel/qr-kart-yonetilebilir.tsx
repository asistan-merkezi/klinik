"use client";

import { useState, useTransition } from "react";
import { QrKart } from "./qr-kart";
import type { QrKodTanimi } from "@/lib/qr/qr-kod-tanimlari";
import { qrKoduDurumGuncelle } from "@/app/(app)/panel/ayarlar/qr-kodlar/actions";

/**
 * QR Kodları yönetim listesindeki satır — QrKart'ı sarmalayıp "Aktif"
 * checkbox'ını anında kaydeden bir server action çağrısına bağlar (Kişisel
 * Bilgi Giriş Formu'ndaki onay checkbox'larıyla aynı UX: ayrı bir "Kaydet"
 * butonu yok, işaretlenince direkt kaydediliyor). Optimistic değil — sunucu
 * yanıtı gelene kadar checkbox eski değerinde kalır, hata olursa geri alınır.
 */
export function QrKartYonetilebilir({ tanim, klinikId, baslangicAktif }: { tanim: QrKodTanimi; klinikId: string; baslangicAktif: boolean }) {
  const [aktif, setAktif] = useState(baslangicAktif);
  const [hata, setHata] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const Icon = tanim.icon;

  function degistir(yeni: boolean) {
    setHata(null);
    startTransition(async () => {
      const sonuc = await qrKoduDurumGuncelle(tanim.tip, yeni);
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
        icon={<Icon className="size-5 text-primary" aria-hidden />}
        baslik={tanim.baslik}
        aciklama={tanim.aciklama}
        yol={tanim.yol(klinikId)}
        dosyaAdi={tanim.dosyaAdi}
        goruntuleHref={tanim.goruntuleHref}
        goruntuleEtiket={tanim.goruntuleEtiket}
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
