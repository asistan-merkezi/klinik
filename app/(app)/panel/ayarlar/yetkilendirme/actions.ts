"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { sema, withTenant } from "@/lib/db";
import { eylemYetkisi, YETKISIZ_MESAJI } from "@/lib/auth/yetki";
import { SIDEBAR_GIZLI_VARSAYILAN_DEPARTMAN, SIDEBAR_YETKI_OGELERI } from "@/lib/panel/menu-gruplari";

type SonucDurumu = { success: boolean; message: string } | null;

const departmanSemasi = z.string().trim().min(1, "Departman zorunlu.");
const anahtarSemasi = z.enum(SIDEBAR_YETKI_OGELERI.map((o) => o.key) as [string, ...string[]]);

/**
 * Ayarlar > Yetkilendirme'deki "Sidebar Menü Görünürlüğü" — QR Kodları/Tablet
 * Ayarları'ndaki aynı read-modify-write deseni: klinik_ayarlar.ayarlar tek
 * jsonb kolonu, "sidebar_gizli" anahtarı { [departman]: gizli_anahtar[] }
 * şeklinde. Departman (rol değil — bkz. lib/panel/menu-gruplari.ts) burada
 * sabit bir enum değil, personel-tanimlama'daki katalogdan gelen serbest bir
 * string; klinik_admin'in Özel Pozisyon Ekle/Personel Tanımlama'dan görüp
 * seçtiği departman adının BİREBİR aynısı olmalı, o yüzden zod'da sadece
 * boş-olmama kontrolü var, sabit enum yok.
 */
export async function sidebarMenuGorunurlukDegistir(
  departmanHam: string,
  anahtarHam: string,
  gorunur: boolean
): Promise<SonucDurumu> {
  const departmanAyristirma = departmanSemasi.safeParse(departmanHam);
  const anahtarAyristirma = anahtarSemasi.safeParse(anahtarHam);
  if (!departmanAyristirma.success || !anahtarAyristirma.success) {
    return { success: false, message: "Geçersiz istek." };
  }
  const departman = departmanAyristirma.data;
  const anahtar = anahtarAyristirma.data;

  // Yalnız klinik_admin (super_admin klinik bağlamı olmadığından eleniyor).
  const yetki = await eylemYetkisi(["klinik_admin"]);
  if (!yetki.yetkili || !yetki.bag || !yetki.klinikId || yetki.ctx.rol !== "klinik_admin") {
    return { success: false, message: YETKISIZ_MESAJI };
  }
  const { bag, klinikId } = yetki;

  try {
    // Read-modify-write TEK transaction'da ve satır kilidiyle (FOR UPDATE): eşzamanlı iki değişiklik birbirini ezmesin.
    await withTenant(bag, async (tx) => {
      const mevcutSatir = await tx
        .select({ ayarlar: sema.klinikAyarlar.ayarlar })
        .from(sema.klinikAyarlar)
        .where(eq(sema.klinikAyarlar.klinikId, klinikId))
        .for("update")
        .limit(1);

      const mevcutAyarlar = (mevcutSatir[0]?.ayarlar as Record<string, unknown> | null) ?? {};
      const mevcutSidebarGizli = (mevcutAyarlar.sidebar_gizli as Record<string, string[]> | undefined) ?? {};
      const mevcutListe = mevcutSidebarGizli[departman] ?? SIDEBAR_GIZLI_VARSAYILAN_DEPARTMAN[departman] ?? [];

      const yeniListe = gorunur
        ? mevcutListe.filter((k) => k !== anahtar)
        : mevcutListe.includes(anahtar)
          ? mevcutListe
          : [...mevcutListe, anahtar];

      const guncelAyarlar = { ...mevcutAyarlar, sidebar_gizli: { ...mevcutSidebarGizli, [departman]: yeniListe } };
      await tx
        .insert(sema.klinikAyarlar)
        .values({ klinikId, ayarlar: guncelAyarlar })
        .onConflictDoUpdate({ target: sema.klinikAyarlar.klinikId, set: { ayarlar: guncelAyarlar } });
    });
  } catch (error) {
    console.error("Sidebar menü görünürlüğü güncellenemedi:", error);
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/ayarlar/yetkilendirme");
  // Sidebar tüm /panel altında ortak layout'tan geliyor — departmanı değişen
  // kullanıcı bir sonraki sayfa geçişinde güncel listeyi görür.
  revalidatePath("/panel", "layout");
  return { success: true, message: gorunur ? "Menü açıldı." : "Menü kapatıldı." };
}
