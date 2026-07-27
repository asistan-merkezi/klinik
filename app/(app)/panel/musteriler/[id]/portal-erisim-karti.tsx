"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { portalErisimiAc, portalSifreSifirla, portalErisimDurumDegistir } from "./actions";

type Durum = { var: boolean; aktif: boolean };
type Sonuc = { success: boolean; message: string; geciciSifre?: string } | null;

export function PortalErisimKarti({ musteriId, durum }: { musteriId: string; durum: Durum }) {
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
        <span>
          Durum:{" "}
          {!durum.var ? (
            <span className="text-muted-foreground">Erişim yok</span>
          ) : durum.aktif ? (
            <span className="text-emerald-600 dark:text-emerald-400">Aktif</span>
          ) : (
            <span className="text-destructive">Kapalı</span>
          )}
        </span>
        <div className="flex gap-2">
          {!durum.var && (
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() => calistir(() => portalErisimiAc(musteriId))}
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
                onClick={() => calistir(() => portalSifreSifirla(musteriId))}
              >
                Şifreyi Sıfırla
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => calistir(() => portalErisimDurumDegistir(musteriId, false))}
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
              onClick={() => calistir(() => portalErisimDurumDegistir(musteriId, true))}
            >
              Erişimi Aç
            </Button>
          )}
        </div>
      </div>

      {mesaj && (
        <p role="alert" className={mesaj.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>
          {mesaj.message}
          {mesaj.geciciSifre && (
            <>
              {" "}
              Geçici şifre: <span className="font-mono font-semibold">{mesaj.geciciSifre}</span> — müşteriye iletin,
              bir daha gösterilmeyecek.
            </>
          )}
        </p>
      )}

      {durum.var && (
        <p className="text-xs text-muted-foreground">
          Müşteri <span className="font-mono">/portal/giris</span> adresinden telefon numarası + şifreyle giriş yapar.
        </p>
      )}
    </div>
  );
}
