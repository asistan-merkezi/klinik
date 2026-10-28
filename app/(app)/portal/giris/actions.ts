"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { hastaGirisi } from "@/lib/auth";
import { GECERSIZ_FORM_MESAJI, formAlanlari, portalGirisFormuSemasi } from "@/lib/guvenlik/girdi";
import { cihazKimligiAl } from "@/lib/auth/next";

type GirisSonucu = { success: false; message: string } | null;

/** Hasta portalı girişi: (klinik kısa kodu, telefon) + parola. Klinik tanima şemasından çözülür; hasta telefonu klinikler arası tekil değildir. */
export async function portalGirisYap(_onceki: GirisSonucu, formData: FormData): Promise<GirisSonucu> {
  const g = portalGirisFormuSemasi.safeParse(formAlanlari(formData, ["klinik_kodu", "telefon", "sifre"]));
  if (!g.success) return { success: false, message: GECERSIZ_FORM_MESAJI };
  const sonuc = await hastaGirisi({
    klinikKodu: g.data.klinik_kodu,
    telefon: g.data.telefon,
    sifre: g.data.sifre,
    basliklar: await headers(),
    cihazKimligi: await cihazKimligiAl(),
  });
  if (!sonuc.ok) return { success: false, message: sonuc.mesaj };
  redirect(sonuc.sifreDegistirmeli ? "/sifre-degistir" : "/portal");
}
