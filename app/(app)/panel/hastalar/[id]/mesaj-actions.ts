"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { eylemYetkisiGetir, YETKISIZ_MESAJI } from "@/lib/auth/eylem-yetkisi";
import { kuyrukSatiriniIsle } from "@/lib/mesaj/kuyruk-isle";
import { manuelGonderilebilirTetikleyiciler, manuelMetniDoldur } from "@/lib/mesaj/manuel-mesaj";
import type { MesajKanal } from "@/types/mesajlasma";

// Hastaya elle mesaj: yalnız resepsiyon + yönetici (RLS'teki hasta yönetimi kümesiyle aynı).
const IZINLI_ROLLER = ["klinik_admin", "resepsiyon"] as const;

export type HastaMesajSecenegi = {
  kod: string;
  ad: string;
  metin: string;
  ticari: boolean;
  /** Ticari şablon, hastanın ticari ileti onayı yoksa gönderilemez. */
  engelli: boolean;
};

export type HastaMesajSecenekleri = {
  secenekler: HastaMesajSecenegi[];
  kanallar: { sms: boolean; whatsapp: boolean; mail: boolean };
};

export type HastaMesajGonderSonucu = { success: boolean; message: string };

type HastaSatiri = {
  id: string;
  klinik_id: string;
  ad_soyad: string;
  telefon: string | null;
  eposta: string | null;
  whatsapp_izin_durumu: boolean;
  ticari_ileti_onay_tarihi: string | null;
};

const HASTA_SELECT = "id, klinik_id, ad_soyad, telefon, eposta, whatsapp_izin_durumu, ticari_ileti_onay_tarihi";

async function yetkiliHastaGetir(hastaId: string) {
  const { supabase, yetkili } = await eylemYetkisiGetir(IZINLI_ROLLER);
  if (!yetkili) return { ok: false as const, hata: YETKISIZ_MESAJI };

  // Kullanıcı oturumuyla (RLS) okunur: başka kliniğin hastası burada hiç dönmez.
  const { data: hasta } = await supabase.from("hasta").select(HASTA_SELECT).eq("id", hastaId).maybeSingle<HastaSatiri>();
  if (!hasta) return { ok: false as const, hata: "Hasta bulunamadı." };

  const admin = createAdminClient();
  const { data: klinik } = await admin.from("klinik").select("ad").eq("id", hasta.klinik_id).maybeSingle();
  return { ok: true as const, admin, hasta, klinikAdi: (klinik?.ad as string | undefined) ?? "" };
}

/** Modal açılınca: gönderilebilecek şablonlar (kliniğin kendi metni varsa o, yoksa varsayılan) + hastanın erişilebilir kanalları. */
export async function hastaMesajSecenekleriGetir(hastaId: string): Promise<HastaMesajSecenekleri | { hata: string }> {
  const bag = await yetkiliHastaGetir(hastaId);
  if (!bag.ok) return { hata: bag.hata };
  const { admin, hasta, klinikAdi } = bag;

  const { data: kurallar } = await admin
    .from("mesaj_kurallari")
    .select("tetikleyici_kodu, mesaj_metni")
    .eq("klinik_id", hasta.klinik_id);
  const ozelMetin = new Map((kurallar ?? []).map((k) => [k.tetikleyici_kodu as string, (k.mesaj_metni as string | null) ?? ""]));

  const ticariOnayi = !!hasta.ticari_ileti_onay_tarihi;
  const degiskenler = { hasta_adi: hasta.ad_soyad, klinik_adi: klinikAdi };

  return {
    secenekler: manuelGonderilebilirTetikleyiciler().map((t) => ({
      kod: t.kod,
      ad: t.ad,
      metin: manuelMetniDoldur(ozelMetin.get(t.kod) || t.varsayilanMesajMetni, degiskenler),
      ticari: t.icerikTipi === "ticari",
      engelli: t.icerikTipi === "ticari" && !ticariOnayi,
    })),
    kanallar: {
      sms: !!hasta.telefon,
      whatsapp: !!hasta.telefon && hasta.whatsapp_izin_durumu,
      mail: !!hasta.eposta,
    },
  };
}

const gonderSemasi = z.object({
  kod: z.string().min(1),
  metin: z.string().trim().min(1, "Mesaj metni boş olamaz.").max(1000, "Mesaj en fazla 1000 karakter olabilir."),
  kanallar: z.array(z.enum(["sms", "whatsapp", "mail"])).min(1, "En az bir kanal seçin."),
});

export async function hastaMesajiGonder(
  hastaId: string,
  girdi: { kod: string; metin: string; kanallar: MesajKanal[] }
): Promise<HastaMesajGonderSonucu> {
  const ayristirma = gonderSemasi.safeParse(girdi);
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }
  const { kod, metin, kanallar } = ayristirma.data;

  const tanim = manuelGonderilebilirTetikleyiciler().find((t) => t.kod === kod);
  if (!tanim) return { success: false, message: "Geçersiz mesaj türü." };

  const bag = await yetkiliHastaGetir(hastaId);
  if (!bag.ok) return { success: false, message: bag.hata };
  const { admin, hasta } = bag;

  // KVKK/İYS: ticari ileti onayı yoksa gönderilmez; WhatsApp yalnız izinli hastaya.
  if (tanim.icerikTipi === "ticari" && !hasta.ticari_ileti_onay_tarihi) {
    return { success: false, message: "Hastanın ticari ileti onayı yok, bu mesaj gönderilemez." };
  }

  const adresler: Record<MesajKanal, string | null> = {
    sms: hasta.telefon,
    whatsapp: hasta.whatsapp_izin_durumu ? hasta.telefon : null,
    mail: hasta.eposta,
  };

  const eklenenler: { id: string; kanal: MesajKanal }[] = [];
  const atlananlar: MesajKanal[] = [];
  for (const kanal of new Set(kanallar)) {
    const adres = adresler[kanal];
    if (!adres) {
      atlananlar.push(kanal);
      continue;
    }
    const { data, error } = await admin
      .from("mesaj_kuyrugu")
      .insert({
        klinik_id: hasta.klinik_id,
        tetikleyici_kodu: kod,
        kanal,
        alici_tipi: "hasta",
        alici_id: hasta.id,
        alici_adres: adres,
        gonderilecek_metin: metin,
        // Elle gönderimde her tıklama ayrı bir mesajdır; aynı metin bilerek tekrar gönderilebilir.
        idempotency_anahtari: `manuel:${hasta.id}:${kod}:${kanal}:${randomUUID()}`,
      })
      .select("id")
      .single();
    if (error || !data) {
      console.error(`[mesaj] elle mesaj kuyruğa yazılamadı (hasta ${hasta.id}/${kanal}):`, error?.message);
      return { success: false, message: "Mesaj kuyruğa alınamadı, lütfen tekrar deneyin." };
    }
    eklenenler.push({ id: data.id as string, kanal });
  }

  if (eklenenler.length === 0) {
    return { success: false, message: "Seçilen kanallar için hastanın iletişim bilgisi/izni yok." };
  }

  // Hemen göndermeyi dene; olmazsa (merkez yapılandırılmamış/geçici hata) kuyruk kendi yeniden deneme düzeniyle devam eder.
  let gonderilen = 0;
  for (const e of eklenenler) {
    try {
      const sonuc = await kuyrukSatiriniIsle(admin, e.id);
      if (sonuc.durum === "gonderildi") gonderilen++;
    } catch (hata) {
      console.error(`[mesaj] elle mesaj anlık işlenemedi (${e.id}):`, hata);
    }
  }

  const atlandiNotu = atlananlar.length > 0 ? ` (${atlananlar.join(", ")} için iletişim bilgisi/izni yok, atlandı)` : "";
  if (gonderilen === eklenenler.length) {
    return { success: true, message: `Mesaj gönderildi.${atlandiNotu}` };
  }
  return {
    success: true,
    message: `Mesaj kuyruğa alındı, birazdan gönderilecek.${atlandiNotu}`,
  };
}
