"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { hastaGirisi } from "@/lib/auth";
import { cihazKimligiAl } from "@/lib/auth/next";

type GirisSonucu = { success: false; message: string } | null;

/** Hasta portalı girişi: (klinik kısa kodu, telefon) + parola. Klinik tanima şemasından çözülür; hasta telefonu klinikler arası tekil değildir. */
export async function portalGirisYap(_onceki: GirisSonucu, formData: FormData): Promise<GirisSonucu> {
  const sonuc = await hastaGirisi({
    klinikKodu: String(formData.get("klinik_kodu") ?? "").trim(),
    telefon: String(formData.get("telefon") ?? ""),
    sifre: String(formData.get("sifre") ?? ""),
    basliklar: await headers(),
    cihazKimligi: await cihazKimligiAl(),
  });
  if (!sonuc.ok) return { success: false, message: sonuc.mesaj };
  redirect(sonuc.sifreDegistirmeli ? "/sifre-degistir" : "/portal");
}
