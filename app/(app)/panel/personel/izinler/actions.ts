"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { pgHata, rpc, sema, withTenant, type TenantBaglami } from "@/lib/db";
import { eylemYetkisi, YETKISIZ_MESAJI } from "@/lib/auth/yetki";
import { anlikMesajTetikle } from "@/lib/mesaj/anlik-tetikle";
import { IZIN_DURUM_ETIKETLERI, type IzinDurum } from "@/types/izin";

type SonucDurumu = { success: boolean; message: string } | null;

const UUID = z.string().uuid();

/** İzin onay/red/iptal ve manuel girişler yalnız klinik_admin (RPC'ler de içeride aynı kuralı zorlar). */
async function adminOturumu() {
  const y = await eylemYetkisi(["klinik_admin"]);
  if (!y.yetkili || !y.bag || !y.klinikId || y.ctx.rol !== "klinik_admin") return null;
  return { bag: y.bag, klinikId: y.klinikId };
}

/** Sonuç bildirimi (en iyi çaba): talebi açan personele; kuyruk yazımı kullanıcının kendi tenant bağlamıyla. */
async function sonucBildir(bag: TenantBaglami, talepId: string, durum: IzinDurum) {
  try {
    await withTenant(bag, async (tx) => {
      const t = (
        await tx
          .select({ klinikId: sema.personelIzinTalebi.klinikId, personelId: sema.personel.id, adSoyad: sema.personel.adSoyad, eposta: sema.personel.eposta, telefon: sema.kullanici.telefon, klinikAd: sema.klinik.ad })
          .from(sema.personelIzinTalebi)
          .innerJoin(sema.personel, eq(sema.personel.id, sema.personelIzinTalebi.personelId))
          .leftJoin(sema.kullanici, eq(sema.kullanici.id, sema.personel.kullaniciId))
          .leftJoin(sema.klinik, eq(sema.klinik.id, sema.personelIzinTalebi.klinikId))
          .where(eq(sema.personelIzinTalebi.id, talepId))
          .limit(1)
      )[0];
      if (!t) return;
      await anlikMesajTetikle(tx, {
        klinikId: t.klinikId,
        tetikleyiciKodu: "personel_izin_sonuc",
        aliciTipi: "personel",
        aliciId: t.personelId,
        adres: { telefon: t.telefon ?? null, eposta: t.eposta },
        degiskenler: { personel_adi: t.adSoyad, izin_durumu: IZIN_DURUM_ETIKETLERI[durum], klinik_adi: t.klinikAd ?? "" },
      });
    });
  } catch (e) {
    console.error("İzin sonucu bildirimi gönderilemedi:", pgHata(e).mesaj);
  }
}

export async function izinTalebiOnayla(talepId: string): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return { success: false, message: YETKISIZ_MESAJI };
  if (!UUID.safeParse(talepId).success) return { success: false, message: "Talep bulunamadı." };

  try {
    await withTenant(o.bag, (tx) => rpc(tx, "personel_izin_talebi_onayla", { p_talep_id: talepId }));
  } catch (e) {
    const m = pgHata(e).mesaj;
    console.error("İzin talebi onaylanamadı:", m);
    const mesaj = m.startsWith("donem_kapali")
      ? `Onaylanamadı: ${m.split(":")[1]?.trim() ?? ""} dönemi kapalı, önce dönemi yeniden açın.`
      : m === "gecersiz_durum_gecisi"
        ? "Bu talep artık onaylanamaz (beklemede değil)."
        : "Onaylanamadı, lütfen tekrar deneyin.";
    return { success: false, message: mesaj };
  }

  await sonucBildir(o.bag, talepId, "onaylandi");

  revalidatePath("/panel/personel/izinler");
  revalidatePath("/panel/personel/izinlerim");
  return { success: true, message: "Talep onaylandı, ilgili günlere puantaj kaydı işlendi." };
}

export async function izinTalebiReddet(talepId: string, redGerekce: string): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return { success: false, message: YETKISIZ_MESAJI };
  if (!UUID.safeParse(talepId).success) return { success: false, message: "Talep bulunamadı." };

  if (!redGerekce.trim()) {
    return { success: false, message: "Red gerekçesi zorunlu." };
  }

  try {
    await withTenant(o.bag, (tx) => rpc(tx, "personel_izin_talebi_reddet", { p_talep_id: talepId, p_red_gerekce: redGerekce.trim() }));
  } catch (e) {
    const m = pgHata(e).mesaj;
    console.error("İzin talebi reddedilemedi:", m);
    return { success: false, message: m === "gecersiz_durum_gecisi" ? "Bu talep artık reddedilemez (beklemede değil)." : "Reddedilemedi, lütfen tekrar deneyin." };
  }

  await sonucBildir(o.bag, talepId, "reddedildi");

  revalidatePath("/panel/personel/izinler");
  revalidatePath("/panel/personel/izinlerim");
  return { success: true, message: "Talep reddedildi." };
}

export async function izinTalebiYoneticiIptalEt(talepId: string): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return { success: false, message: YETKISIZ_MESAJI };
  if (!UUID.safeParse(talepId).success) return { success: false, message: "Talep bulunamadı." };

  try {
    await withTenant(o.bag, (tx) => rpc(tx, "personel_izin_talebi_yonetici_iptal", { p_talep_id: talepId }));
  } catch (e) {
    const m = pgHata(e).mesaj;
    console.error("Onaylı izin iptal edilemedi:", m);
    const mesaj =
      m === "izin_baslamis"
        ? "İzin zaten başladığı için iptal edilemez."
        : m === "gecersiz_durum_gecisi"
          ? "Bu talep artık iptal edilemez (onaylı değil)."
          : "İptal edilemedi, lütfen tekrar deneyin.";
    return { success: false, message: mesaj };
  }

  revalidatePath("/panel/personel/izinler");
  revalidatePath("/panel/personel/izinlerim");
  return { success: true, message: "Onaylı izin iptal edildi, ilgili puantaj kayıtları geri alındı." };
}

const manuelIzinSemasi = z.object({
  personel_id: z.string().uuid("Personel seçilmeli."),
  tip: z.enum(["yillik", "mazeret", "ucretsiz", "idari", "telafi"]),
  baslangic_tarih: z.string().min(1, "Başlangıç tarihi seçilmeli."),
  bitis_tarih: z.string().min(1, "Bitiş tarihi seçilmeli."),
  gerekce: z.string().trim().optional(),
});

/**
 * Yönetici bir personel adına doğrudan izin girer — mevcut talep oluştur +
 * onayla RPC'lerini (personel_izin_talep_olustur, personel_izin_talebi_onayla)
 * arka arkaya çağırır, kendi başına onay bekleyecek bir talep bırakmaz.
 * Oluşturma ve onay AYRI transaction'lardır (bilinçli): onay "dönem kapalı" ile
 * başarısız olursa talep beklemede kalır ve yönetici listeden elle onaylar.
 */
export async function manuelIzinEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return { success: false, message: YETKISIZ_MESAJI };

  const ayristirma = manuelIzinSemasi.safeParse({
    personel_id: formData.get("personel_id"),
    tip: formData.get("tip"),
    baslangic_tarih: formData.get("baslangic_tarih"),
    bitis_tarih: formData.get("bitis_tarih"),
    gerekce: formData.get("gerekce") ?? "",
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { personel_id, tip, baslangic_tarih, bitis_tarih, gerekce } = ayristirma.data;

  let talepId: string | undefined;
  try {
    const r = await withTenant(o.bag, (tx) =>
      rpc<{ personel_izin_talep_olustur: string }>(tx, "personel_izin_talep_olustur", {
        p_personel_id: personel_id,
        p_tip: tip,
        p_baslangic_tarih: baslangic_tarih,
        p_bitis_tarih: bitis_tarih,
        p_gerekce: gerekce ? gerekce : "Yönetici tarafından girildi.",
        p_belge_url: null,
      })
    );
    talepId = r[0]?.personel_izin_talep_olustur;
  } catch (e) {
    const m = pgHata(e).mesaj;
    console.error("Manuel izin talebi oluşturulamadı:", m);
    const mesaj =
      m === "gun_sayisi_sifir"
        ? "Seçilen tarih aralığında hiç iş günü yok (hafta tatili/resmi tatil)."
        : m === "tarih_araligi_gecersiz"
          ? "Bitiş tarihi başlangıçtan önce olamaz."
          : "İzin eklenemedi, lütfen tekrar deneyin.";
    return { success: false, message: mesaj };
  }
  if (!talepId) return { success: false, message: "İzin eklenemedi, lütfen tekrar deneyin." };

  let onayHata: string | null = null;
  try {
    await withTenant(o.bag, (tx) => rpc(tx, "personel_izin_talebi_onayla", { p_talep_id: talepId }));
  } catch (e) {
    onayHata = pgHata(e).mesaj;
    console.error("Manuel izin onaylanamadı:", onayHata);
  }

  revalidatePath("/panel/personel/izinler");
  revalidatePath("/panel/personel/izinlerim");
  revalidatePath("/panel/personel/puantaj-cetveli");

  if (onayHata !== null) {
    const mesaj = onayHata.startsWith("donem_kapali")
      ? `Talep oluşturuldu ama onaylanamadı: ${onayHata.split(":")[1]?.trim() ?? ""} dönemi kapalı — önce dönemi yeniden açın, sonra listeden onaylayın.`
      : "Talep oluşturuldu ama onaylanamadı, aşağıdaki listeden elle onaylayın.";
    return { success: false, message: mesaj };
  }

  return { success: true, message: "İzin eklendi ve onaylandı." };
}

const manuelRaporSemasi = z.object({
  personel_id: z.string().uuid("Personel seçilmeli."),
  baslangic_tarih: z.string().min(1, "Başlangıç tarihi seçilmeli."),
  bitis_tarih: z.string().min(1, "Bitiş tarihi seçilmeli."),
  not_metni: z.string().trim().optional(),
});

/**
 * "Raporlu" için izin_talebi benzeri ayrı bir tablo/RPC yok — personel_puantaj
 * satırlarına doğrudan yazıyoruz (RLS zaten klinik_admin + açık dönem şartını
 * uyguluyor, bkz. puantaj-cetveli/actions.ts'teki gunKaydet ile aynı desen).
 * Hafta tatili/resmi tatil günleri JS'de elenip hiç yazılmaz; tüm günler TEK ifadede yazılır (kısmi yazma yok).
 */
export async function manuelRaporEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return { success: false, message: YETKISIZ_MESAJI };

  const ayristirma = manuelRaporSemasi.safeParse({
    personel_id: formData.get("personel_id"),
    baslangic_tarih: formData.get("baslangic_tarih"),
    bitis_tarih: formData.get("bitis_tarih"),
    not_metni: formData.get("not_metni") ?? "",
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { personel_id, baslangic_tarih, bitis_tarih, not_metni } = ayristirma.data;

  if (bitis_tarih < baslangic_tarih) {
    return { success: false, message: "Bitiş tarihi başlangıçtan önce olamaz." };
  }
  // İzin talebindeki (personel_izin_is_gunu_sayisi) 366 gün sınırıyla aynı: yanlış girilmiş bir aralık binlerce puantaj satırı yazmasın.
  if (Date.parse(`${bitis_tarih}T00:00:00Z`) - Date.parse(`${baslangic_tarih}T00:00:00Z`) > 366 * 86_400_000) {
    return { success: false, message: "Rapor aralığı en fazla 1 yıl olabilir." };
  }

  try {
    const sonuc = await withTenant(o.bag, async (tx) => {
      const personel = (await tx.select({ klinikId: sema.personel.klinikId }).from(sema.personel).where(eq(sema.personel.id, personel_id)).limit(1))[0];
      if (!personel || personel.klinikId !== o.klinikId) return { hata: "Personel bulunamadı." };

      const klinik = (await tx.select({ cumartesi: sema.klinik.cumartesiBaslangic, pazar: sema.klinik.pazarBaslangic }).from(sema.klinik).where(eq(sema.klinik.id, o.klinikId)).limit(1))[0];
      const resmi = await tx.select({ tarih: sema.resmiTatil.tarih }).from(sema.resmiTatil).where(and(gte(sema.resmiTatil.tarih, baslangic_tarih), lte(sema.resmiTatil.tarih, bitis_tarih)));
      const resmiTatilSet = new Set(resmi.map((r) => r.tarih));

      const gunler: string[] = [];
      const cursor = new Date(`${baslangic_tarih}T00:00:00Z`);
      const bitisDate = new Date(`${bitis_tarih}T00:00:00Z`);
      while (cursor.getTime() <= bitisDate.getTime()) {
        const iso = cursor.toISOString().slice(0, 10);
        const dow = cursor.getUTCDay();
        const kapaliHaftaSonu = (dow === 0 && !klinik?.pazar) || (dow === 6 && !klinik?.cumartesi);
        if (!kapaliHaftaSonu && !resmiTatilSet.has(iso)) gunler.push(iso);
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      if (gunler.length === 0) return { hata: "Seçilen tarih aralığında hiç iş günü yok (hafta tatili/resmi tatil)." };

      // İzin talebinden gelen günlerin üzerine sessizce yazılmaz — düzeltme ilgili izin talebi üzerinden yapılmalı.
      const izinKaynakli = await tx
        .select({ tarih: sema.personelPuantaj.tarih })
        .from(sema.personelPuantaj)
        .where(and(eq(sema.personelPuantaj.personelId, personel_id), eq(sema.personelPuantaj.kaynak, "izin_talebi"), inArray(sema.personelPuantaj.tarih, gunler)));
      if (izinKaynakli.length > 0) return { hata: "Bu aralıkta onaylı izin günleri var — önce ilgili izin talebi üzerinden düzenleyin." };

      await tx
        .insert(sema.personelPuantaj)
        .values(gunler.map((tarih) => ({ klinikId: o.klinikId, personelId: personel_id, tarih, durum: "raporlu", kaynak: "manuel", molaDakika: 0, notMetni: not_metni || null, girisSaat: null, cikisSaat: null })))
        .onConflictDoUpdate({
          target: [sema.personelPuantaj.personelId, sema.personelPuantaj.tarih],
          set: { durum: "raporlu", kaynak: "manuel", molaDakika: 0, notMetni: not_metni || null, girisSaat: null, cikisSaat: null },
        });
      return { gun: gunler.length };
    });
    if ("hata" in sonuc) return { success: false, message: sonuc.hata ?? "Eklenemedi." };

    revalidatePath("/panel/personel/izinler");
    revalidatePath("/panel/personel/puantaj-cetveli");
    revalidatePath(`/panel/personel/${personel_id}`);
    return { success: true, message: `${sonuc.gun} gün raporlu olarak işlendi.` };
  } catch (e) {
    const h = pgHata(e);
    console.error("Manuel rapor eklenemedi:", h.mesaj);
    if (h.kod === "42501" || h.mesaj.includes("row-level security")) {
      return { success: false, message: "Bu aralıktaki bazı aylar dönem kapalı olduğu için işlenemedi." };
    }
    return { success: false, message: "Eklenemedi, lütfen tekrar deneyin." };
  }
}
