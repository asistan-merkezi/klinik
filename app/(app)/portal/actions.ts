"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { count, and, eq } from "drizzle-orm";
import { pgHata, sema, snakeKolonlari, withTenant } from "@/lib/db";
import { gecerliHastaBaglami } from "@/lib/auth/gecerli-hasta";
import { bugunIstanbulTarihi } from "@/lib/datetime";

type SonucDurumu = { success: boolean; message: string } | null;

function bosIseNull(deger: FormDataEntryValue | null) {
  if (deger == null) return null;
  const s = String(deger).trim();
  return s === "" ? null : s;
}

const bilgilerSemasi = z.object({
  cinsiyet: z.enum(["kadin", "erkek", "belirtilmemis"]).nullable(),
  eposta: z.string().trim().email("Geçersiz e-posta.").nullable(),
  referans_kanali: z.string().nullable(),
  kimlik_no: z.string().nullable(),
  kimlik_no_tipi: z.enum(["tc", "pasaport"]).nullable(),
  il: z.string().nullable(),
  ilce: z.string().nullable(),
  mahalle: z.string().nullable(),
  adres: z.string().nullable(),
  acil_durum_ad_soyad: z.string().nullable(),
  acil_durum_yakinlik: z.string().nullable(),
  acil_durum_telefon: z.string().nullable(),
  kronik_hastaliklar: z.string().nullable(),
  surekli_ilaclar: z.string().nullable(),
  alerjiler: z.string().nullable(),
  gecirilmis_ameliyatlar: z.string().nullable(),
  gelis_sebebi: z.string().nullable(),
  kan_sulandirici_kullanimi: z.coerce.boolean(),
  ticari_ileti_onay: z.coerce.boolean(),
  saglik_riza: z.coerce.boolean(),
});

/**
 * Portal hastasının kimliği ve tenant bağlamı OTURUMDAN gelir; hiçbir eylem istemciden hasta/klinik kimliği ALMAZ.
 * (Başka hastanın id'siyle istek yapmanın yolu yoktur; ayrıca RLS `current_hasta_id()` ikinci kilittir.)
 */
async function hastaOturumu() {
  const o = await gecerliHastaBaglami();
  if (!o) redirect("/portal/giris");
  return o;
}

export async function bilgileriGuncelle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const { bag, hastaId } = await hastaOturumu();

  const ayristirma = bilgilerSemasi.safeParse({
    cinsiyet: bosIseNull(formData.get("cinsiyet")),
    eposta: bosIseNull(formData.get("eposta")),
    referans_kanali: bosIseNull(formData.get("referans_kanali")),
    kimlik_no: bosIseNull(formData.get("kimlik_no")),
    kimlik_no_tipi: bosIseNull(formData.get("kimlik_no_tipi")),
    il: bosIseNull(formData.get("adres_il")),
    ilce: bosIseNull(formData.get("adres_ilce")),
    mahalle: bosIseNull(formData.get("adres_mahalle")),
    adres: bosIseNull(formData.get("adres")),
    acil_durum_ad_soyad: bosIseNull(formData.get("acil_durum_ad_soyad")),
    acil_durum_yakinlik: bosIseNull(formData.get("acil_durum_yakinlik")),
    acil_durum_telefon: bosIseNull(formData.get("acil_durum_telefon")),
    kronik_hastaliklar: bosIseNull(formData.get("kronik_hastaliklar")),
    surekli_ilaclar: bosIseNull(formData.get("surekli_ilaclar")),
    alerjiler: bosIseNull(formData.get("alerjiler")),
    gecirilmis_ameliyatlar: bosIseNull(formData.get("gecirilmis_ameliyatlar")),
    gelis_sebebi: bosIseNull(formData.get("gelis_sebebi")),
    kan_sulandirici_kullanimi: formData.get("kan_sulandirici_kullanimi") === "on",
    ticari_ileti_onay: formData.get("ticari_ileti_onay") === "on",
    saglik_riza: formData.get("saglik_riza") === "on",
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const {
    cinsiyet,
    eposta,
    referans_kanali,
    kimlik_no,
    kimlik_no_tipi,
    il,
    ilce,
    mahalle,
    adres,
    acil_durum_ad_soyad,
    acil_durum_yakinlik,
    acil_durum_telefon,
    kronik_hastaliklar,
    surekli_ilaclar,
    alerjiler,
    gecirilmis_ameliyatlar,
    gelis_sebebi,
    kan_sulandirici_kullanimi,
    ticari_ileti_onay,
    saglik_riza,
  } = ayristirma.data;

  let saglikRizaVar = false;
  try {
    await withTenant(bag, async (tx) => {
      const mevcutHasta = (
        await tx
          .select({ ozel: sema.hasta.ozelNitelikliVeriOnayTarihi, ticari: sema.hasta.ticariIletiOnayTarihi, klinikId: sema.hasta.klinikId })
          .from(sema.hasta)
          .where(eq(sema.hasta.id, hastaId))
          .limit(1)
      )[0];
      if (!mevcutHasta) throw new Error("hasta_bulunamadi");

      saglikRizaVar = saglik_riza || Boolean(mevcutHasta.ozel);
      // Onaylayan sadece bu onay İLK KEZ (daha önce personel tarafından verilmemişken)
      // hastanın kendisi tarafından verildiğinde 'hasta' olarak işaretlenir — personelin
      // daha önce kağıt formla aldığı bir onayın üzerine hastanın portaldan tekrar
      // "onaylıyorum" göndermesi mevcut onaylayan kaydını değiştirmez.
      const yeniTicariOnay = ticari_ileti_onay && !mevcutHasta.ticari;
      const yeniSaglikRizasi = saglik_riza && !mevcutHasta.ozel;

      const hassasKayit: Record<string, string | boolean | null> = {
        kimlik_no,
        kimlik_no_tipi,
        il,
        ilce,
        mahalle,
        adres,
        acil_durum_ad_soyad,
        acil_durum_yakinlik,
        acil_durum_telefon,
      };
      if (saglikRizaVar) {
        hassasKayit.kronik_hastaliklar = kronik_hastaliklar;
        hassasKayit.surekli_ilaclar = surekli_ilaclar;
        hassasKayit.alerjiler = alerjiler;
        hassasKayit.gecirilmis_ameliyatlar = gecirilmis_ameliyatlar;
        hassasKayit.gelis_sebebi = gelis_sebebi;
        hassasKayit.kan_sulandirici_kullanimi = kan_sulandirici_kullanimi;
      }
      const hassasDegerler = snakeKolonlari(sema.hastaHassas, hassasKayit);

      // hasta + hasta_hassas TEK transaction (eskiden iki bağımsız çağrı). Portal hastası yalnız portal formunun alanlarını güncelleyebilir (DB tetikleyicisi).
      await tx
        .update(sema.hasta)
        .set({
          cinsiyet,
          eposta,
          referansKanali: referans_kanali,
          ticariIletiOnayTarihi: ticari_ileti_onay ? mevcutHasta.ticari ?? new Date().toISOString() : null,
          ozelNitelikliVeriOnayTarihi: saglikRizaVar ? mevcutHasta.ozel ?? new Date().toISOString() : mevcutHasta.ozel ?? null,
          ...(yeniTicariOnay ? { ticariIletiOnaylayanTip: "hasta", ticariIletiOnaylayanKullaniciId: null } : {}),
          ...(yeniSaglikRizasi ? { ozelNitelikliOnaylayanTip: "hasta", ozelNitelikliOnaylayanKullaniciId: null } : {}),
        })
        .where(eq(sema.hasta.id, hastaId));
      await tx
        .insert(sema.hastaHassas)
        .values({ hastaId, klinikId: mevcutHasta.klinikId, ...hassasDegerler })
        .onConflictDoUpdate({ target: sema.hastaHassas.hastaId, set: hassasDegerler });
    });
  } catch (e) {
    console.error("Bilgiler güncellenemedi:", pgHata(e).mesaj);
    return { success: false, message: "Bilgiler kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/portal/bilgilerim");

  if (
    !saglikRizaVar &&
    (kronik_hastaliklar || surekli_ilaclar || alerjiler || gecirilmis_ameliyatlar || gelis_sebebi || kan_sulandirici_kullanimi)
  ) {
    return {
      success: true,
      message:
        "Diğer bilgiler kaydedildi; sağlık geçmişinizin kaydedilmesi için rıza kutucuğunu işaretlemeniz gerekiyor.",
    };
  }

  return { success: true, message: "Bilgileriniz kaydedildi." };
}

export async function portalCikisYap() {
  const { headers } = await import("next/headers");
  const { cikisYap } = await import("@/lib/auth");
  await cikisYap(await headers());
  redirect("/portal/giris");
}

export async function iptalTalebiOlustur(randevuId: string, aciklama: string = ""): Promise<SonucDurumu> {
  const { bag, hastaId } = await hastaOturumu();
  if (!z.string().uuid().safeParse(randevuId).success) return { success: false, message: "Randevu bulunamadı." };

  try {
    await withTenant(bag, async (tx) => {
      // Randevu gerçekten BU hastanın mı (RLS portal politikası + kod): başka hastanın randevu id'siyle talep açılamaz.
      const r = (await tx.select({ hastaId: sema.randevu.hastaId, klinikId: sema.randevu.klinikId }).from(sema.randevu).where(eq(sema.randevu.id, randevuId)).limit(1))[0];
      if (!r || r.hastaId !== hastaId) throw new Error("randevu_bulunamadi");
      await tx.insert(sema.randevuIptalTalebi).values({
        klinikId: r.klinikId,
        randevuId,
        hastaId,
        aciklama: aciklama.trim() ? aciklama.trim().slice(0, 1000) : null,
      });
    });
  } catch (e) {
    const h = pgHata(e);
    console.error("İptal talebi oluşturulamadı:", h.mesaj);
    if (h.mesaj.includes("randevu_bulunamadi")) return { success: false, message: "Randevu bulunamadı." };
    if (h.kod === "23505") {
      return { success: false, message: "Bu randevu için zaten bir talep gönderilmiş." };
    }
    return { success: false, message: "İptal talebi gönderilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/portal");
  return { success: true, message: "İptal talebiniz gönderildi, kliniğinizin onayı bekleniyor." };
}

const randevuTalebiSemasi = z.object({
  islem_tanimi_id: z.string().uuid("Tedavi seçilmeli."),
  tercih_tarih: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih gerekli."),
  tercih_saat: z.union([z.string().regex(/^\d{2}:\d{2}$/, "Saat geçersiz."), z.literal("")]).optional(),
  not_metni: z.string().trim().max(1000, "Not en fazla 1000 karakter olabilir.").optional(),
});

/** Bir hastanın aynı anda bekleyen randevu talebi üst sınırı (resepsiyon kuyruğu şişmesin). */
const BEKLEYEN_TALEP_SINIRI = 5;

/**
 * Hasta portaldan yeni bir randevu TALEP eder (mevcut iptalTalebiOlustur ile
 * aynı "talep + resepsiyon onayı" modeli) — kesin randevu değil, resepsiyon
 * panelden ("Bekleyen Randevu Talepleri") uygun terapist/oda atayarak gerçek
 * randevuyu oluşturur.
 */
export async function randevuTalebiOlustur(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const { bag, hastaId } = await hastaOturumu();

  const ayristirma = randevuTalebiSemasi.safeParse({
    islem_tanimi_id: formData.get("islem_tanimi_id"),
    tercih_tarih: formData.get("tercih_tarih"),
    tercih_saat: formData.get("tercih_saat") ?? "",
    not_metni: formData.get("not_metni") ?? "",
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { islem_tanimi_id, tercih_tarih, tercih_saat, not_metni } = ayristirma.data;

  const bugun = bugunIstanbulTarihi();
  if (tercih_tarih < bugun) {
    return { success: false, message: "Geçmiş bir tarih için randevu talep edilemez." };
  }
  const birYilSonra = `${Number(bugun.slice(0, 4)) + 1}${bugun.slice(4)}`;
  if (tercih_tarih > birYilSonra) {
    return { success: false, message: "En fazla bir yıl sonrası için talep edilebilir." };
  }

  try {
    const sonuc = await withTenant(bag, async (tx) => {
      const [{ n }] = await tx.select({ n: count() }).from(sema.randevuTalebi).where(and(eq(sema.randevuTalebi.hastaId, hastaId), eq(sema.randevuTalebi.durum, "bekliyor")));
      if (n >= BEKLEYEN_TALEP_SINIRI) {
        return { hata: "Yanıt bekleyen talepleriniz var. Kliniğiniz bunları yanıtladıktan sonra yeni talep gönderebilirsiniz." };
      }
      // Tedavi bu kliniğin ve aktif mi (RLS ile kliniğe ait olanlar görünür).
      const tedavi = (await tx.select({ id: sema.islemTanimi.id, klinikId: sema.islemTanimi.klinikId }).from(sema.islemTanimi).where(and(eq(sema.islemTanimi.id, islem_tanimi_id), eq(sema.islemTanimi.aktif, true))).limit(1))[0];
      if (!tedavi) return { hata: "Seçilen tedavi bulunamadı." };
      await tx.insert(sema.randevuTalebi).values({
        klinikId: tedavi.klinikId,
        hastaId,
        islemTanimiId: islem_tanimi_id,
        tercihTarih: tercih_tarih,
        tercihSaat: tercih_saat ? tercih_saat : null,
        notMetni: not_metni ? not_metni : null,
      });
      return { tamam: true as const };
    });
    if ("hata" in sonuc) return { success: false, message: sonuc.hata ?? "Randevu talebi gönderilemedi." };
  } catch (e) {
    console.error("Randevu talebi oluşturulamadı:", pgHata(e).mesaj);
    return { success: false, message: "Randevu talebi gönderilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/portal");
  return { success: true, message: "Randevu talebiniz gönderildi, kliniğiniz en kısa sürede sizinle iletişime geçecek." };
}
