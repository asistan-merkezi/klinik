import { createAdminClient } from "@/lib/supabase/admin";
import { anlikMesajTetikle } from "./anlik-tetikle";
import {
  hosgeldinAnahtari,
  odemeAlindiAnahtari,
  paketSatisOzetiAnahtari,
  paketSatisTazeMi,
  tutarMetni,
} from "./hasta-mesaji-kurali";

type HastaSatiri = {
  id: string;
  klinik_id: string;
  ad_soyad: string;
  telefon: string | null;
  eposta: string | null;
  whatsapp_izin_durumu: boolean;
};

const HASTA_SELECT = "id, klinik_id, ad_soyad, telefon, eposta, whatsapp_izin_durumu";

async function hastaVeKlinikAdi(hastaId: string) {
  const admin = createAdminClient();
  const { data: hasta } = await admin.from("hasta").select(HASTA_SELECT).eq("id", hastaId).maybeSingle<HastaSatiri>();
  if (!hasta) return null;
  const { data: klinik } = await admin.from("klinik").select("ad").eq("id", hasta.klinik_id).maybeSingle();
  return { admin, hasta, klinikAdi: (klinik?.ad as string | undefined) ?? "" };
}

/**
 * Resepsiyonun oluşturduğu yeni hastaya hoş geldin mesajı. QR self-servis kaydına BİLİNÇLİ bağlı değil:
 * form anonim ve telefon doğrulanmıyor — başkasının numarası yazılarak klinik kredisiyle SMS attırılabilirdi.
 * Best-effort: hata asla kayıt işlemini bozmaz.
 */
export async function hastaHosgeldinTetikle(hastaId: string): Promise<void> {
  try {
    const bag = await hastaVeKlinikAdi(hastaId);
    if (!bag) return;
    const { admin, hasta, klinikAdi } = bag;
    await anlikMesajTetikle(admin, {
      klinikId: hasta.klinik_id,
      tetikleyiciKodu: "hasta_kayit_hosgeldin",
      aliciTipi: "hasta",
      aliciId: hasta.id,
      adres: { telefon: hasta.telefon, eposta: hasta.eposta, whatsappIzni: hasta.whatsapp_izin_durumu },
      degiskenler: { hasta_adi: hasta.ad_soyad, klinik_adi: klinikAdi },
      idempotencyTemeli: hosgeldinAnahtari(hasta.id),
    });
  } catch (hata) {
    console.error(`[mesaj] hoş geldin mesajı yazılamadı (hasta ${hastaId}):`, hata);
  }
}

/**
 * Paket satışı sonrası özet mesajı: her satılan paket için, hastanın o paketten EN SON (son 2 dk içinde)
 * oluşan satışı okunur — gerçek kalan_adet mesajda seans sayısı olur. Satış satırı id'si idempotency
 * anahtarıdır. Best-effort.
 */
export async function paketSatisOzetiMesajiTetikle(hastaId: string, paketIdler: string[]): Promise<void> {
  try {
    const bag = await hastaVeKlinikAdi(hastaId);
    if (!bag) return;
    const { admin, hasta, klinikAdi } = bag;

    for (const paketId of [...new Set(paketIdler)]) {
      const { data: satis } = await admin
        .from("paket_satis")
        .select("id, kalan_adet, created_at, paket(ad)")
        .eq("hasta_id", hastaId)
        .eq("paket_id", paketId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string; kalan_adet: number; created_at: string; paket: { ad: string } | { ad: string }[] | null }>();
      if (!satis || !paketSatisTazeMi(satis.created_at)) continue;

      const paket = Array.isArray(satis.paket) ? satis.paket[0] : satis.paket;
      await anlikMesajTetikle(admin, {
        klinikId: hasta.klinik_id,
        tetikleyiciKodu: "hasta_paket_satis_ozet",
        aliciTipi: "hasta",
        aliciId: hasta.id,
        adres: { telefon: hasta.telefon, eposta: hasta.eposta, whatsappIzni: hasta.whatsapp_izin_durumu },
        degiskenler: {
          hasta_adi: hasta.ad_soyad,
          paket_adi: paket?.ad ?? "Paket",
          seans_sayisi: String(satis.kalan_adet),
          klinik_adi: klinikAdi,
        },
        idempotencyTemeli: paketSatisOzetiAnahtari(satis.id),
      });
    }
  } catch (hata) {
    console.error(`[mesaj] paket satış özeti yazılamadı (hasta ${hastaId}):`, hata);
  }
}

/** Hastadan ödeme alındığında (iade değil) teşekkür/makbuz mesajı. Best-effort. */
export async function odemeAlindiMesajiTetikle(
  hastaId: string,
  tutar: number,
  kaynak: { hareketId: string } | { randevuId: string }
): Promise<void> {
  try {
    const bag = await hastaVeKlinikAdi(hastaId);
    if (!bag) return;
    const { admin, hasta, klinikAdi } = bag;
    await anlikMesajTetikle(admin, {
      klinikId: hasta.klinik_id,
      tetikleyiciKodu: "muhasebe_odeme_alindi",
      aliciTipi: "hasta",
      aliciId: hasta.id,
      adres: { telefon: hasta.telefon, eposta: hasta.eposta, whatsappIzni: hasta.whatsapp_izin_durumu },
      degiskenler: { hasta_adi: hasta.ad_soyad, tutar: tutarMetni(tutar), klinik_adi: klinikAdi },
      idempotencyTemeli: odemeAlindiAnahtari(kaynak),
    });
  } catch (hata) {
    console.error(`[mesaj] ödeme alındı mesajı yazılamadı (hasta ${hastaId}):`, hata);
  }
}
