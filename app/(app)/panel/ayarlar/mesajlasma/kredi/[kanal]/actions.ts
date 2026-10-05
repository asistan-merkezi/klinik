"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { merkezdenKrediPaketleriCek, merkezdenOdemeOturumuOlustur } from "@/lib/mesaj/merkez-client";
import type { MesajKanal } from "@/types/mesajlasma";

type SonucDurumu = { success: boolean; message: string } | null;

const GECERLI_KANALLAR: MesajKanal[] = ["sms", "whatsapp", "mail"];

/**
 * "Ödeme Yap": seçilen paketi merkezin ödeme sistemine devreder. Klinik tarafı
 * ASLA fiyat/adet göndermez, yalnız paket id'si — fiyatı merkez çözer (bkz.
 * lib/mesaj/merkez-client.ts "MERKEZ SÖZLEŞMESİ" madde 5). Paket id'si ayrıca
 * merkezin güncel listesine karşı doğrulanır. Kredi bu akışta klinik tarafında
 * YAZILMAZ: ödeme tamamlanınca merkez kendi defterine ekler, bakiye dönüşte
 * (ve saatlik cron'da) merkezden senkronlanır.
 */
export async function krediOdemeBaslat(kanal: MesajKanal, _onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  if (!GECERLI_KANALLAR.includes(kanal)) {
    return { success: false, message: "Geçersiz kanal." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("rol, klinik_id").eq("id", user.id).single();

  if (!kullanici?.klinik_id || kullanici.rol !== "klinik_admin") {
    return { success: false, message: "Kredi satın alma yetkisi yalnız klinik yöneticisine aittir." };
  }

  const paketId = String(formData.get("paket_id") ?? "").trim();
  if (!paketId) {
    return { success: false, message: "Bir kredi paketi seçin." };
  }

  const paketler = await merkezdenKrediPaketleriCek(kanal);
  if (!paketler.ulasildi) {
    return { success: false, message: "Asistan Merkezi'ne ulaşılamadı, lütfen daha sonra tekrar deneyin." };
  }
  if (!paketler.paketler.some((p) => p.id === paketId)) {
    return { success: false, message: "Seçilen paket artık geçerli değil, sayfayı yenileyip tekrar seçin." };
  }

  const baslik = await headers();
  const host = baslik.get("x-forwarded-host") ?? baslik.get("host");
  if (!host) {
    return { success: false, message: "Dönüş adresi belirlenemedi." };
  }
  const protokol = baslik.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const donusUrl = `${protokol}://${host}/panel/ayarlar/mesajlasma/kredi/${kanal}?sekme=takip&odeme=donuldu`;

  const oturum = await merkezdenOdemeOturumuOlustur({ klinikId: kullanici.klinik_id, kanal, paketId, donusUrl });
  if (!oturum.ulasildi) {
    console.error("Ödeme oturumu için merkeze ulaşılamadı:", oturum.hata);
    return { success: false, message: "Asistan Merkezi ödeme sistemine ulaşılamadı, lütfen daha sonra tekrar deneyin." };
  }
  if (!oturum.basarili) {
    console.error("Ödeme oturumu açılamadı:", oturum.hata);
    return { success: false, message: "Ödeme oturumu açılamadı, lütfen tekrar deneyin." };
  }

  // Yalnız https (yerelde geliştirme için http://localhost) adreslere yönlendir.
  let hedef: URL;
  try {
    hedef = new URL(oturum.odemeUrl);
  } catch {
    return { success: false, message: "Ödeme adresi geçersiz döndü." };
  }
  const yerel = hedef.hostname === "localhost";
  if (hedef.protocol !== "https:" && !(yerel && hedef.protocol === "http:")) {
    return { success: false, message: "Ödeme adresi güvenli değil, işlem durduruldu." };
  }

  redirect(hedef.toString());
}
