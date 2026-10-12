import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { KullaniciRolu } from "@/lib/auth/sayfa-yetkisi";

export const YETKISIZ_MESAJI = "Bu işlem için yetkiniz yok.";

/**
 * Server action düzeyinde rol bilgisi. `yetkili` false ise çağıran YAZMADAN dönmeli:
 * RLS yetkisiz UPDATE'i hata vermeden 0 satırla geçirir, action da "güncellendi" derdi
 * (yanıltıcı başarı). Asıl güvenlik sınırı RLS'tir; bu, doğru geri bildirim ve gereksiz sorgu içindir.
 * `super_admin` klinik_id taşımadığı için `klinikId` null döner (eski davranış: "Klinik bilgisi bulunamadı").
 */
export async function eylemYetkisiGetir(izinliRoller: readonly KullaniciRolu[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("klinik_id, rol")
    .eq("id", user.id)
    .single();

  const rol = kullanici?.rol ?? null;
  const yetkili = !!rol && (rol === "super_admin" || izinliRoller.includes(rol));

  return { supabase, klinikId: kullanici?.klinik_id ?? null, yetkili };
}
