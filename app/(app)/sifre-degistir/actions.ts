"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { oturumOku, sifreDegistir } from "@/lib/auth";

type Durum = { success: false; message: string } | null;

/** Kendi şifresini değiştirme (geçici şifreyle girenler için zorunlu adım). Diğer oturumlar iptal edilir; bu cihaz için yeni oturum çerezi yazılır. */
export async function sifreDegistirEylemi(_onceki: Durum, formData: FormData): Promise<Durum> {
  const mevcut = String(formData.get("mevcut_sifre") ?? "");
  const yeni = String(formData.get("yeni_sifre") ?? "");
  const tekrar = String(formData.get("yeni_sifre_tekrar") ?? "");
  if (yeni !== tekrar) return { success: false, message: "Yeni şifreler aynı değil." };
  const basliklar = await headers();
  const o = await oturumOku(basliklar);
  if (!o) redirect("/giris");
  const sonuc = await sifreDegistir({ basliklar, mevcutSifre: mevcut, yeniSifre: yeni });
  if (!sonuc.ok) return { success: false, message: sonuc.mesaj };
  redirect(o.user.tur === "hasta" ? "/portal" : "/panel");
}
