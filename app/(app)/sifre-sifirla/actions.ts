"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { GECERSIZ_FORM_MESAJI, formAlanlari, sifreSifirlaFormuSemasi } from "@/lib/guvenlik/girdi";
import { sifreSifirla } from "@/lib/auth";

type Durum = { success: false; message: string } | null;

/** E-postadaki bağlantıdan gelen tek kullanımlık jetonla yeni şifre. Başarıda giriş ekranına yönlenir (oturum açılmaz; eski oturumlar iptal edilmiştir). */
export async function sifreSifirlaEylemi(_onceki: Durum, formData: FormData): Promise<Durum> {
  const g = sifreSifirlaFormuSemasi.safeParse(formAlanlari(formData, ["jeton", "yeni_sifre", "yeni_sifre_tekrar"]));
  if (!g.success) return { success: false, message: GECERSIZ_FORM_MESAJI };
  const yeni = g.data.yeni_sifre;
  if (yeni !== g.data.yeni_sifre_tekrar) return { success: false, message: "Şifreler aynı değil." };
  const sonuc = await sifreSifirla({ jeton: g.data.jeton, yeniSifre: yeni, basliklar: await headers() });
  if (!sonuc.ok) return { success: false, message: sonuc.mesaj };
  redirect("/giris");
}
