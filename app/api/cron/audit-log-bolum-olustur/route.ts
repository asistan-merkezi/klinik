import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronYetkiliMi } from "@/lib/cron-yetki";

export const runtime = "nodejs";
export const maxDuration = 60;

type BolumSonucu = { olusturulan: string[]; varsayilan_satir: number };

/**
 * Her ayın 1'i: audit_log'un önümüzdeki 3 ayına ait aylık partition'larını önceden açar
 * (`audit_log_bolum_olustur`, idempotent). Bölüm yoksa satır DEFAULT partition'a düşer ve o ay
 * için bölüm sonradan açılamaz — bu yüzden migration ilk kurulumda 12 ay ileri açar, bu cron
 * pencereyi ileri taşır; bir çalıştırma kaçsa bile marj sürer.
 */
export async function GET(request: Request) {
  if (!cronYetkiliMi(request)) {
    return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("audit_log_bolum_olustur", { p_ileri_ay: 3 });

  if (error) {
    console.error("[cron/audit-log-bolum-olustur] RPC hatası:", error.message);
    return NextResponse.json({ error: "bölüm oluşturulamadı" }, { status: 500 });
  }

  const sonuc = data as BolumSonucu;
  if (sonuc.varsayilan_satir > 0) {
    console.error(
      `[cron/audit-log-bolum-olustur] UYARI: DEFAULT partition'da ${sonuc.varsayilan_satir}+ satır var — bir ayın bölümü zamanında açılmamış.`,
    );
  }

  return NextResponse.json(sonuc);
}
