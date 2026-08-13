"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { MesajKanal } from "@/types/mesajlasma";

type SonucDurumu = { success: boolean; message: string } | null;

async function klinikAdminDogrula() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("rol, klinik_id")
    .eq("id", user.id)
    .single();

  if (!kullanici || kullanici.rol !== "klinik_admin" || !kullanici.klinik_id) {
    return null;
  }

  return { supabase, klinikId: kullanici.klinik_id };
}

/**
 * Manuel kredi yükleme — ödeme entegrasyonu YOK (TODO: payment-integration
 * skill'i geldiğinde bu action'ın öncesine gerçek bir ödeme adımı eklenecek).
 * mesaj_kredi_yukle RPC'si bakiye + islem kaydını atomik yazıyor.
 */
export async function krediYukle(kanal: MesajKanal, _onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const yetki = await klinikAdminDogrula();
  if (!yetki) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const miktar = Number(formData.get("miktar"));
  const tutarRaw = formData.get("tutar");
  const tutar = tutarRaw ? Number(tutarRaw) : null;
  const aciklama = String(formData.get("aciklama") ?? "").trim() || null;

  if (!Number.isFinite(miktar) || miktar <= 0) {
    return { success: false, message: "Geçerli bir kredi miktarı girin." };
  }
  if (tutarRaw && (tutar === null || !Number.isFinite(tutar) || tutar < 0)) {
    return { success: false, message: "Geçerli bir tutar girin." };
  }

  const miktarTamsayi = Math.trunc(miktar);

  const { error } = await yetki.supabase.rpc("mesaj_kredi_yukle", {
    p_klinik_id: yetki.klinikId,
    p_kanal: kanal,
    p_miktar: miktarTamsayi,
    p_tutar: tutar,
    p_aciklama: aciklama,
  });

  if (error) {
    console.error("Kredi yüklenemedi:", error.message);
    return { success: false, message: "Kredi yüklenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath(`/panel/ayarlar/mesajlasma/kredi/${kanal}`);
  revalidatePath("/panel/ayarlar/mesajlasma");
  return { success: true, message: `${miktarTamsayi} kredi eklendi.` };
}
