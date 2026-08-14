import type { SupabaseClient } from "@supabase/supabase-js";
import { merkezeGonder } from "./merkez-client";
import { hataDegerlendir } from "./hata-kodlari";
import type { MesajKanal, MesajKuyrukDurum } from "@/types/mesajlasma";

// Merkeze hiç ulaşılamadığında (ağ hatası, yapılandırılmamış) geçici hata
// backoff'u: 1. deneme sonrası 5dk, 2. sonrası 30dk, 3. (son) deneme sonrası
// 2sa — 3. deneme de başarısız olursa durum='hata'.
const GERI_CEKILME_DAKIKA = [5, 30, 120];
const MAKS_DENEME = GERI_CEKILME_DAKIKA.length;

type KuyrukSatiri = {
  id: string;
  klinik_id: string;
  kanal: MesajKanal;
  alici_adres: string;
  gonderilecek_metin: string;
  tetikleyici_kodu: string;
  test_mi: boolean;
  deneme_sayisi: number;
  idempotency_anahtari: string;
};

export type KuyrukIslemSonucu = { durum: MesajKuyrukDurum; hataMesaji?: string };

async function bakiyeyiSenkronla(admin: SupabaseClient, klinikId: string, kanal: MesajKanal, bakiye: number, versiyon: number) {
  const { error } = await admin.rpc("mesaj_kredi_senkronla", {
    p_klinik_id: klinikId,
    p_kanal: kanal,
    p_bakiye: bakiye,
    p_versiyon: versiyon,
  });
  if (error) {
    console.error("[mesaj] mesaj_kredi_senkronla hatası:", error.message);
  }
}

/**
 * mesaj_kuyrugu'nda TEK bir satırı işler: merkeze (Asistan Merkezi) /api/gonder
 * çağrısı yapar, yanıta göre durumu günceller ve merkezden dönen kalanBakiye/
 * bakiyeVersiyonu'nu yerel mesaj_kredileri'ne SENKRONLAR (hiçbir zaman yerelde
 * hesaplamaz — bkz. mesaj_kredi_senkronla'nın versiyon guard'ı). Hem cron
 * worker'ın (/api/cron/mesaj-kuyruk-isle, 5dk'da bir) hem Test Gönder'in TEK
 * ortak yolu.
 *
 * ÖNEMLİ: `admin` SADECE service role client olmalı (createAdminClient()) —
 * bu fonksiyon RLS'e güvenmiyor, yetki kontrolünü çağıran taraf (cron route
 * CRON_SECRET ile, Test Gönder server action'ı klinik_admin oturum
 * kontrolüyle) kendisi, bu fonksiyona gelmeden ÖNCE yapar.
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
    .select("id, klinik_id, kanal, alici_adres, gonderilecek_metin, tetikleyici_kodu, test_mi, deneme_sayisi, idempotency_anahtari")
    .maybeSingle<KuyrukSatiri>();

  if (claimHata || !satir) {
    return { durum: "beklemede", hataMesaji: "satır zaten işleniyor veya beklemede değil" };
  }

  // 2) Merkeze gönder — kredi kontrolü/düşümü/gönderim merkezin sorumluluğu.
  const sonuc = await merkezeGonder({
    klinikId: satir.klinik_id,
    kanal: satir.kanal,
    aliciAdres: satir.alici_adres,
    metin: satir.gonderilecek_metin,
    idempotencyKey: satir.idempotency_anahtari,
    testMi: satir.test_mi,
    tetikleyiciKodu: satir.tetikleyici_kodu,
  });

  if (!sonuc.ulasildi) {
    // Merkeze hiç ulaşılamadı — bakiye bilgisi YOK, senkronlanmaz. Ağ
    // hatası her zaman geçici sayılır.
    return await geciciHataIsle(admin, satir, sonuc.hata);
  }

  // Merkez yanıt verdi (başarılı/başarısız fark etmez) — kalanBakiye her
  // zaman güvenilir, senkronla.
  await bakiyeyiSenkronla(admin, satir.klinik_id, satir.kanal, sonuc.kalanBakiye, sonuc.bakiyeVersiyonu);

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

  const { kalici, kaliciDurum } = hataDegerlendir(sonuc.hata);

  if (kalici) {
    await admin.from("mesaj_kuyrugu").update({ durum: kaliciDurum, hata_mesaji: sonuc.hata }).eq("id", satir.id);
    return { durum: kaliciDurum, hataMesaji: sonuc.hata };
  }

  return await geciciHataIsle(admin, satir, sonuc.hata);
}

async function geciciHataIsle(admin: SupabaseClient, satir: KuyrukSatiri, hataMesaji: string): Promise<KuyrukIslemSonucu> {
  const yeniDeneme = satir.deneme_sayisi + 1;
  if (yeniDeneme >= MAKS_DENEME) {
    await admin.from("mesaj_kuyrugu").update({ durum: "hata", hata_mesaji: hataMesaji, deneme_sayisi: yeniDeneme }).eq("id", satir.id);
    return { durum: "hata", hataMesaji };
  }

  const bekleyecekDk = GERI_CEKILME_DAKIKA[yeniDeneme - 1];
  const yeniZaman = new Date(Date.now() + bekleyecekDk * 60_000).toISOString();
  await admin
    .from("mesaj_kuyrugu")
    .update({ durum: "beklemede", hata_mesaji: hataMesaji, deneme_sayisi: yeniDeneme, planlanan_zaman: yeniZaman })
    .eq("id", satir.id);
  return { durum: "beklemede", hataMesaji };
}
