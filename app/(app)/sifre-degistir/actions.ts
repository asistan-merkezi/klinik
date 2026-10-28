"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { GECERSIZ_FORM_MESAJI, formAlanlari, sifreDegistirFormuSemasi } from "@/lib/guvenlik/girdi";
import { oturumOku, sifreDegistir } from "@/lib/auth";

type Durum = { success: false; message: string } | null;

/** Kendi şifresini değiştirme (geçici şifreyle girenler için zorunlu adım). Diğer oturumlar iptal edilir; bu cihaz için yeni oturum çerezi yazılır. */
export async function sifreDegistirEylemi(_onceki: Durum, formData: FormData): Promise<Durum> {
  const g = sifreDegistirFormuSemasi.safeParse(formAlanlari(formData, ["mevcut_sifre", "yeni_sifre", "yeni_sifre_tekrar"]));
  if (!g.success) return { success: false, message: GECERSIZ_FORM_MESAJI };
  const { mevcut_sifre: mevcut, yeni_sifre: yeni, yeni_sifre_tekrar: tekrar } = g.data;
  if (yeni !== tekrar) return { success: false, message: "Yeni şifreler aynı değil." };
  const basliklar = await headers();
  const o = await oturumOku(basliklar);
  if (!o) redirect("/giris");
  const sonuc = await sifreDegistir({ basliklar, mevcutSifre: mevcut, yeniSifre: yeni });
  if (!sonuc.ok) return { success: false, message: sonuc.mesaj };
  redirect(o.user.tur === "hasta" ? "/portal" : "/panel");
}
