import type { MesajKanal } from "@/types/mesajlasma";
import type { MesajSaglayici } from "./tip";
import { simuleSaglayici } from "./simule";

/**
 * Sağlayıcı seçimi env ile: MESAJ_MOD=simulasyon (varsayılan) | canli.
 * Faz 2'de sadece simülasyon adapter'ı var — Faz 3'te kanal başına gerçek
 * adapter'lar (mail: Resend, whatsapp: mesaj.asistanmerkezi, sms: TBD)
 * buraya eklenecek, bu fonksiyonun imzası değişmeyecek.
 */
export function saglayiciSec(kanal: MesajKanal): MesajSaglayici {
  const mod = process.env.MESAJ_MOD === "canli" ? "canli" : "simulasyon";

  if (mod === "simulasyon") {
    return simuleSaglayici;
  }

  throw new Error(`MESAJ_MOD=canli ama '${kanal}' kanalı için henüz gerçek bir sağlayıcı bağlanmadı (Faz 3).`);
}
