"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { pgHata, sema, withTenant } from "@/lib/db";
import { eylemYetkisi, YETKISIZ_MESAJI } from "@/lib/auth/yetki";

type SonucDurumu = { success: boolean; message: string } | null;

/** Yalnız klinik_admin (RLS ile aynı küme); tenant ve kullanıcı oturumdan. */
async function adminOturumu() {
  const y = await eylemYetkisi(["klinik_admin"]);
  if (!y.yetkili || !y.bag || !y.klinikId || y.ctx.rol !== "klinik_admin") return null;
  return { bag: y.bag, klinikId: y.klinikId };
}

const UUID = z.string().uuid();

// ---------------------------------------------------------------------
// Pozisyonlar
// ---------------------------------------------------------------------

export async function pozisyonAktifDurumDegistir(pozisyonId: string, yeniDurum: boolean): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return { success: false, message: YETKISIZ_MESAJI };
  if (!UUID.safeParse(pozisyonId).success) return { success: false, message: "Pozisyon bulunamadı." };

  try {
    const g = await withTenant(o.bag, (tx) =>
      tx.update(sema.pozisyonlar).set({ aktif: yeniDurum }).where(and(eq(sema.pozisyonlar.id, pozisyonId), eq(sema.pozisyonlar.klinikId, o.klinikId))).returning({ id: sema.pozisyonlar.id })
    );
    if (g.length === 0) return { success: false, message: "Pozisyon bulunamadı." };
  } catch (e) {
    const h = pgHata(e);
    console.error("Pozisyon durumu değiştirilemedi:", h.mesaj);
    const mesaj = h.mesaj.includes("pozisyon_personel_bagli")
      ? "Bu pozisyonda hâlâ aktif personel var — önce onları başka bir pozisyona taşıyın."
      : "Değiştirilemedi, lütfen tekrar deneyin.";
    return { success: false, message: mesaj };
  }

  revalidatePath("/panel/ayarlar/personel-tanimlama");
  return { success: true, message: yeniDurum ? "Pozisyon aktifleştirildi." : "Pozisyon pasife alındı." };
}

export async function pozisyonSistemErisimiDegistir(pozisyonId: string, yeniDurum: boolean): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return { success: false, message: YETKISIZ_MESAJI };
  if (!UUID.safeParse(pozisyonId).success) return { success: false, message: "Pozisyon bulunamadı." };

  try {
    const g = await withTenant(o.bag, (tx) =>
      tx.update(sema.pozisyonlar).set({ sistemErisimi: yeniDurum }).where(and(eq(sema.pozisyonlar.id, pozisyonId), eq(sema.pozisyonlar.klinikId, o.klinikId))).returning({ id: sema.pozisyonlar.id })
    );
    if (g.length === 0) return { success: false, message: "Pozisyon bulunamadı." };
  } catch (e) {
    console.error("Pozisyon sistem erişimi değiştirilemedi:", pgHata(e).mesaj);
    return { success: false, message: "Değiştirilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/ayarlar/personel-tanimlama");
  return {
    success: true,
    message: yeniDurum ? "Sistem erişimi açıldı." : "Sistem erişimi kapatıldı.",
  };
}

const ozelPozisyonSemasi = z.object({
  grup: z.string().trim().min(1, "Departman seçilmeli."),
  ad: z.string().trim().min(1, "Ünvan zorunlu."),
});

export async function ozelPozisyonOlustur(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return { success: false, message: YETKISIZ_MESAJI };

  const ayristirma = ozelPozisyonSemasi.safeParse({
    grup: formData.get("grup"),
    ad: formData.get("ad"),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { grup, ad } = ayristirma.data;

  try {
    const hata = await withTenant(o.bag, async (tx) => {
      // Rol/ücret tipi/puantaj modu artık ayrıca sorulmuyor — seçilen departmandaki mevcut bir pozisyondan (en küçük sıralı) devralınır.
      const ornek = (
        await tx
          .select({ varsayilanRol: sema.pozisyonlar.varsayilanRol, ucretTipi: sema.pozisyonlar.ucretTipi, puantajModu: sema.pozisyonlar.puantajModu })
          .from(sema.pozisyonlar)
          .where(and(eq(sema.pozisyonlar.klinikId, o.klinikId), eq(sema.pozisyonlar.grup, grup)))
          .orderBy(asc(sema.pozisyonlar.sira))
          .limit(1)
      )[0];
      if (!ornek) return "Departman bulunamadı.";
      await tx.insert(sema.pozisyonlar).values({
        klinikId: o.klinikId,
        ad,
        grup,
        sira: 999,
        sistemErisimi: false,
        varsayilanRol: ornek.varsayilanRol,
        ucretTipi: ornek.ucretTipi,
        puantajModu: ornek.puantajModu,
        ozelMi: true,
      });
      return null;
    });
    if (hata) return { success: false, message: hata };
  } catch (e) {
    const h = pgHata(e);
    console.error("Özel pozisyon oluşturulamadı:", h.mesaj);
    if (h.kod === "23505") {
      return { success: false, message: "Bu isimde bir pozisyon zaten var." };
    }
    return { success: false, message: "Oluşturulamadı, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/ayarlar/personel-tanimlama");
  return { success: true, message: "Özel pozisyon eklendi." };
}
