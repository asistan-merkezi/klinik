"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { pgHata, sema, withTenant } from "@/lib/db";
import { eylemYetkisi, YETKISIZ_MESAJI } from "@/lib/auth/yetki";
import { randevuKimlikleriniDogrula } from "@/lib/randevu/dogrulama";

type SonucDurumu = { success: boolean; message: string } | null;

const adimSemasi = z.object({
  islem_tanimi_id: z.string().uuid(),
  not: z.string(),
});

const protokolSemasi = z.object({
  ad: z.string().trim().min(2, "Ad en az 2 karakter olmalı."),
  aciklama: z.string().trim().optional(),
  adimlar: z.array(adimSemasi).min(1, "En az bir tedavi adımı ekleyin."),
});

/** Protokol yönetimi yalnız klinik_admin (RLS tedavi_protokolu_yonet_admin ile aynı). */
async function yetkiAl() {
  const y = await eylemYetkisi(["klinik_admin"]);
  if (!y.yetkili || !y.bag || !y.klinikId || y.ctx.rol !== "klinik_admin") return null;
  return { bag: y.bag, klinikId: y.klinikId };
}

function ayristir(formData: FormData) {
  let adimlar: unknown = [];
  try {
    adimlar = JSON.parse((formData.get("adimlar_json") as string | null) ?? "[]");
  } catch {
    adimlar = [];
  }

  return protokolSemasi.safeParse({
    ad: formData.get("ad"),
    aciklama: formData.get("aciklama") ?? "",
    adimlar,
  });
}

export async function tedaviProtokoluOlustur(
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const y = await yetkiAl();
  if (!y) return { success: false, message: YETKISIZ_MESAJI };

  const ayristirma = ayristir(formData);
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }
  const { ad, aciklama, adimlar } = ayristirma.data;

  try {
    // Protokol + adımlar TEK transaction (eskiden adım hatasında protokol elle silinirdi).
    const sonuc = await withTenant(y.bag, async (tx) => {
      for (const a of adimlar) {
        if (await randevuKimlikleriniDogrula(tx, { islemTanimiId: a.islem_tanimi_id })) return { hata: "Seçilen tedavi bulunamadı." };
      }
      const [protokol] = await tx.insert(sema.tedaviProtokolu).values({ klinikId: y.klinikId, ad, aciklama: aciklama ? aciklama : null }).returning({ id: sema.tedaviProtokolu.id });
      await tx.insert(sema.tedaviProtokoluAdimi).values(
        adimlar.map((adim, index) => ({ klinikId: y.klinikId, tedaviProtokoluId: protokol.id, islemTanimiId: adim.islem_tanimi_id, sira: index + 1, adimNotu: adim.not.trim() ? adim.not.trim() : null }))
      );
      return { tamam: true as const };
    });
    if ("hata" in sonuc) return { success: false, message: sonuc.hata ?? "Tedavi protokolü eklenemedi." };
  } catch (e) {
    console.error("Tedavi protokolü oluşturulamadı:", pgHata(e).mesaj);
    return { success: false, message: "Tedavi protokolü eklenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/tedavi-protokolleri");
  return { success: true, message: "Tedavi protokolü eklendi." };
}

export async function tedaviProtokoluGuncelle(
  protokolId: string,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const y = await yetkiAl();
  if (!y) return { success: false, message: YETKISIZ_MESAJI };
  if (!z.string().uuid().safeParse(protokolId).success) return { success: false, message: "Tedavi protokolü bulunamadı." };

  const ayristirma = ayristir(formData);
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }
  const { ad, aciklama, adimlar } = ayristirma.data;

  try {
    // Güncelleme + adımların yeniden yazımı TEK transaction: yarıda hata kalırsa eski adımlar korunur (eskiden silindikten sonra ekleme düşebilirdi).
    const sonuc = await withTenant(y.bag, async (tx) => {
      for (const a of adimlar) {
        if (await randevuKimlikleriniDogrula(tx, { islemTanimiId: a.islem_tanimi_id })) return { hata: "Seçilen tedavi bulunamadı." };
      }
      const g = await tx.update(sema.tedaviProtokolu).set({ ad, aciklama: aciklama ? aciklama : null }).where(eq(sema.tedaviProtokolu.id, protokolId)).returning({ id: sema.tedaviProtokolu.id });
      if (g.length === 0) return { hata: "Tedavi protokolü bulunamadı." };
      await tx.delete(sema.tedaviProtokoluAdimi).where(eq(sema.tedaviProtokoluAdimi.tedaviProtokoluId, protokolId));
      await tx.insert(sema.tedaviProtokoluAdimi).values(
        adimlar.map((adim, index) => ({ klinikId: y.klinikId, tedaviProtokoluId: protokolId, islemTanimiId: adim.islem_tanimi_id, sira: index + 1, adimNotu: adim.not.trim() ? adim.not.trim() : null }))
      );
      return { tamam: true as const };
    });
    if ("hata" in sonuc) return { success: false, message: sonuc.hata ?? "Tedavi protokolü güncellenemedi." };
  } catch (e) {
    console.error("Tedavi protokolü güncellenemedi:", pgHata(e).mesaj);
    return { success: false, message: "Tedavi protokolü güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/tedavi-protokolleri");
  return { success: true, message: "Tedavi protokolü güncellendi." };
}

export async function tedaviProtokoluAktifDurumDegistir(protokolId: string, yeniDurum: boolean) {
  const y = await yetkiAl();
  if (!y || !z.string().uuid().safeParse(protokolId).success) return;

  try {
    await withTenant(y.bag, (tx) => tx.update(sema.tedaviProtokolu).set({ aktif: yeniDurum }).where(eq(sema.tedaviProtokolu.id, protokolId)));
  } catch (e) {
    console.error("Tedavi protokolü durumu güncellenemedi:", pgHata(e).mesaj);
    return;
  }

  revalidatePath("/panel/tedavi-protokolleri");
}
