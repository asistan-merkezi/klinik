import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { merkezdenBakiyeCek } from "@/lib/mesaj/merkez-client";
import type { MesajKanal } from "@/types/mesajlasma";

export const runtime = "nodejs";
export const maxDuration = 60;

type KrediSatiri = { klinik_id: string; kanal: MesajKanal; bakiye: number; merkez_bakiye_versiyonu: number };

/**
 * Saatte bir: mevcut mesaj_kredileri satırlarının HER BİRİ için merkezden
 * güncel bakiyeyi çekip mesaj_kredi_senkronla ile yazar (versiyon guard'ı
 * RPC'nin içinde — bu route kendi başına eski bir yanıtla yeni bir bakiyeyi
 * asla ezemez). Ağ hatası nedeniyle bir gönderim yanıtının kaçırdığı bakiye
 * güncellemesi burada düzelir. Yerel/merkez bakiyesi arasında fark
 * bulunursa audit_log'a yazılır (eylem='mesaj_kredi_senkron_farki').
 */
export async function GET(request: Request) {
  const yetkiBasligi = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || yetkiBasligi !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: satirlar, error } = await admin
    .from("mesaj_kredileri")
    .select("klinik_id, kanal, bakiye, merkez_bakiye_versiyonu")
    .returns<KrediSatiri[]>();

  if (error) {
    console.error("[cron/kredi-senkron] satırlar çekilemedi:", error.message);
    return NextResponse.json({ error: "satırlar çekilemedi" }, { status: 500 });
  }

  let senkronlanan = 0;
  let farkli = 0;
  let ulasilamayan = 0;

  for (const satir of satirlar ?? []) {
    const merkezSonuc = await merkezdenBakiyeCek(satir.klinik_id, satir.kanal);

    if (!merkezSonuc.ulasildi) {
      ulasilamayan++;
      continue;
    }

    if (merkezSonuc.bakiye !== satir.bakiye) {
      farkli++;
      await admin.from("audit_log").insert({
        klinik_id: satir.klinik_id,
        kullanici_id: null,
        eylem: "mesaj_kredi_senkron_farki",
        hedef_tablo: "mesaj_kredileri",
        hedef_id: null,
        detay: {
          kanal: satir.kanal,
          yerel_bakiye: satir.bakiye,
          merkez_bakiye: merkezSonuc.bakiye,
          yerel_versiyon: satir.merkez_bakiye_versiyonu,
          merkez_versiyon: merkezSonuc.bakiyeVersiyonu,
        },
      });
    }

    const { error: senkronHata } = await admin.rpc("mesaj_kredi_senkronla", {
      p_klinik_id: satir.klinik_id,
      p_kanal: satir.kanal,
      p_bakiye: merkezSonuc.bakiye,
      p_versiyon: merkezSonuc.bakiyeVersiyonu,
    });
    if (senkronHata) {
      console.error("[cron/kredi-senkron] senkron RPC hatası:", senkronHata.message);
      continue;
    }
    senkronlanan++;
  }

  return NextResponse.json({
    toplam: satirlar?.length ?? 0,
    senkronlanan,
    farkli,
    ulasilamayan,
  });
}
