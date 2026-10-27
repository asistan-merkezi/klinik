"use server";

import { headers } from "next/headers";
import { sifremiUnuttum } from "@/lib/auth";

type Durum = { mesaj: string } | null;

/** Personel "şifremi unuttum": her durumda AYNI yanıt (hesap varlığı sızmaz). E-posta yalnız bağlantı içerir. */
export async function sifremiUnuttumEylemi(_onceki: Durum, formData: FormData): Promise<Durum> {
  const taban = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return sifremiUnuttum({ eposta: String(formData.get("eposta") ?? ""), basliklar: await headers(), geriDonusAdresi: `${taban}/sifre-sifirla` });
}
