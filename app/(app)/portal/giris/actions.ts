"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type GirisSonucu = { success: false; message: string } | null;

export async function portalGirisYap(
  _onceki: GirisSonucu,
  formData: FormData
): Promise<GirisSonucu> {
  const telefon = String(formData.get("telefon") ?? "").trim();
  const sifre = String(formData.get("sifre") ?? "");

  if (!telefon || !sifre) {
    return { success: false, message: "Telefon ve şifre gerekli." };
  }

  const supabase = await createClient();

  const { data: eposta } = await supabase.rpc("portal_giris_epostasi", {
    p_telefon: telefon,
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

  redirect("/portal");
}
