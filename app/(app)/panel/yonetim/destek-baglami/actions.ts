"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { pgHata, rpc, withKullanici } from "@/lib/db";
import { oturumBaglami } from "@/lib/auth/gecerli-kullanici";
import { kullaniciGerekli } from "@/lib/auth/oturum";
import { sinirKontrol } from "@/lib/guvenlik/istek-siniri";
import { serbestMetniTemizle } from "@/lib/destek/metin";

type SonucDurumu = { success: boolean; message: string } | null;

const acSemasi = z.strictObject({
  klinik_id: z.string().uuid("Klinik seçilmeli."),
  gerekce: z.string().trim().min(10, "Gerekçe en az 10 karakter olmalı.").max(500, "Gerekçe en fazla 500 karakter olabilir."),
  dakika: z.coerce.number().refine((d) => [15, 30, 60, 120].includes(d), "Süre geçersiz."),
});

/**
 * Destek bağlamı YALNIZ super_admin'in yüzeyidir. Rol burada (kod) ve veritabanı fonksiyonunda (is_super_admin()) AYRI AYRI doğrulanır;
 * `eylemYetkisi` kullanılmaz çünkü "listedeki roller + super_admin" kuralı bu yüzey için yanlış olurdu (klinik_admin buraya giremez).
 */
async function superAdminOturumu() {
  const ctx = await oturumBaglami();
  if (!ctx) redirect("/giris");
  if (ctx.tur !== "personel" || ctx.rol !== "super_admin") return null;
  return ctx;
}

const HATA_MESAJLARI: Record<string, string> = {
  yetkisiz: "Bu işlem için yetkiniz yok.",
  gerekce_gecersiz: "Gerekçe 10-500 karakter olmalı.",
  sure_gecersiz: "Süre geçersiz (5-120 dakika).",
  klinik_bulunamadi: "Klinik bulunamadı.",
};

export async function destekBaglamiAc(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const ctx = await superAdminOturumu();
  if (!ctx) return { success: false, message: "Bu işlem için yetkiniz yok." };

  const sinir = await sinirKontrol("destekBaglami", ctx.userId);
  if (!sinir.izin) return { success: false, message: sinir.mesaj };

  const ayristirma = acSemasi.safeParse({
    klinik_id: formData.get("klinik_id"),
    gerekce: serbestMetniTemizle(String(formData.get("gerekce") ?? "")),
    dakika: formData.get("dakika"),
  });
  if (!ayristirma.success) return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  const g = ayristirma.data;

  try {
    // Kayıt + audit_log satırı veritabanı fonksiyonunda TEK transaction'da yazılır; süre sınırı (≤120 dk) orada da zorlanır.
    await withKullanici(kullaniciGerekli(ctx), (tx) => rpc(tx, "destek_baglami_ac", { p_klinik_id: g.klinik_id, p_gerekce: g.gerekce, p_dakika: g.dakika }));
  } catch (e) {
    const h = pgHata(e);
    console.error("Destek bağlamı açılamadı:", h.mesaj);
    const anahtar = Object.keys(HATA_MESAJLARI).find((k) => h.mesaj.includes(k));
    return { success: false, message: anahtar ? HATA_MESAJLARI[anahtar] : "Destek bağlamı açılamadı, lütfen tekrar deneyin." };
  }
  redirect("/panel");
}

/** Form `action`ı olarak doğrudan kullanılır (dönüş değeri yok). */
export async function destekBaglamiKapat(): Promise<void> {
  const ctx = await superAdminOturumu();
  if (!ctx) return;
  try {
    await withKullanici(kullaniciGerekli(ctx), (tx) => rpc(tx, "destek_baglami_kapat", {}));
  } catch (e) {
    console.error("Destek bağlamı kapatılamadı:", pgHata(e).mesaj);
  }
  redirect("/panel/yonetim/destek-baglami");
}
