"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { personelGirisi } from "@/lib/auth";
import { cihazKimligiAl } from "@/lib/auth/next";
import { guvenliDonusAdresi } from "@/lib/auth/donus-adresi";

type GirisSonucu = { success: false; message: string } | never;

/**
 * Personel girişi (Seçenek D): e-posta+parola (klinik_admin/super_admin) veya telefon+parola (diğer roller).
 * Hata mesajları hesap varlığını sızdırmaz; hız sınırı fail-closed (lib/auth/giris.ts). Better Auth çerezleri nextCookies eklentisiyle yazılır.
 */
export async function girisYap(_onceki: GirisSonucu | null, formData: FormData): Promise<GirisSonucu | null> {
  const girisAdi = String(formData.get("giris_adi") ?? "");
  const sifre = String(formData.get("sifre") ?? "");
  const donus = guvenliDonusAdresi(formData.get("donus")) ?? "/panel";

  const sonuc = await personelGirisi({ girisAdi, sifre, basliklar: await headers(), cihazKimligi: await cihazKimligiAl() });
  if (!sonuc.ok) return { success: false, message: sonuc.mesaj };
  // Geçici şifreyle girildiyse şifre değiştirilmeden başka sayfaya geçilemez (proxy de zorlar).
  redirect(sonuc.sifreDegistirmeli ? "/sifre-degistir" : donus);
}
