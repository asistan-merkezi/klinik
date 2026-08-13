import type { MesajSaglayici } from "./tip";

/**
 * MESAJ_MOD=simulasyon (varsayılan) iken kullanılan adapter — gerçek bir
 * sağlayıcıya bağlanmaz, sadece server log'una yazıp başarı döner. Faz 3'te
 * gerçek adapter'lar (Resend/WhatsApp merkezi servis/SMS) gelene kadar TÜM
 * gönderimler (Test Gönder dahil) bu yoldan geçiyor.
 */
export const simuleSaglayici: MesajSaglayici = {
  async gonder({ aliciAdres, metin }) {
    console.log(`[mesaj simülasyon] -> ${aliciAdres}: ${metin}`);
    return { basarili: true, saglayiciMesajId: `sim_${crypto.randomUUID()}` };
  },
};
