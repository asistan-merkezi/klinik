import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { oturumKilidiGecerliMi } from "@/lib/auth/oturum-kilidi";

export type GecerliHasta = { hastaId: string; authUserId: string };

/**
 * Hasta Portalı sayfalarının ortak girişi — auth.getUser() + hasta_kullanici
 * kontrolü + tek oturum kilidi (bkz. lib/auth/oturum-kilidi.ts) tek yerde.
 * gecerliKullanici() (panel tarafı) ile aynı desen. cache() ile sarılı: aynı
 * istek içinde birden çok portal sayfası/bileşeni çağırsa da tek sorgu.
 */
export const gecerliHasta = cache(async (): Promise<GecerliHasta | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  if (!(await oturumKilidiGecerliMi(supabase, user.id))) {
    redirect("/api/oturum-cikis?hedef=/portal/giris");
  }

  const { data: mk } = await supabase
    .from("hasta_kullanici")
    .select("hasta_id, aktif")
    .eq("id", user.id)
    .single();

  if (!mk?.hasta_id || !mk.aktif) {
    return null;
  }

  return { hastaId: mk.hasta_id, authUserId: user.id };
});
