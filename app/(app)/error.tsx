"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Panel/portal/QR sayfalarında yakalanmayan hata sınırı. Sayfalar eksik veriyle
 * yanlış tutar göstermek yerine hata fırlatır (bkz. lib/supabase/sayfali-okuma.ts);
 * bu bileşen olmadan kullanıcı Next.js'in İngilizce boş hata ekranını görürdü.
 */
export default function UygulamaHatasi({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center bg-background p-4 sm:p-8">
      <EmptyState
        icon={TriangleAlert}
        title="Sayfa yüklenirken bir sorun oluştu"
        description={`Bağlantınızı kontrol edip tekrar deneyin. Sorun sürerse bu kodu destek ekibine iletin: ${error.digest ?? "—"}`}
        className="w-full max-w-md"
        action={
          <div className="flex gap-2">
            <Button type="button" onClick={reset}>
              Tekrar Dene
            </Button>
            <Button variant="outline" nativeButton={false} render={<Link href="/panel">Ana Sayfa</Link>} />
          </div>
        }
      />
    </div>
  );
}
