"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resmiTatilleriGuncelle } from "@/lib/tatil/oneri-uret";

type SonucDurumu = { success: boolean; message: string } | null;

const SAYFA = "/panel/ayarlar/resmi-tatiller";

function sayfalariYenile() {
  revalidatePath(SAYFA);
  revalidatePath("/panel/personel/puantaj-cetveli");
}

async function yetkiliKlinikAdminGetir() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/giris");

  const { data: kullanici } = await supabase.from("kullanici").select("rol, klinik_id").eq("id", user.id).single();
  if (kullanici?.rol !== "klinik_admin" || !kullanici.klinik_id) {
    return { supabase, klinikId: null };
  }
  return { supabase, klinikId: kullanici.klinik_id as string };
}

const tarihSemasi = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih seçilmeli.");

const tatilEkleSemasi = z.object({
  tarih: tarihSemasi,
  ad: z.string().trim().min(2, "Tatil adı girilmeli.").max(120),
});

/** Kliniğe özel tatil (idari izin, bayram uzatması, kliniğin kapalı olduğu gün vb.). */
export async function tatilEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const { supabase, klinikId } = await yetkiliKlinikAdminGetir();
  if (!klinikId) return { success: false, message: "Bu işlem için yetkiniz yok." };

  const ayristirma = tatilEkleSemasi.safeParse({ tarih: formData.get("tarih"), ad: formData.get("ad") });
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }
  const { tarih, ad } = ayristirma.data;

  const { data: mevcut } = await supabase.from("resmi_tatil").select("ad").eq("tarih", tarih).limit(1).maybeSingle();
  if (mevcut) {
    return { success: false, message: `Bu gün zaten tatil olarak kayıtlı (${mevcut.ad}).` };
  }

  const { error } = await supabase.from("resmi_tatil").insert({ klinik_id: klinikId, tarih, ad });
  if (error) {
    console.error("Resmi tatil eklenemedi:", error);
    return { success: false, message: "Tatil eklenemedi, lütfen tekrar deneyin." };
  }

  sayfalariYenile();
  return { success: true, message: "Tatil eklendi." };
}

/** Yalnız kliniğin kendi eklediği/onayladığı satırlar silinir; sistem (global) tatilleri RLS'le korunur. */
export async function tatilSil(id: string): Promise<SonucDurumu> {
  const { supabase, klinikId } = await yetkiliKlinikAdminGetir();
  if (!klinikId) return { success: false, message: "Bu işlem için yetkiniz yok." };
  if (!z.string().uuid().safeParse(id).success) return { success: false, message: "Tatil bulunamadı." };

  const { data, error } = await supabase
    .from("resmi_tatil")
    .delete()
    .eq("id", id)
    .eq("klinik_id", klinikId)
    .select("id");
  if (error) {
    console.error("Resmi tatil silinemedi:", error);
    return { success: false, message: "Tatil silinemedi, lütfen tekrar deneyin." };
  }
  if (!data || data.length === 0) {
    return { success: false, message: "Sistem tatilleri silinemez; yalnız kliniğe özel tatiller silinebilir." };
  }

  sayfalariYenile();
  return { success: true, message: "Tatil silindi." };
}

const kararSemasi = z.object({
  yil: z.coerce.number().int().min(2000).max(2100),
  bayram: z.enum(["ramazan", "kurban"]),
  karar: z.enum(["onayla", "reddet"]),
  tarihler: z.array(tarihSemasi),
});

const KARAR_HATALARI: Record<string, string> = {
  yetkisiz: "Bu işlem için yetkiniz yok.",
  oneri_bulunamadi: "Bu öneri artık beklemede değil (sayfayı yenileyin).",
  tarihler_gecersiz: "Tarihler ardışık olmalı, öneriyle aynı gün sayısında ve aynı yıl içinde kalmalı.",
};

/** Bir bayramın önerisini (gerekirse düzeltilmiş tarihlerle) onaylar ya da reddeder. */
export async function bayramOnerisiKarar(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const { supabase, klinikId } = await yetkiliKlinikAdminGetir();
  if (!klinikId) return { success: false, message: "Bu işlem için yetkiniz yok." };

  const ayristirma = kararSemasi.safeParse({
    yil: formData.get("yil"),
    bayram: formData.get("bayram"),
    karar: formData.get("karar"),
    tarihler: formData.getAll("tarih"),
  });
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }
  const { yil, bayram, karar, tarihler } = ayristirma.data;
  const onay = karar === "onayla";

  const { error } = await supabase.rpc("resmi_tatil_onerisi_karar", {
    p_yil: yil,
    p_bayram: bayram,
    p_onay: onay,
    p_tarihler: onay ? tarihler : null,
  });
  if (error) {
    console.error("Bayram önerisi kararı kaydedilemedi:", error);
    const anahtar = Object.keys(KARAR_HATALARI).find((k) => error.message?.includes(k));
    return { success: false, message: anahtar ? KARAR_HATALARI[anahtar] : "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  sayfalariYenile();
  return {
    success: true,
    message: onay
      ? "Bayram tarihleri onaylandı; izin ve puantaj hesaplarında tatil sayılacak."
      : "Öneri reddedildi. Doğru tarihleri aşağıdaki formdan elle ekleyin.",
  };
}

/** Cron'u beklemeden bu klinik için sabit tatilleri ve bayram önerilerini şimdi günceller. */
export async function onerileriKontrolEt(): Promise<SonucDurumu> {
  const { klinikId } = await yetkiliKlinikAdminGetir();
  if (!klinikId) return { success: false, message: "Bu işlem için yetkiniz yok." };

  try {
    const sonuc = await resmiTatilleriGuncelle(createAdminClient(), [klinikId]);
    sayfalariYenile();
    if (sonuc.nagerHatasi.length > 0 && sonuc.oneriEklenen === 0) {
      return {
        success: false,
        message: "Bayram tarihleri kaynağına şu an ulaşılamadı. Tarihleri elle ekleyebilir ya da daha sonra tekrar deneyebilirsiniz.",
      };
    }
    return {
      success: true,
      message:
        sonuc.oneriEklenen > 0
          ? "Yeni bayram önerileri eklendi; aşağıdan kontrol edip onaylayın."
          : "Güncel — eklenecek yeni tatil ya da öneri yok.",
    };
  } catch (hata) {
    console.error("Resmi tatil kontrolü başarısız:", hata);
    return { success: false, message: "Kontrol yapılamadı, lütfen tekrar deneyin." };
  }
}
