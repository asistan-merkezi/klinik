"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type GirisSonucu = { success: false; message: string } | never;

export async function girisYap(
  _onceki: GirisSonucu | null,
  formData: FormData
): Promise<GirisSonucu | null> {
  const girisAdi = String(formData.get("giris_adi") ?? "").trim();
  const sifre = String(formData.get("sifre") ?? "");

  if (!girisAdi || !sifre) {
    return { success: false, message: "Telefon/e-posta ve şifre gerekli." };
  }

  const supabase = await createClient();
  const epostaGirisi = girisAdi.includes("@");

  if (epostaGirisi) {
    // Yalnız klinik_admin/super_admin e-posta ile girebilir — personel telefona
    // yönlendirilir (bkz. root CLAUDE.md, 2026-09-20 karar).
    const { error } = await supabase.auth.signInWithPassword({
      email: girisAdi,
      password: sifre,
    });
    if (error) {
      return { success: false, message: "E-posta veya şifre hatalı." };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: kullanici } = await supabase
      .from("kullanici")
      .select("rol")
      .eq("id", user!.id)
      .single();

    if (kullanici?.rol !== "klinik_admin" && kullanici?.rol !== "super_admin") {
      await supabase.auth.signOut();
      return { success: false, message: "Bu hesap yalnızca telefon numarasıyla giriş yapabilir." };
    }

    redirect("/panel");
  }

  // Telefon girişi: personel_giris_epostasi RPC'si telefonu kayıtlı e-postaya
  // çevirir (hasta portalındaki portal_giris_epostasi ile aynı desen), rol
  // klinik_admin/super_admin ise hiç eşleşme dönmez (RPC bilerek dışlıyor).
  const { data: eposta } = await supabase.rpc("personel_giris_epostasi", {
    p_telefon: girisAdi,
  });

  if (!eposta) {
    return { success: false, message: "Telefon veya şifre hatalı." };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: eposta,
    password: sifre,
  });

  if (error) {
    return { success: false, message: "Telefon veya şifre hatalı." };
  }

  redirect("/panel");
}
