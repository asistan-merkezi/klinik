import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Hastalar liste sayfası, Ana Ekran ve günlük çizelgenin (CanliCizelge)
 * başlığında paylaşılan "Bildirimler" butonu — bekleyen/görülmemiş öğe varsa
 * (bildirim-sayisi.ts) kırmızıya dönüp sayı gösterir, yoksa nötr gri kalır.
 */
export function BildirimButonu({
  sayisi,
  size = "default",
}: {
  sayisi: number;
  size?: "default" | "sm";
}) {
  return (
    <Button
      variant={sayisi > 0 ? "destructive" : "outline"}
      size={size}
      nativeButton={false}
      render={
        <Link href="/panel/hastalar/bildirimler">
          <Bell />
          Bildirimler
          {sayisi > 0 && (
            <span className="ml-1 inline-flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-xs font-semibold text-white">
              {sayisi}
            </span>
          )}
        </Link>
      }
    />
  );
}
