"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { anlikMesajTetikle } from "@/lib/mesaj/anlik-tetikle";
import { IZIN_DURUM_ETIKETLERI, type IzinDurum } from "@/types/izin";

type SonucDurumu = { success: boolean; message: string } | null;

async function yetkiliBaglantiGetir() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("klinik_id, rol").eq("id", user.id).single();

  return { supabase, klinikId: kullanici?.klinik_id ?? null, rol: kullanici?.rol ?? null };
}

async function sonucBildir(
  supabase: Awaited<ReturnType<typeof createClient>>,
  talepId: string,
  durum: IzinDurum
) {
  const { data: talep } = await supabase
    .from("personel_izin_talebi")
    .select("klinik_id, klinik:klinik_id(ad), personel:personel_id(id, ad_soyad, eposta, kullanici:kullanici_id(telefon))")
    .eq("id", talepId)
    .maybeSingle<{
      klinik_id: string;
      klinik: { ad: string } | null;
      personel: { id: string; ad_soyad: string; eposta: string | null; kullanici: { telefon: string | null } | null } | null;
    }>();

  if (!talep?.personel) return;

  try {
    const adminClient = createAdminClient();
    await anlikMesajTetikle(adminClient, {
      klinikId: talep.klinik_id,
      tetikleyiciKodu: "personel_izin_sonuc",
      aliciTipi: "personel",
      aliciId: talep.personel.id,
      adres: { telefon: talep.personel.kullanici?.telefon ?? null, eposta: talep.personel.eposta },
      degiskenler: {
        personel_adi: talep.personel.ad_soyad,
        izin_durumu: IZIN_DURUM_ETIKETLERI[durum],
        klinik_adi: talep.klinik?.ad ?? "",
      },
    });
  } catch (e) {
    console.error("İzin sonucu bildirimi gönderilemedi:", e);
  }
}

export async function izinTalebiOnayla(talepId: string): Promise<SonucDurumu> {
  const { supabase, klinikId, rol } = await yetkiliBaglantiGetir();
  if (!klinikId || rol !== "klinik_admin") {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const { error } = await supabase.rpc("personel_izin_talebi_onayla", { p_talep_id: talepId });

  if (error) {
    console.error("İzin talebi onaylanamadı:", error);
    const mesaj = error.message?.startsWith("donem_kapali")
      ? `Onaylanamadı: ${error.message.split(":")[1]?.trim() ?? ""} dönemi kapalı, önce dönemi yeniden açın.`
      : error.message === "gecersiz_durum_gecisi"
        ? "Bu talep artık onaylanamaz (beklemede değil)."
        : "Onaylanamadı, lütfen tekrar deneyin.";
    return { success: false, message: mesaj };
  }

  await sonucBildir(supabase, talepId, "onaylandi");

  revalidatePath("/panel/personel/izinler");
  revalidatePath("/panel/personel/izinlerim");
  return { success: true, message: "Talep onaylandı, ilgili günlere puantaj kaydı işlendi." };
}

export async function izinTalebiReddet(talepId: string, redGerekce: string): Promise<SonucDurumu> {
  const { supabase, klinikId, rol } = await yetkiliBaglantiGetir();
  if (!klinikId || rol !== "klinik_admin") {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  if (!redGerekce.trim()) {
    return { success: false, message: "Red gerekçesi zorunlu." };
  }

  const { error } = await supabase.rpc("personel_izin_talebi_reddet", {
    p_talep_id: talepId,
    p_red_gerekce: redGerekce.trim(),
  });

  if (error) {
    console.error("İzin talebi reddedilemedi:", error);
    const mesaj = error.message === "gecersiz_durum_gecisi" ? "Bu talep artık reddedilemez (beklemede değil)." : "Reddedilemedi, lütfen tekrar deneyin.";
    return { success: false, message: mesaj };
  }

  await sonucBildir(supabase, talepId, "reddedildi");

  revalidatePath("/panel/personel/izinler");
  revalidatePath("/panel/personel/izinlerim");
  return { success: true, message: "Talep reddedildi." };
}

export async function izinTalebiYoneticiIptalEt(talepId: string): Promise<SonucDurumu> {
  const { supabase, klinikId, rol } = await yetkiliBaglantiGetir();
  if (!klinikId || rol !== "klinik_admin") {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const { error } = await supabase.rpc("personel_izin_talebi_yonetici_iptal", { p_talep_id: talepId });

  if (error) {
    console.error("Onaylı izin iptal edilemedi:", error);
    const mesaj =
      error.message === "izin_baslamis"
        ? "İzin zaten başladığı için iptal edilemez."
        : error.message === "gecersiz_durum_gecisi"
          ? "Bu talep artık iptal edilemez (onaylı değil)."
          : "İptal edilemedi, lütfen tekrar deneyin.";
    return { success: false, message: mesaj };
  }

  revalidatePath("/panel/personel/izinler");
  revalidatePath("/panel/personel/izinlerim");
  return { success: true, message: "Onaylı izin iptal edildi, ilgili puantaj kayıtları geri alındı." };
}
