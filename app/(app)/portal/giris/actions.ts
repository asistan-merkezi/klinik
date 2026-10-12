"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { oturumKilidiYenile } from "@/lib/auth/oturum-kilidi";
import { GIRIS_KILITLI_MESAJI, girisKilitliMi, hataliGirisKaydet } from "@/lib/auth/giris-hiz-siniri";

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

  if (await girisKilitliMi("portal_giris", telefon)) {
    return { success: false, message: GIRIS_KILITLI_MESAJI };
  }

  const supabase = await createClient();

  const { data: eposta } = await supabase.rpc("portal_giris_epostasi", {
    p_telefon: telefon,
  });

  if (!eposta) {
    await hataliGirisKaydet("portal_giris", telefon);
    return { success: false, message: "Telefon veya şifre hatalı." };
  }

  let { error } = await supabase.auth.signInWithPassword({
    email: eposta,
    password: sifre,
  });

  // Geçici şifre büyük harfli üretilir (bkz. geciciSifreUret); hasta telefonda küçük harfle
  // yazarsa bir kez de büyük harfle denenir.
  if (error && /^[a-z0-9]{8}$/i.test(sifre) && sifre !== sifre.toUpperCase()) {
    ({ error } = await supabase.auth.signInWithPassword({ email: eposta, password: sifre.toUpperCase() }));
  }

  if (error) {
    await hataliGirisKaydet("portal_giris", telefon);
    return { success: false, message: "Telefon veya şifre hatalı." };
  }

  await oturumKilidiYenile(supabase);
  redirect("/portal");
}
