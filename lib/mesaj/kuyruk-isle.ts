import type { SupabaseClient } from "@supabase/supabase-js";
import { saglayiciSec } from "./saglayicilar";
import type { MesajKanal, MesajKuyrukDurum } from "@/types/mesajlasma";

// Geçici hatada bekleyecek süre: 1. deneme sonrası 5dk, 2. sonrası 30dk,
// 3. (son) deneme sonrası 2sa — 3. deneme de başarısız olursa durum='hata'.
const GERI_CEKILME_DAKIKA = [5, 30, 120];
const MAKS_DENEME = GERI_CEKILME_DAKIKA.length;

type KuyrukSatiri = {
  id: string;
  klinik_id: string;
  kanal: MesajKanal;
  alici_adres: string;
  gonderilecek_metin: string;
  deneme_sayisi: number;
};

export type KuyrukIslemSonucu = { durum: MesajKuyrukDurum; hataMesaji?: string };

/**
 * mesaj_kuyrugu'nda TEK bir satırı işler: kredi düşer, sağlayıcı adapter'ını
 * çağırır, sonuca göre durumu günceller. Hem cron worker'ın (/api/cron/
 * mesaj-kuyruk-isle, 5dk'da bir) hem "Test Gönder"in TEK ortak yolu.
 *
 * ÖNEMLİ: `admin` SADECE service role client olmalı (createAdminClient()) —
 * bu fonksiyon RLS'e güvenmiyor, yetki kontrolünü çağıran taraf kendisi, bu
 * fonksiyona gelmeden ÖNCE yapar (cron route CRON_SECRET header'ıyla, Test
 * Gönder server action'ı klinik_admin oturum kontrolüyle).
 */
export async function kuyrukSatiriniIsle(admin: SupabaseClient, satirId: string): Promise<KuyrukIslemSonucu> {
  // 1) Satırı ATOMİK olarak claim et. Postgres'te UPDATE...WHERE satır
  // düzeyinde atomiktir — sadece hâlâ 'beklemede' olan satır 'gonderiliyor'a
  // geçer, eşzamanlı iki worker/istek aynı satırı iki kez işleyemez.
  const { data: satir, error: claimHata } = await admin
    .from("mesaj_kuyrugu")
    .update({ durum: "gonderiliyor" })
    .eq("id", satirId)
    .eq("durum", "beklemede")
    .select("id, klinik_id, kanal, alici_adres, gonderilecek_metin, deneme_sayisi")
    .maybeSingle<KuyrukSatiri>();

  if (claimHata || !satir) {
    return { durum: "beklemede", hataMesaji: "satır zaten işleniyor veya beklemede değil" };
  }

  // 2) Kredi düş — gönderim denemesinden hemen önce, kuyruğa yazarken değil.
  const { data: dusuldu, error: dusumHata } = await admin.rpc("mesaj_kredi_dus", {
    p_klinik_id: satir.klinik_id,
    p_kanal: satir.kanal,
    p_kuyruk_id: satir.id,
  });

  if (dusumHata) {
    console.error("[mesaj] kredi düşüm RPC hatası:", dusumHata.message);
  }

  if (!dusuldu) {
    await admin.from("mesaj_kuyrugu").update({ durum: "iptal", hata_mesaji: "kredi yetersiz" }).eq("id", satir.id);
    return { durum: "iptal", hataMesaji: "kredi yetersiz" };
  }

  // 3) Sağlayıcıyı çağır.
  let sonuc;
  try {
    const saglayici = saglayiciSec(satir.kanal);
    sonuc = await saglayici.gonder({ aliciAdres: satir.alici_adres, metin: satir.gonderilecek_metin });
  } catch (e) {
    sonuc = { basarili: false as const, hata: e instanceof Error ? e.message : "bilinmeyen hata", kalici: false };
  }

  if (sonuc.basarili) {
    await admin
      .from("mesaj_kuyrugu")
      .update({
        durum: "gonderildi",
        gonderim_zamani: new Date().toISOString(),
        saglayici_mesaj_id: sonuc.saglayiciMesajId ?? null,
      })
      .eq("id", satir.id);
    return { durum: "gonderildi" };
  }

  // 4) Başarısız — kredi iade edilir.
  const { error: iadeHata } = await admin.rpc("mesaj_kredi_iade", {
    p_klinik_id: satir.klinik_id,
    p_kanal: satir.kanal,
    p_kuyruk_id: satir.id,
  });
  if (iadeHata) {
    console.error("[mesaj] kredi iade RPC hatası:", iadeHata.message);
  }

  if (sonuc.kalici) {
    await admin.from("mesaj_kuyrugu").update({ durum: "hata", hata_mesaji: sonuc.hata }).eq("id", satir.id);
    return { durum: "hata", hataMesaji: sonuc.hata };
  }

  const yeniDeneme = satir.deneme_sayisi + 1;
  if (yeniDeneme >= MAKS_DENEME) {
    await admin
      .from("mesaj_kuyrugu")
      .update({ durum: "hata", hata_mesaji: sonuc.hata, deneme_sayisi: yeniDeneme })
      .eq("id", satir.id);
    return { durum: "hata", hataMesaji: sonuc.hata };
  }

  const bekleyecekDk = GERI_CEKILME_DAKIKA[yeniDeneme - 1];
  const yeniZaman = new Date(Date.now() + bekleyecekDk * 60_000).toISOString();
  await admin
    .from("mesaj_kuyrugu")
    .update({ durum: "beklemede", hata_mesaji: sonuc.hata, deneme_sayisi: yeniDeneme, planlanan_zaman: yeniZaman })
    .eq("id", satir.id);
  return { durum: "beklemede", hataMesaji: sonuc.hata };
}
