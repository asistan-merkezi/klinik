import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronYetkiliMi } from "@/lib/cron-yetki";
import { resmiTatilleriGuncelle } from "@/lib/tatil/oneri-uret";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Her ayın 1'i: bu yıl ve gelecek yılın sabit resmi tatillerini kesin tatil olarak yazar,
 * dini bayramları Nager.Date'ten öneri olarak kliniklere düşürür (yönetici Ayarlar > Resmi
 * Tatiller'den onaylar). İdempotent; Nager'a ulaşılamazsa sabit tatiller yine yazılır, öneriler
 * bir sonraki çalıştırmada denenir.
 */
export async function GET(request: Request) {
  if (!cronYetkiliMi(request)) {
    return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  }

  try {
    const sonuc = await resmiTatilleriGuncelle(createAdminClient());
    if (sonuc.nagerHatasi.length > 0) {
      console.error("[cron/resmi-tatil-guncelle] Nager.Date'e ulaşılamadı:", sonuc.nagerHatasi.join("; "));
    }
    return NextResponse.json(sonuc);
  } catch (hata) {
    console.error("[cron/resmi-tatil-guncelle] hata:", hata);
    return NextResponse.json({ error: "güncellenemedi" }, { status: 500 });
  }
}
