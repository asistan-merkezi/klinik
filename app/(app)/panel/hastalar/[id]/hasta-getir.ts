import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { gecerliKullanici } from "@/lib/auth/gecerli-kullanici";
import type { HastaDetay } from "@/types/hasta";

export type HastaTemel = Pick<
  HastaDetay,
  | "id"
  | "ad_soyad"
  | "telefon"
  | "dogum_tarihi"
  | "cinsiyet"
  | "kategori"
  | "eposta"
  | "risk_bayraklari"
  | "kvkk_onay_tarihi"
  | "ozel_nitelikli_veri_onay_tarihi"
>;

// Hasta Detay layout'u ve altındaki her sekme sayfası (hub, kişisel, tedavi,
// cari, randevu) aynı auth/hasta/rol sorgularını ayrı ayrı çalıştırıyordu —
// bir tıklamada layout + page ikisi de aynı veriyi tekrar çekiyordu (4-6
// gereksiz round-trip). React'in cache()'i ile bu fonksiyonlar tek bir
// istek/render ömrü boyunca aynı argümanla ikinci kez çağrıldığında gerçek
// bir sorgu çalıştırmaz, önceki sonucu döner.
//
// getAuthUser/kullaniciRolGetir ARTIK kendi supabase.auth.getUser() / kullanici
// SELECT'ini çalıştırmıyor — ikisi de lib/auth/gecerli-kullanici.ts'teki
// (zaten cache()'li) gecerliKullanici()'ye delege ediyor. Önceden bu dosya
// panel/layout.tsx'in kullandığı gecerliKullanici()'den TAMAMEN habersiz,
// kendi ayrı cache()'li auth çağrısını yapıyordu — aynı istekte hem panel
// layout'u hem hasta detay layout'u auth.getUser()'ı AYRI AYRI çalıştırıyordu
// (Performans turu 3, ADIM 2'de ölçümle bulundu: hub→/kisisel geçişi en yavaş
// geçişti, bu çift auth nedeniyle).
export const getAuthUser = cache(async (): Promise<{ id: string } | null> => {
  const oturum = await gecerliKullanici();
  return oturum ? { id: oturum.authUser.id } : null;
});

export const hastaTemelGetir = cache(async (id: string): Promise<HastaTemel | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("hasta")
    .select(
      "id, ad_soyad, telefon, dogum_tarihi, cinsiyet, kategori, eposta, risk_bayraklari, kvkk_onay_tarihi, ozel_nitelikli_veri_onay_tarihi"
    )
    .eq("id", id)
    .single<HastaTemel>();
  return data ?? null;
});

export const hastaDetayFullGetir = cache(async (id: string): Promise<HastaDetay | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("hasta")
    .select(
      "id, ad_soyad, telefon, dogum_tarihi, kvkk_onay_tarihi, whatsapp_izin_durumu, cinsiyet, kategori, eposta, referans_kanali, ozel_nitelikli_veri_onay_tarihi, ticari_ileti_onay_tarihi, risk_bayraklari, created_at, " +
        "kvkk_onaylayan_tip, kvkk_onaylayan:kullanici!hasta_kvkk_onaylayan_kullanici_id_fkey(ad_soyad), " +
        "ozel_nitelikli_onaylayan_tip, ozel_nitelikli_onaylayan:kullanici!hasta_ozel_nitelikli_onaylayan_kullanici_id_fkey(ad_soyad), " +
        "ticari_ileti_onaylayan_tip, ticari_ileti_onaylayan:kullanici!hasta_ticari_ileti_onaylayan_kullanici_id_fkey(ad_soyad)"
    )
    .eq("id", id)
    .single<HastaDetay>();
  return data ?? null;
});

// Tüm çağıranlar zaten getAuthUser()'ın döndürdüğü kendi id'sini geçiyor,
// bu yüzden doğrudan gecerliKullanici()'nin (aynı istekte zaten hesaplanmış)
// sonucundan okumak güvenli ve ekstra sorgu gerektirmiyor. userId eşleşmezse
// (beklenmeyen bir çağrı şekli) sessizce yanlış kullanıcının rolünü döndürmek
// yerine null döner.
export const kullaniciRolGetir = cache(async (userId: string): Promise<string | null> => {
  const oturum = await gecerliKullanici();
  return oturum?.authUser.id === userId ? (oturum.kullanici?.rol ?? null) : null;
});
