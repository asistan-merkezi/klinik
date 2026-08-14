"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { merkezdenKrediYukle } from "@/lib/mesaj/merkez-client";
import { KANAL_ETIKET, type MesajKanal } from "@/types/mesajlasma";

type SonucDurumu = { success: boolean; message: string } | null;

/**
 * GÜVENLİK (atlanmayacak, TODO değil gerçek kontrol): serbest bir "ödeme
 * referansı" metin alanıyla kredi yüklemek, doğrulanmadığı sürece klinik
 * yöneticisine sınırsız bedava kredi vermek demektir. Gerçek tahsilat
 * merkez tarafında kararlaşana kadar SADECE super_admin gerçekten kredi
 * yükleyebilir — klinik_admin aynı formu gönderdiğinde krediye hiç
 * dokunulmaz, sadece destek_talebi'ne bir talep kaydı düşer (mevcut
 * Destek > Talep ve Şikayetler akışıyla aynı tablo/RLS, klinik_admin zaten
 * kendi adına buraya insert edebiliyor).
 *
 * Merkez tarafı için de not: /api/kredi-yukle şu an sadece
 * MESAJ_MERKEZ_API_KEY ile korunuyor — bu tek başına yeterli değil, merkez
 * odemeReferansi'nı gerçek bir ödeme kaydına karşı doğrulamak ZORUNDA
 * (bkz. lib/mesaj/merkez-client.ts başındaki "MERKEZ SÖZLEŞMESİ").
 */
export async function krediYukle(kanal: MesajKanal, _onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("rol, klinik_id").eq("id", user.id).single();

  if (!kullanici || !kullanici.klinik_id) {
    return { success: false, message: "Klinik bilgisi bulunamadı." };
  }

  const miktarRaw = Number(formData.get("miktar"));
  const odemeReferansi = String(formData.get("odeme_referansi") ?? "").trim();

  if (!Number.isFinite(miktarRaw) || miktarRaw <= 0) {
    return { success: false, message: "Geçerli bir kredi miktarı girin." };
  }
  const miktar = Math.trunc(miktarRaw);

  if (!odemeReferansi) {
    return { success: false, message: "Ödeme referansı girin." };
  }

  // klinik_admin (ve her rol super_admin dışında): gerçek kredi yüklenmez,
  // sadece talep kaydı oluşur.
  if (kullanici.rol !== "super_admin") {
    const { error } = await supabase.from("destek_talebi").insert({
      klinik_id: kullanici.klinik_id,
      kullanici_id: user.id,
      tur: "talep",
      konu: `Kredi Talebi — ${KANAL_ETIKET[kanal]} — ${miktar} adet`,
      aciklama: `Ödeme referansı: ${odemeReferansi}`,
    });

    if (error) {
      console.error("Kredi talebi oluşturulamadı:", error.message);
      return { success: false, message: "Talep oluşturulamadı, lütfen tekrar deneyin." };
    }

    revalidatePath("/panel/destek/talep-sikayetler");
    return {
      success: true,
      message: "Kredi talebiniz oluşturuldu — onaylandığında kliniğinize eklenecek. Kredi henüz yüklenmedi.",
    };
  }

  // Sadece super_admin buraya ulaşır.
  const sonuc = await merkezdenKrediYukle({ klinikId: kullanici.klinik_id, kanal, miktar, odemeReferansi });

  if (!sonuc.ulasildi) {
    return { success: false, message: `Merkeze ulaşılamadı: ${sonuc.hata}` };
  }
  if (!sonuc.basarili) {
    return { success: false, message: `Kredi yüklenemedi: ${sonuc.hata}` };
  }

  const admin = createAdminClient();
  const { error: senkronHata } = await admin.rpc("mesaj_kredi_senkronla", {
    p_klinik_id: kullanici.klinik_id,
    p_kanal: kanal,
    p_bakiye: sonuc.kalanBakiye,
    p_versiyon: sonuc.bakiyeVersiyonu,
  });
  if (senkronHata) {
    console.error("Kredi senkronlanamadı:", senkronHata.message);
  }

  const { error: hareketHata } = await admin.from("mesaj_kredi_hareketleri").insert({
    klinik_id: kullanici.klinik_id,
    kanal,
    tip: "yukleme",
    miktar,
    aciklama: `Ödeme referansı: ${odemeReferansi}`,
    olusturan_kullanici_id: user.id,
  });
  if (hareketHata) {
    console.error("Kredi yükleme geçmişi yazılamadı:", hareketHata.message);
  }

  revalidatePath(`/panel/ayarlar/mesajlasma/kredi/${kanal}`);
  revalidatePath("/panel/ayarlar/mesajlasma");
  return { success: true, message: `${miktar} kredi eklendi.` };
}
