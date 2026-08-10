"use client";

import { useState, useTransition } from "react";
import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { QrKart } from "@/components/panel/qr-kart";
import { whatsappLinkOlustur } from "@/lib/utils";
import { portalErisimiAc, portalSifreSifirla, portalErisimDurumDegistir } from "./actions";

type Durum = { var: boolean; aktif: boolean };
type Sonuc = { success: boolean; message: string; geciciSifre?: string } | null;

export function PortalErisimKarti({
  hastaId,
  telefon,
  durum,
}: {
  hastaId: string;
  telefon: string;
  durum: Durum;
}) {
  const [pending, startTransition] = useTransition();
  const [mesaj, setMesaj] = useState<Sonuc>(null);

  const calistir = (aksiyon: () => Promise<Sonuc>) => {
    startTransition(async () => {
      const sonuc = await aksiyon();
      setMesaj(sonuc);
    });
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          Durum:
          {!durum.var ? (
            <StatusBadge tone="slate">Erişim yok</StatusBadge>
          ) : durum.aktif ? (
            <StatusBadge tone="emerald">Aktif</StatusBadge>
          ) : (
            <StatusBadge tone="rose">Kapalı</StatusBadge>
          )}
        </span>
        <div className="flex gap-2">
          {!durum.var && (
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() => calistir(() => portalErisimiAc(hastaId))}
            >
              Portal Erişimi Aç
            </Button>
          )}
          {durum.var && durum.aktif && (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => calistir(() => portalSifreSifirla(hastaId))}
              >
                Şifreyi Sıfırla
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => calistir(() => portalErisimDurumDegistir(hastaId, false))}
              >
                Erişimi Kapat
              </Button>
            </>
          )}
          {durum.var && !durum.aktif && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => calistir(() => portalErisimDurumDegistir(hastaId, true))}
            >
              Erişimi Aç
            </Button>
          )}
        </div>
      </div>

      {mesaj && (
        <div className="flex flex-col gap-2">
          <p role="alert" className={mesaj.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>
            {mesaj.message}
            {mesaj.geciciSifre && (
              <>
                {" "}
                Geçici şifre: <span className="font-mono font-semibold">{mesaj.geciciSifre}</span> — hastaya
                iletin, bir daha gösterilmeyecek.
              </>
            )}
          </p>
          {mesaj.geciciSifre && (
            <Button
              size="sm"
              variant="outline"
              className="w-fit"
              nativeButton={false}
              render={
                <a
                  href={whatsappLinkOlustur(
                    telefon,
                    `Merhaba, Hasta Portalı geçici şifreniz: ${mesaj.geciciSifre}. Telefon numaranız ve bu şifreyle giriş yapabilirsiniz.`
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp&apos;tan Gönder
                </a>
              }
            />
          )}
        </div>
      )}

      {durum.var && (
        <p className="text-xs text-muted-foreground">
          Hasta <span className="font-mono">/portal/giris</span> adresinden telefon numarası + şifreyle giriş yapar.
        </p>
      )}

      {durum.var && durum.aktif && (
        <div className="max-w-xs">
          <QrKart
            icon={<QrCode className="size-5 text-primary" aria-hidden />}
            baslik="Portal Giriş QR'ı"
            aciklama="Hasta bu kodu kendi telefonuyla okutunca giriş ekranına gider, telefon numarası önceden dolu gelir (şifreyi yine kendisi girer). Basılı kart olarak verilebilir veya WhatsApp'tan gönderilebilir."
            yol={`/portal/giris?telefon=${encodeURIComponent(telefon)}`}
            dosyaAdi="portal-giris-qr"
          />
        </div>
      )}
    </div>
  );
}
