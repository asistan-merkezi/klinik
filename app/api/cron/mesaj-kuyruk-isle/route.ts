import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { kuyrukSatiriniIsle } from "@/lib/mesaj/kuyruk-isle";

export const runtime = "nodejs";
// Bir batch'te 25 satır, her biri bir ağ çağrısı (adapter) + birkaç DB
// round-trip içerebilir — 60s Hobby planı üst sınırı, güvenli pay.
export const maxDuration = 60;

const BATCH_BOYUTU = 25;

/**
 * mesaj_kuyrugu'nda durum='beklemede' AND planlanan_zaman<=now() olan
 * satırları işler (5 dakikada bir, vercel.json'daki cron tanımı). Vercel,
 * CRON_SECRET ortam değişkeni ayarlıysa bu değeri `Authorization: Bearer`
 * header'ıyla otomatik gönderir — burada aynı değerle karşılaştırılıyor,
 * eşleşmezse istek reddedilir (dışarıdan tetiklenip kredi tüketilmesin).
 */
export async function GET(request: Request) {
  const yetkiBasligi = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || yetkiBasligi !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: satirlar, error } = await admin
    .from("mesaj_kuyrugu")
    .select("id")
    .eq("durum", "beklemede")
    .lte("planlanan_zaman", new Date().toISOString())
    .order("planlanan_zaman", { ascending: true })
    .limit(BATCH_BOYUTU);

  if (error) {
    console.error("[cron/mesaj-kuyruk-isle] satırlar çekilemedi:", error.message);
    return NextResponse.json({ error: "satırlar çekilemedi" }, { status: 500 });
  }

  const sonuclar: { id: string; durum: string }[] = [];
  for (const satir of satirlar ?? []) {
    const sonuc = await kuyrukSatiriniIsle(admin, satir.id);
    sonuclar.push({ id: satir.id, durum: sonuc.durum });
  }

  return NextResponse.json({ islenen: sonuclar.length, sonuclar });
}
