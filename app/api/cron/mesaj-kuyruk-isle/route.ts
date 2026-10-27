import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronYetkiliMi } from "@/lib/cron-yetki";
import { kuyrukSatiriniIsle } from "@/lib/mesaj/kuyruk-isle";
import { randevuHatirlatmalariniTara } from "@/lib/mesaj/randevu-hatirlatma-tarama";

export const runtime = "nodejs";
// Bir batch'te 25 satır, her biri bir ağ çağrısı (adapter) + birkaç DB
// round-trip içerebilir — 60s Hobby planı üst sınırı, güvenli pay.
export const maxDuration = 60;

const BATCH_BOYUTU = 25;
// Her satır en fazla ~15 sn (merkez isteği zaman aşımı) sürebilir; 25 satır 60 sn sınırını aşabilir.
// Süre bu eşiği geçince yeni satır alınmaz — kalanlar bir sonraki çalıştırmada işlenir.
const SURE_BUTCESI_MS = 40_000;
/** Bu süreden uzun 'gonderiliyor'da kalan satır, çöken/zaman aşımına uğrayan bir işlemden kalmıştır. */
const TAKILI_SATIR_DK = 10;

/**
 * mesaj_kuyrugu'nda durum='beklemede' AND planlanan_zaman<=now() olan
 * satırları işler (5 dakikada bir, vercel.json'daki cron tanımı). Vercel,
 * CRON_SECRET ortam değişkeni ayarlıysa bu değeri `Authorization: Bearer`
 * header'ıyla otomatik gönderir — burada aynı değerle karşılaştırılıyor,
 * eşleşmezse istek reddedilir (dışarıdan tetiklenip kredi tüketilmesin).
 */
export async function GET(request: Request) {
  if (!cronYetkiliMi(request)) {
    return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  }

  const baslangic = Date.now();
  const admin = createAdminClient();

  // Takılı kalan satırları kurtar (bkz. migration 20261012200000). Merkezdeki idempotency anahtarı
  // aynı mesajın iki kez gönderilmesini engeller.
  const esik = new Date(Date.now() - TAKILI_SATIR_DK * 60_000).toISOString();
  const { error: kurtarmaHata } = await admin
    .from("mesaj_kuyrugu")
    .update({ durum: "beklemede", hata_mesaji: "işlem yarıda kaldı, yeniden denenecek" })
    .eq("durum", "gonderiliyor")
    .or(`isleme_alinma_zamani.is.null,isleme_alinma_zamani.lt.${esik}`);
  if (kurtarmaHata) {
    console.error("[cron/mesaj-kuyruk-isle] takılı satırlar kurtarılamadı:", kurtarmaHata.message);
  }

  // Zamanlanmış randevu hatırlatmaları (1 gün / 2 saat) önce kuyruğa yazılır; aşağıda aynı çalıştırmada işlenir.
  // Hata kuyruğu işlemeyi engellemesin diye ayrı try/catch.
  let hatirlatmalar: Awaited<ReturnType<typeof randevuHatirlatmalariniTara>> = [];
  try {
    hatirlatmalar = await randevuHatirlatmalariniTara(admin);
  } catch (hata) {
    console.error("[cron/mesaj-kuyruk-isle] randevu hatırlatma taraması başarısız:", hata);
  }

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
    if (Date.now() - baslangic > SURE_BUTCESI_MS) break;
    const sonuc = await kuyrukSatiriniIsle(admin, satir.id);
    sonuclar.push({ id: satir.id, durum: sonuc.durum });
  }

  return NextResponse.json({ islenen: sonuclar.length, sonuclar, hatirlatmalar });
}
