"use server";

import { headers } from "next/headers";
import { formAlanlari, sifremiUnuttumFormuSemasi } from "@/lib/guvenlik/girdi";
import { sifremiUnuttum } from "@/lib/auth";

type Durum = { mesaj: string } | null;

/** Personel "şifremi unuttum": her durumda AYNI yanıt (hesap varlığı sızmaz). E-posta yalnız bağlantı içerir. */
export async function sifremiUnuttumEylemi(_onceki: Durum, formData: FormData): Promise<Durum> {
  const taban = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const g = sifremiUnuttumFormuSemasi.safeParse(formAlanlari(formData, ["eposta"]));
  // Geçersiz girdi de AYNI ortak yanıtı alır (hesap/biçim ayrımı sızmaz); işlem yapılmaz.
  if (!g.success) return sifremiUnuttum({ eposta: "", basliklar: await headers(), geriDonusAdresi: `${taban}/sifre-sifirla` });
  return sifremiUnuttum({ eposta: g.data.eposta, basliklar: await headers(), geriDonusAdresi: `${taban}/sifre-sifirla` });
}
