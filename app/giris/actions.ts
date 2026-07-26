"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type GirisSonucu = { success: false; message: string } | never;

export async function girisYap(
  _onceki: GirisSonucu | null,
  formData: FormData
): Promise<GirisSonucu | null> {
  const eposta = String(formData.get("eposta") ?? "").trim();
  const sifre = String(formData.get("sifre") ?? "");

  if (!eposta || !sifre) {
    return { success: false, message: "E-posta ve şifre gerekli." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: eposta,
    password: sifre,
  });

  if (error) {
    return { success: false, message: "E-posta veya şifre hatalı." };
  }

  redirect("/panel");
}
