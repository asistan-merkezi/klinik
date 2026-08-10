"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type SonucDurumu = { success: boolean; message: string } | null;

async function yetkiliMi() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("rol")
    .eq("id", user.id)
    .single();

  if (
    kullanici?.rol !== "klinik_admin" &&
    kullanici?.rol !== "muhasebe" &&
    kullanici?.rol !== "super_admin"
  ) {
    return { yetkili: false, supabase } as const;
  }

  return { yetkili: true, supabase } as const;
}

async function baglantiKontrolu(supabase: Awaited<ReturnType<typeof createClient>>): Promise<SonucDurumu> {
  const { data: entegrasyon } = await supabase
    .from("klinik_muhasebe_entegrasyonu")
    .select("baglanti_durumu")
    .maybeSingle();

  if (entegrasyon?.baglanti_durumu !== "baglandi") {
    return {
      success: false,
      message: "Muhasebe Sync henüz bağlı değil. Ayarlar > Muhasebe Sync'ten Paraşüt bilgilerini girin.",
    };
  }

  return null;
}

export async function arsiviGuncelle(): Promise<SonucDurumu> {
  const { yetkili, supabase } = await yetkiliMi();
  if (!yetkili) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const baglantiHatasi = await baglantiKontrolu(supabase);
  if (baglantiHatasi) {
    return baglantiHatasi;
  }

  // Kimlik bilgisi girilmiş olsa da gerçek Paraşüt API client'ı henüz yazılmadı
  // (bkz. CLAUDE.md), bu yüzden arşiv çekimi henüz çalışmıyor.
  return {
    success: false,
    message: "Muhasebe Sync bağlı ama Paraşüt API entegrasyonu henüz yazılmadı, arşiv otomatik çekilemiyor.",
  };
}

export async function stokFiyatlariniGuncelle(): Promise<SonucDurumu> {
  const { yetkili, supabase } = await yetkiliMi();
  if (!yetkili) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const baglantiHatasi = await baglantiKontrolu(supabase);
  if (baglantiHatasi) {
    return baglantiHatasi;
  }

  return {
    success: false,
    message: "Muhasebe Sync bağlı ama Paraşüt API entegrasyonu henüz yazılmadı, stok fiyatları senkronize edilemiyor.",
  };
}
