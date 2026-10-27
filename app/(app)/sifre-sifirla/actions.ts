"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { sifreSifirla } from "@/lib/auth";

type Durum = { success: false; message: string } | null;

/** E-postadaki bağlantıdan gelen tek kullanımlık jetonla yeni şifre. Başarıda giriş ekranına yönlenir (oturum açılmaz; eski oturumlar iptal edilmiştir). */
export async function sifreSifirlaEylemi(_onceki: Durum, formData: FormData): Promise<Durum> {
  const yeni = String(formData.get("yeni_sifre") ?? "");
  if (yeni !== String(formData.get("yeni_sifre_tekrar") ?? "")) return { success: false, message: "Şifreler aynı değil." };
  const sonuc = await sifreSifirla({ jeton: String(formData.get("jeton") ?? ""), yeniSifre: yeni, basliklar: await headers() });
  if (!sonuc.ok) return { success: false, message: sonuc.mesaj };
  redirect("/giris");
}
