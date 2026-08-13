import { createClient } from "@/lib/supabase/server";
import type { MesajBolum, MesajKanal } from "@/types/mesajlasma";

export type MesajGonderSebep = "kural_kapali" | "kanal_kapali" | "yetersiz_bakiye" | "cok_sik_deneme" | "hata";

export type MesajGonderSonucu = { gonderildi: true } | { gonderildi: false; sebep: MesajGonderSebep };

type GonderMesajParams = {
  klinikId: string;
  kanal: MesajKanal;
  bolum: MesajBolum;
  tetikleyiciKod: string;
  hedefId?: string;
  degiskenler?: Record<string, string>;
};

function rpcHatasiniCevir(mesaj: string): MesajGonderSebep {
  if (mesaj.includes("yetersiz_bakiye")) return "yetersiz_bakiye";
  if (mesaj.includes("cok_sik_deneme")) return "cok_sik_deneme";
  return "hata";
}

/**
 * Klinikte tetiklenen olaylara göre (hasta/randevu/personel/muhasebe) bildirim
 * göndermenin TEK girişi. mesaj_gonderim_kaydet RPC'si kuralın aktif olup
 * olmadığını, ilgili kanalın açık olup olmadığını ve kredi bakiyesini atomik
 * olarak kontrol edip düşer + mesaj_log satırı yazar (bkz.
 * supabase/migrations/20260815110000_mesajlasma_modulu.sql). Kural/kanal
 * kapalıysa sessizce {gonderildi:false} döner, hiçbir log/kredi hareketi
 * oluşmaz.
 *
 * TODO(mesaj.asistanmerkezi): gerçek gönderim entegrasyonu geldiğinde SADECE
 * aşağıdaki console.log satırı gerçek bir API çağrısına dönüşecek — çağıran
 * kodun (server action'ların) hiçbiri değişmeyecek.
 */
export async function gonderMesaj(params: GonderMesajParams): Promise<MesajGonderSonucu> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("mesaj_gonderim_kaydet", {
    p_klinik_id: params.klinikId,
    p_bolum: params.bolum,
    p_kanal: params.kanal,
    p_tetikleyici_kod: params.tetikleyiciKod,
    p_hedef_id: params.hedefId ?? null,
    p_test: false,
  });

  if (error) {
    console.error("[mesajlasma] gonderMesaj RPC hatası:", error.message);
    return { gonderildi: false, sebep: rpcHatasiniCevir(error.message) };
  }

  const sonuc = data as { gonderildi: boolean; sebep?: string };
  if (!sonuc.gonderildi) {
    return { gonderildi: false, sebep: (sonuc.sebep as MesajGonderSebep | undefined) ?? "kural_kapali" };
  }

  console.log(
    `[mesaj simülasyon] ${params.kanal.toUpperCase()} → "${params.tetikleyiciKod}"` +
      (params.hedefId ? ` (hedef: ${params.hedefId})` : "") +
      (params.degiskenler && Object.keys(params.degiskenler).length > 0
        ? ` — değişkenler: ${JSON.stringify(params.degiskenler)}`
        : "")
  );

  return { gonderildi: true };
}

/**
 * Ayarlar > Mesajlaşma ekranındaki "Test Gönder" ikonu için. gonderMesaj ile
 * birebir aynı yolu (aynı RPC) kullanır, sadece p_test:true geçer — bu bayrak
 * RPC içindeki 5 saniyelik "aynı kural+kanal için çok sık deneme" throttle'ını
 * tetikler (gerçek/otomatik gönderim yollarını etkilemez).
 */
export async function testMesajGonder(
  params: Omit<GonderMesajParams, "hedefId" | "degiskenler">
): Promise<MesajGonderSonucu> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("mesaj_gonderim_kaydet", {
    p_klinik_id: params.klinikId,
    p_bolum: params.bolum,
    p_kanal: params.kanal,
    p_tetikleyici_kod: params.tetikleyiciKod,
    p_hedef_id: null,
    p_test: true,
  });

  if (error) {
    console.error("[mesajlasma] testMesajGonder RPC hatası:", error.message);
    return { gonderildi: false, sebep: rpcHatasiniCevir(error.message) };
  }

  const sonuc = data as { gonderildi: boolean; sebep?: string };
  if (!sonuc.gonderildi) {
    return { gonderildi: false, sebep: (sonuc.sebep as MesajGonderSebep | undefined) ?? "kural_kapali" };
  }

  console.log(`[mesaj test] ${params.kanal.toUpperCase()} → "${params.tetikleyiciKod}" (test gönderimi)`);
  return { gonderildi: true };
}
