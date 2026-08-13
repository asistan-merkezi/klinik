import { TETIKLEYICILER } from "./tetikleyiciler";
import type { EtkinMesajKurali } from "@/types/mesajlasma";

/** DB'den (mesaj_kurallari) gelen ham satırın sadece işimize yarayan alanları. */
export type MesajKuraliDbSatiri = {
  id: string;
  tetikleyici_kodu: string;
  aktif: boolean;
  sms_aktif: boolean;
  whatsapp_aktif: boolean;
  mail_aktif: boolean;
  mesaj_metni: string;
};

/**
 * Kod kataloğunu (TETIKLEYICILER) klinik'in DB'de tuttuğu override'larla
 * birleştirir. Bir tetikleyici için DB'de satır YOKSA "pasif" kabul edilir
 * (aktif=false, hiçbir kanal açık değil, mesaj metni boş) — spesifikasyonun
 * "kayıt yoksa pasif kabul et" kuralı burada TEK yerde uygulanıyor, panel
 * kodu bunu tekrar tekrar yazmıyor.
 */
export function etkinKurallariOlustur(dbSatirlari: MesajKuraliDbSatiri[]): EtkinMesajKurali[] {
  const dbHaritasi = new Map(dbSatirlari.map((s) => [s.tetikleyici_kodu, s] as const));

  return TETIKLEYICILER.map((tanim) => {
    const dbSatiri = dbHaritasi.get(tanim.kod);
    if (!dbSatiri) {
      return {
        id: null,
        bolum: tanim.bolum,
        tetikleyici_kodu: tanim.kod,
        tetikleyici_adi: tanim.ad,
        mesaj_metni: "",
        sms_aktif: false,
        whatsapp_aktif: false,
        mail_aktif: false,
        aktif: false,
      };
    }
    return {
      id: dbSatiri.id,
      bolum: tanim.bolum,
      tetikleyici_kodu: tanim.kod,
      tetikleyici_adi: tanim.ad,
      mesaj_metni: dbSatiri.mesaj_metni,
      sms_aktif: dbSatiri.sms_aktif,
      whatsapp_aktif: dbSatiri.whatsapp_aktif,
      mail_aktif: dbSatiri.mail_aktif,
      aktif: dbSatiri.aktif,
    };
  });
}
