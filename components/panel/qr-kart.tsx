"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import Link from "next/link";
import { Copy, Download, Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

type QrKartProps = {
  icon: ReactNode;
  baslik: string;
  aciklama: string;
  yol: string;
  dosyaAdi: string;
  goruntuleHref?: string;
  goruntuleEtiket?: string;
  /** Doluysa başlığın yanında bir "Aktif" checkbox'ı gösterilir (QR Kodları yönetim listesi). */
  aktifDurumu?: {
    deger: boolean;
    degistir: (yeni: boolean) => void;
    pending: boolean;
  };
};

export function QrKart({
  icon,
  baslik,
  aciklama,
  yol,
  dosyaAdi,
  goruntuleHref,
  goruntuleEtiket,
  aktifDurumu,
}: QrKartProps) {
  const [kopyalandi, setKopyalandi] = useState(false);

  const { data } = useQuery({
    queryKey: ["qr-kart", yol],
    queryFn: async () => {
      const tamUrl = `${window.location.origin}${yol}`;
      const qrDataUrl = await QRCode.toDataURL(tamUrl, { width: 512, margin: 1 });
      return { url: tamUrl, qrDataUrl };
    },
  });
  const url = data?.url ?? null;
  const qrDataUrl = data?.qrDataUrl ?? null;

  async function baglantiyiKopyala() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setKopyalandi(true);
    setTimeout(() => setKopyalandi(false), 2000);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {icon}
            <CardTitle>{baslik}</CardTitle>
          </div>
          {aktifDurumu && (
            <label className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <input
                type="checkbox"
                checked={aktifDurumu.deger}
                onChange={(e) => aktifDurumu.degistir(e.target.checked)}
                disabled={aktifDurumu.pending}
                className="h-4 w-4 rounded border-input"
              />
              Aktif
            </label>
          )}
        </div>
        <CardDescription>{aciklama}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3">
        <div className="flex size-40 items-center justify-center rounded-lg bg-white p-2">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt={`${baslik} kare kodu`} className="size-full" />
          ) : (
            <div className="size-full animate-pulse rounded bg-muted" />
          )}
        </div>

        {url && (
          <p className="w-full truncate text-center text-xs text-muted-foreground" title={url}>
            {url}
          </p>
        )}

        <div className="flex w-full gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={baglantiyiKopyala}
            disabled={!url}
          >
            {kopyalandi ? <Check /> : <Copy />}
            {kopyalandi ? "Kopyalandı" : "Bağlantıyı Kopyala"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={!qrDataUrl}
            onClick={() => {
              if (!qrDataUrl) return;
              const a = document.createElement("a");
              a.href = qrDataUrl;
              a.download = `${dosyaAdi}.png`;
              a.click();
            }}
          >
            <Download />
            PNG İndir
          </Button>
        </div>

        {goruntuleHref && (
          <Link
            href={goruntuleHref}
            className="flex w-full items-center justify-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
          >
            {goruntuleEtiket ?? "Gelen kayıtları görüntüle"}
            <ArrowRight className="size-3" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
