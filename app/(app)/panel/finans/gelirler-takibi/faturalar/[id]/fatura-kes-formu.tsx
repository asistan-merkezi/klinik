"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { finansBorcDuzenle } from "../actions";

/**
 * İskonto/açıklama düzenlemesi artık bu sayfada yok (kullanıcı kararı,
 * 2026-09-28) — burası salt "Fatura Kes" onayı. Mevcut iskonto tutarı
 * değiştirilmeden aynen gönderilir, aciklama boş bırakılır (RPC boş string'i
 * "mevcut açıklamayı koru" olarak yorumluyor, bkz. hasta_bakiye_hareket_borc_duzenle).
 */
export function FaturaKesFormu({
  hareketId,
  mevcutIskonto,
  devreDisi,
}: {
  hareketId: string;
  mevcutIskonto: number;
  devreDisi: boolean;
}) {
  const router = useRouter();
  const duzenleAction = finansBorcDuzenle.bind(null, hareketId);
  const [durum, formAction, isPending] = useActionState(duzenleAction, null);

  useEffect(() => {
    if (durum?.success) {
      router.push("/panel/finans/gelirler-takibi/faturalar");
    }
  }, [durum, router]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="iskonto_tutari" value={mevcutIskonto} />
      <input type="hidden" name="faturali" value="on" />
      <input type="hidden" name="aciklama" value="" />

      {durum && !durum.success && (
        <p role="alert" className="text-sm text-destructive">
          {durum.message}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending || devreDisi}>
          {isPending ? "Kesiliyor..." : "Fatura Kes"}
        </Button>
        <Link href="/panel/finans/gelirler-takibi/faturalar" className={buttonVariants({ variant: "outline" })}>
          Vazgeç
        </Link>
      </div>
    </form>
  );
}
