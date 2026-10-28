"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { pgHata, sema, withTenant } from "@/lib/db";
import { finansOturumu } from "@/lib/finans/eylem";
import { YETKISIZ_MESAJI } from "@/lib/auth/yetki";

type SonucDurumu = { success: boolean; message: string } | null;

// Yüzde oranı (para değil): en çok iki ondalık, 0-100. DB numeric(5,2) ve CHECK ile aynı aralık.
const yuzdeSemasi = z.coerce
  .number()
  .min(0, "0-100 arasında olmalı.")
  .max(100, "0-100 arasında olmalı.")
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "En fazla iki ondalık basamak girilebilir.");

const oranlarSemasi = z.object({
  vita_pct: yuzdeSemasi,
  plus_pct: yuzdeSemasi,
  elit_pct: yuzdeSemasi,
  prime_pct: yuzdeSemasi,
});

export async function iskontoOranlariGuncelle(
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const o = await finansOturumu(["klinik_admin"]);
  if (!o) {
    return { success: false, message: YETKISIZ_MESAJI };
  }

  const ayristirma = oranlarSemasi.safeParse({
    vita_pct: formData.get("vita_pct"),
    plus_pct: formData.get("plus_pct"),
    elit_pct: formData.get("elit_pct"),
    prime_pct: formData.get("prime_pct"),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const d = ayristirma.data;
  const degerler = { vitaPct: d.vita_pct.toFixed(2), plusPct: d.plus_pct.toFixed(2), elitPct: d.elit_pct.toFixed(2), primePct: d.prime_pct.toFixed(2) };
  try {
    await withTenant(o.bag, (tx) =>
      tx.insert(sema.iskontoOranlari).values({ klinikId: o.klinikId, ...degerler }).onConflictDoUpdate({ target: sema.iskontoOranlari.klinikId, set: degerler })
    );
  } catch (e) {
    console.error("İskonto oranları güncellenemedi:", pgHata(e).mesaj);
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/finans/kategori-iskonto-oranlari");
  return { success: true, message: "İskonto oranları kaydedildi." };
}
