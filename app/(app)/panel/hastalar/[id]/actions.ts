"use server";

import { after } from "next/server";
import { odemeAlindiMesajiTetikle, paketSatisOzetiMesajiTetikle } from "@/lib/mesaj/hasta-mesaji";
import { bankaHesabiHatasiniCevir, havaleHesapEksikMi, HAVALE_HESAP_GEREKLI_MESAJI } from "@/lib/finans/banka-hesabi-kurali";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { tarihiSimdikiSaatleUTC } from "@/lib/datetime";
import { eq } from "drizzle-orm";
import { pgHata, rpc, sema, sql, withTenant } from "@/lib/db";
import { snakeKolonlari } from "@/lib/db/kolon";
import { randevuKimlikleriniDogrula } from "@/lib/randevu/dogrulama";
import { BELGE_OKUMA_ROLLERI } from "@/lib/belge/servis";
import { eylemYetkisi, YETKISIZ_MESAJI, type PersonelRolu } from "@/lib/auth/yetki";
import { hastaHesabiOlustur, geciciSifreYenile, kimlikHesabiSil } from "@/lib/auth/hesap";
import { isimBasHarfBuyukYap } from "@/lib/utils";
import { FATURA_ALAN_ETIKETLERI } from "@/lib/fatura/eksik-bilgi";
import { revalidateHastaDetay } from "./revalidate";
import { randevuErtele } from "../../randevular/actions";

type SonucDurumu = { success: boolean; message: string } | null;

// Rol kümeleri RLS ile birebir: finans ve idari hasta işlemleri klinik_admin + resepsiyon; klinik içerik (anamnez, risk, talep) terapist dahil.
const YONETIM_ROLLERI: readonly PersonelRolu[] = ["klinik_admin", "resepsiyon"];
const KLINIK_ROLLERI: readonly PersonelRolu[] = ["klinik_admin", "resepsiyon", "terapist"];

/**
 * Oturum + rol kapısı + hastanın ÇAĞIRANIN KLİNİĞİNDE olduğunun doğrulanması (RLS başka kliniğin hastasını göstermez → `hasta` null).
 * `yetkisiz`: rol uygun değil; `hasta` null: hasta yok/başka klinik. Tenant ve kullanıcı oturumdan gelir, istemciden asla.
 */
async function hastaBaglami(roller: readonly PersonelRolu[], hastaId: string) {
  const y = await eylemYetkisi(roller);
  if (!y.yetkili || !y.bag || !y.klinikId) return { yetkisiz: true as const };
  const hasta = UUID.test(hastaId)
    ? ((await withTenant(y.bag, (tx) => tx.select({ id: sema.hasta.id, riskBayraklari: sema.hasta.riskBayraklari }).from(sema.hasta).where(eq(sema.hasta.id, hastaId)).limit(1)))[0] ?? null)
    : null;
  return { yetkisiz: false as const, bag: y.bag, klinikId: y.klinikId, userId: y.ctx.userId, rol: y.ctx.rol, hasta };
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const kalemSemasi = z.object({
  tur: z.enum(["islem", "paket"]),
  ref_id: z.string().uuid(),
  miktar: z.coerce.number().int().min(1).optional(),
});

const satirSemasi = z.object({
  yontem: z.enum(["kredi_karti", "banka_havalesi", "nakit"]),
  tutar: z.coerce.number().positive(),
});

function jsonDizisiSemasi<T extends z.ZodTypeAny>(itemSemasi: T, bosMesaj: string) {
  return z
    .string()
    .transform((deger, ctx) => {
      try {
        return JSON.parse(deger);
      } catch {
        ctx.addIssue({ code: "custom", message: "Geçersiz veri formatı." });
        return z.NEVER;
      }
    })
    .pipe(z.array(itemSemasi).min(1, bosMesaj));
}

const odemeSemasi = z.object({
  iskonto_tutari: z.coerce.number().min(0, "İskonto 0'dan küçük olamaz."),
  faturali: z.coerce.boolean().optional(),
  aciklama: z.string().trim().optional(),
  kalemler_json: jsonDizisiSemasi(kalemSemasi, "En az bir ürün eklenmeli."),
  satirlar_json: jsonDizisiSemasi(satirSemasi, "En az bir ödeme satırı girilmeli."),
});

const HATA_MESAJLARI: Record<string, string> = {
  yetkisiz: "Bu işlem için yetkiniz yok.",
  hasta_bulunamadi: "Hasta bulunamadı.",
  urun_bulunamadi: "Seçilen ürün bulunamadı veya pasif.",
  kalem_yok: "En az bir ürün eklenmeli.",
  iskonto_fazla: "İskonto tutarı toplam tutardan büyük olamaz.",
  odeme_tutari_uyusmuyor: "Ödeme satırları toplamı, ödenecek tutara eşit olmalı.",
  kota_doldu: "Bu paketin kişi kotası doldu.",
};

function odemeHatasiniCevir(mesaj: string | undefined) {
  if (!mesaj) {
    return "Ödeme alınamadı, lütfen tekrar deneyin.";
  }
  for (const [anahtar, turkce] of Object.entries(HATA_MESAJLARI)) {
    if (mesaj.includes(anahtar)) {
      return turkce;
    }
  }
  return "Ödeme alınamadı, lütfen tekrar deneyin.";
}

export async function odemeAl(
  hastaId: string,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const ctx = await hastaBaglami(YONETIM_ROLLERI, hastaId);
  if (ctx.yetkisiz) return { success: false, message: YETKISIZ_MESAJI };
  if (!ctx.hasta) return { success: false, message: "Hasta bulunamadı." };

  const ayristirma = odemeSemasi.safeParse({
    iskonto_tutari: formData.get("iskonto_tutari") || 0,
    faturali: formData.get("faturali") === "on",
    aciklama: formData.get("aciklama") ?? "",
    kalemler_json: formData.get("kalemler_json") ?? "[]",
    satirlar_json: formData.get("satirlar_json") ?? "[]",
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { iskonto_tutari, faturali, aciklama, kalemler_json, satirlar_json } = ayristirma.data;

  try {
    await withTenant(ctx.bag, (tx) =>
      rpc(tx, "odeme_olustur", {
        p_hasta_id: hastaId,
        p_iskonto_tutari: iskonto_tutari,
        p_faturali: faturali ?? false,
        p_aciklama: aciklama ? aciklama : null,
        p_kalemler: kalemler_json,
        p_satirlar: satirlar_json,
      })
    );
  } catch (e) {
    const h = pgHata(e);
    console.error("Ödeme oluşturulamadı:", h.mesaj);
    return { success: false, message: odemeHatasiniCevir(h.mesaj) };
  }

  revalidateHastaDetay(hastaId);
  const satilanPaketler = (kalemler_json as { tur: string; ref_id: string }[]).filter((k) => k.tur === "paket").map((k) => k.ref_id);
  if (satilanPaketler.length > 0) {
    after(() => paketSatisOzetiMesajiTetikle(ctx.bag, hastaId, satilanPaketler));
  }
  // Sadece paket kalemi içeren satışlarda artık ödeme alınmıyor, borç olarak
  // ekleniyor (RPC tarafında da aynı ayrım yapılıyor) — mesaj buna göre.
  const sadecePaket = kalemler_json.length > 0 && (kalemler_json as { tur: string }[]).every((k) => k.tur === "paket");
  return {
    success: true,
    message: sadecePaket ? "Paket satışı kaydedildi, tutar borç olarak eklendi." : "Ödeme alındı.",
  };
}

const bakiyeHareketSemasi = z.object({
  // 'iade' bilinçli olarak burada YOK — iade ödeme yöntemi zorunlu ve ayrı
  // action'dan (hastaIadesiVer) girer, yoksa yöntemsiz bir iade satırı
  // Kasa/Banka/Kredi Kartı mutabakatına hiç yansımazdı.
  tur: z.enum(["odeme", "kredi", "borc"]),
  tutar: z.coerce.number().positive("Tutar 0'dan büyük olmalı."),
  tarih: z.string().min(1, "Tarih seçilmeli."),
  aciklama: z.string().trim().optional(),
  odeme_yontemi: z.enum(["nakit", "kredi_karti", "banka_havalesi"]).optional().or(z.literal("")),
  banka_hesap_id: z.string().trim().optional(),
  belge_turu: z.enum(["fatura", "fis", "serbest"]).optional().or(z.literal("")),
});

// odeme_olustur/randevu_gelis_isaretle'nin aksine bu manuel hareket bir RPC
// değil — hasta_bakiye_hareket_ekle_resepsiyon_admin RLS policy'si zaten
// klinik_admin/resepsiyon'a doğrudan INSERT izni veriyor, ayrı bir SECURITY
// DEFINER fonksiyon gerekmedi. Ürün/paket seçimi olmayan serbest bir hareket
// olduğu için (aksi hâlde "Ödeme Al" kartı kullanılır) klinik_id burada elle
// veriliyor.
export async function bakiyeHareketiEkle(
  hastaId: string,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const ctx = await hastaBaglami(YONETIM_ROLLERI, hastaId);
  if (ctx.yetkisiz) return { success: false, message: YETKISIZ_MESAJI };
  if (!ctx.hasta) return { success: false, message: "Hasta bulunamadı." };

  const ayristirma = bakiyeHareketSemasi.safeParse({
    tur: formData.get("tur"),
    tutar: formData.get("tutar"),
    tarih: formData.get("tarih"),
    aciklama: formData.get("aciklama") ?? "",
    odeme_yontemi: formData.get("odeme_yontemi") ?? "",
    banka_hesap_id: formData.get("banka_hesap_id") ?? "",
    belge_turu: formData.get("belge_turu") ?? "",
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { tur, tutar, tarih, aciklama, odeme_yontemi, banka_hesap_id, belge_turu } = ayristirma.data;

  if (tur === "odeme" && havaleHesapEksikMi(odeme_yontemi, banka_hesap_id)) {
    return { success: false, message: HAVALE_HESAP_GEREKLI_MESAJI };
  }

  // odeme_yontemi/banka_hesap_id/belge_turu sadece tur='odeme' iken anlamlı
  // (Kasa/Banka mutabakatı ilk ikisini okuyor) — diğer türlerde (kredi/borc) NULL kalır.
  // İade ayrı action'da (hastaIadesiVer).
  let eklenenId: string;
  try {
    const sonuc = await withTenant(ctx.bag, async (tx) => {
      // FK tenant'ı doğrulamaz — RLS'e tabi bu sorgu, başka kliniğin banka hesabının id'siyle hareket yazılmasını engeller.
      if (tur === "odeme" && odeme_yontemi === "banka_havalesi" && banka_hesap_id) {
        const hesap = await tx.select({ id: sema.klinikBankaHesaplari.id }).from(sema.klinikBankaHesaplari).where(eq(sema.klinikBankaHesaplari.id, banka_hesap_id)).limit(1);
        if (hesap.length === 0) return { hata: "Banka hesabı bulunamadı." };
      }
      const [yeni] = await tx
        .insert(sema.hastaBakiyeHareket)
        .values({
          klinikId: ctx.klinikId,
          hastaId,
          tur,
          tutar: String(tutar),
          aciklama: aciklama ? aciklama : null,
          createdAt: tarihiSimdikiSaatleUTC(tarih),
          odemeYontemi: tur === "odeme" && odeme_yontemi ? odeme_yontemi : null,
          bankaHesapId: tur === "odeme" && odeme_yontemi === "banka_havalesi" && banka_hesap_id ? banka_hesap_id : null,
          belgeTuru: tur === "odeme" && belge_turu ? belge_turu : null,
        })
        .returning({ id: sema.hastaBakiyeHareket.id });
      return { id: yeni.id };
    });
    if ("hata" in sonuc) return { success: false, message: sonuc.hata ?? "Eklenemedi." };
    eklenenId = sonuc.id;
  } catch (e) {
    const h = pgHata(e);
    console.error("Bakiye hareketi eklenemedi:", h.mesaj);
    return { success: false, message: bankaHesabiHatasiniCevir(h.mesaj) ?? "Eklenemedi, lütfen tekrar deneyin." };
  }

  revalidateHastaDetay(hastaId);
  if (tur === "odeme") {
    after(() => odemeAlindiMesajiTetikle(ctx.bag, hastaId, tutar, { hareketId: eklenenId }));
  }
  return { success: true, message: "Ödeme eklendi." };
}

const iadeSemasi = z
  .object({
    tutar: z.coerce.number().positive("Tutar 0'dan büyük olmalı."),
    tarih: z.string().min(1, "Tarih seçilmeli."),
    aciklama: z.string().trim().optional(),
    odeme_yontemi: z.enum(["nakit", "kredi_karti", "banka_havalesi"], {
      message: "İade yöntemi seçilmeli.",
    }),
    banka_hesap_id: z.string().trim().optional(),
  })
  .refine((v) => v.odeme_yontemi !== "banka_havalesi" || !!v.banka_hesap_id, {
    message: "Havale iadesi için banka hesabı seçilmeli.",
    path: ["banka_hesap_id"],
  });

// Hastaya para iadesi: bakiyeyi -tutar düşürür (v_hasta_ozet, migration
// 20260930090000) ve seçilen yönteme göre Kasa/Banka/Kredi Kartı'nda ÇIKIŞ
// olarak görünür. Yöntem zorunlu — yöntemsiz iade hiçbir mutabakata
// yansımazdı (DB'de de CHECK ile zorlanıyor).
export async function hastaIadesiVer(
  hastaId: string,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const ctx = await hastaBaglami(YONETIM_ROLLERI, hastaId);
  if (ctx.yetkisiz) return { success: false, message: YETKISIZ_MESAJI };
  if (!ctx.hasta) return { success: false, message: "Hasta bulunamadı." };

  const ayristirma = iadeSemasi.safeParse({
    tutar: formData.get("tutar"),
    tarih: formData.get("tarih"),
    aciklama: formData.get("aciklama") ?? "",
    odeme_yontemi: formData.get("odeme_yontemi") ?? "",
    banka_hesap_id: formData.get("banka_hesap_id") ?? "",
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { tutar, tarih, aciklama, odeme_yontemi, banka_hesap_id } = ayristirma.data;

  try {
    const sonuc = await withTenant(ctx.bag, async (tx) => {
      // FK tenant'ı doğrulamaz — RLS'e tabi bu sorgu, başka kliniğin banka hesabının id'siyle iade yazılmasını engeller.
      if (odeme_yontemi === "banka_havalesi") {
        const hesap = await tx.select({ id: sema.klinikBankaHesaplari.id }).from(sema.klinikBankaHesaplari).where(eq(sema.klinikBankaHesaplari.id, banka_hesap_id ?? "")).limit(1);
        if (hesap.length === 0) return { hata: "Banka hesabı bulunamadı." };
      }
      await tx.insert(sema.hastaBakiyeHareket).values({
        klinikId: ctx.klinikId,
        hastaId,
        tur: "iade",
        tutar: String(tutar),
        aciklama: aciklama ? aciklama : null,
        createdAt: tarihiSimdikiSaatleUTC(tarih),
        odemeYontemi: odeme_yontemi,
        bankaHesapId: odeme_yontemi === "banka_havalesi" ? banka_hesap_id : null,
      });
      return { tamam: true as const };
    });
    if ("hata" in sonuc) return { success: false, message: sonuc.hata ?? "İade kaydedilemedi." };
  } catch (e) {
    console.error("Hasta iadesi eklenemedi:", pgHata(e).mesaj);
    return { success: false, message: "İade kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidateHastaDetay(hastaId);
  return { success: true, message: "İade kaydedildi." };
}

const borcDuzenleSemasi = z.object({
  hareket_id: z.string().uuid(),
  iskonto_tutari: z.coerce.number().min(0, "İskonto 0'dan küçük olamaz."),
  faturali: z.coerce.boolean().optional(),
  aciklama: z.string().trim().optional(),
});

const BORC_DUZENLE_HATA_MESAJLARI: Record<string, string> = {
  yetkisiz: "Bu işlem için yetkiniz yok.",
  hareket_bulunamadi: "Bakiye hareketi bulunamadı.",
  gecersiz_hareket_turu: "Bu hareket bir borç kaydı değil.",
  iskonto_fazla: "İskonto tutarı borç tutarından büyük olamaz.",
  fatura_kesilmis: "Bu borcun faturası kesilmiş; tutarı değiştirilemez. Önce faturayı iptal/iade edin.",
  fatura_tutari_sifir: "Faturalı bir borcun net tutarı 0 olamaz (tam iskonto faturalanamaz).",
};

function borcDuzenleHatasiniCevir(mesaj: string | undefined) {
  if (!mesaj) {
    return "Kaydedilemedi, lütfen tekrar deneyin.";
  }
  if (mesaj.includes("fatura_bilgisi_eksik")) {
    const eksikKisim = mesaj.split(":")[1]?.trim() ?? "";
    const eksikAlanlar = eksikKisim
      .split(",")
      .map((a) => FATURA_ALAN_ETIKETLERI[a.trim()] ?? a.trim())
      .filter(Boolean);
    return eksikAlanlar.length > 0
      ? `Fatura için eksik bilgi: ${eksikAlanlar.join(", ")}.`
      : "Fatura için hasta bilgileri eksik.";
  }
  for (const [anahtar, turkce] of Object.entries(BORC_DUZENLE_HATA_MESAJLARI)) {
    if (mesaj.includes(anahtar)) {
      return turkce;
    }
  }
  return "Kaydedilemedi, lütfen tekrar deneyin.";
}

export async function borcDuzenle(
  hastaId: string,
  hareketId: string,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const ctx = await hastaBaglami(YONETIM_ROLLERI, hastaId);
  if (ctx.yetkisiz) return { success: false, message: YETKISIZ_MESAJI };
  if (!ctx.hasta) return { success: false, message: "Hasta bulunamadı." };

  const ayristirma = borcDuzenleSemasi.safeParse({
    hareket_id: hareketId,
    iskonto_tutari: formData.get("iskonto_tutari") || 0,
    faturali: formData.get("faturali") === "on",
    aciklama: formData.get("aciklama") ?? "",
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { hareket_id, iskonto_tutari, faturali, aciklama } = ayristirma.data;

  try {
    await withTenant(ctx.bag, async (tx) => {
      // İstemcinin verdiği hareket gerçekten BU hastanın mı (başka hastanın borcu bu hasta sayfasından düzenlenemez).
      const h = (await tx.select({ hastaId: sema.hastaBakiyeHareket.hastaId }).from(sema.hastaBakiyeHareket).where(eq(sema.hastaBakiyeHareket.id, hareket_id)).limit(1))[0];
      if (!h || h.hastaId !== hastaId) throw new Error("hareket_bulunamadi");
      await rpc(tx, "hasta_bakiye_hareket_borc_duzenle", {
        p_hareket_id: hareket_id,
        p_iskonto_tutari: iskonto_tutari,
        p_faturali: faturali ?? false,
        p_aciklama: aciklama ? aciklama : null,
      });
    });
  } catch (e) {
    const h = pgHata(e);
    console.error("Borç düzenlenemedi:", h.mesaj);
    return { success: false, message: borcDuzenleHatasiniCevir(h.mesaj) };
  }

  revalidateHastaDetay(hastaId);
  return { success: true, message: "Kaydedildi." };
}

export async function faturaTetikle(faturaId: string): Promise<SonucDurumu> {
  const y = await eylemYetkisi(["klinik_admin", "resepsiyon", "muhasebe"]);
  if (!y.yetkili || !y.bag) return { success: false, message: YETKISIZ_MESAJI };
  const bag = y.bag;

  const sonuc = UUID.test(faturaId)
    ? await withTenant(bag, async (tx) => ({
        fatura: (await tx.select({ id: sema.fatura.id }).from(sema.fatura).where(eq(sema.fatura.id, faturaId)).limit(1))[0] ?? null,
        entegrasyon: (await tx.select({ durum: sema.klinikMuhasebeEntegrasyonu.baglantiDurumu }).from(sema.klinikMuhasebeEntegrasyonu).limit(1))[0] ?? null,
      }))
    : null;
  if (!sonuc?.fatura) {
    return { success: false, message: "Fatura bulunamadı." };
  }

  if (sonuc.entegrasyon?.durum !== "baglandi") {
    return {
      success: false,
      message: "Muhasebe Sync henüz bağlı değil. Ayarlar > Muhasebe Sync'ten Paraşüt bilgilerini girin.",
    };
  }

  // Kimlik bilgisi girilmiş olsa da gerçek Paraşüt API client'ı henüz yazılmadı
  // (bkz. CLAUDE.md — resmi API dokümantasyonu bu ortamdan doğrulanamadı);
  // fatura durumu "bekliyor" kalır, otomatik/varsayılan bir yeniden deneme
  // yapılmaz (accounting-sync kuralı).
  return {
    success: false,
    message: "Muhasebe Sync bağlı ama Paraşüt API entegrasyonu henüz yazılmadı, fatura otomatik kesilemiyor.",
  };
}

type PortalSonucu = { success: boolean; message: string; geciciSifre?: string } | null;

/** Bu telefonla başka bir portal hesabı varsa (klinik başına benzersiz) kimlik katmanı 23505 verir. */
async function portalErisimiAc_(hastaId: string): Promise<PortalSonucu> {
  const ctx = await hastaBaglami(YONETIM_ROLLERI, hastaId);
  if (ctx.yetkisiz) return { success: false, message: YETKISIZ_MESAJI };
  if (!ctx.hasta) return { success: false, message: "Hasta bulunamadı." };

  const bilgi = await withTenant(ctx.bag, async (tx) => ({
    hasta: (await tx.select({ adSoyad: sema.hasta.adSoyad, telefon: sema.hasta.telefon }).from(sema.hasta).where(eq(sema.hasta.id, hastaId)).limit(1))[0],
    var: (await tx.select({ id: sema.hastaKullanici.id }).from(sema.hastaKullanici).where(eq(sema.hastaKullanici.hastaId, hastaId)).limit(1)).length > 0,
  }));
  if (!bilgi.hasta) return { success: false, message: "Hasta bulunamadı." };
  if (bilgi.var) return { success: false, message: "Bu hasta için portal erişimi zaten açılmış." };

  // 1) Kimlik hesabı (ayrı havuz, kimlik_rolu) — 2) tenant tarafı `hasta_kullanici` satırı. İkincisi başarısız olursa kimlik hesabı geri silinir.
  let hesap;
  try {
    hesap = await hastaHesabiOlustur({ hastaId, klinikId: ctx.klinikId, ad: bilgi.hasta.adSoyad, telefon: bilgi.hasta.telefon });
  } catch (e) {
    const h = pgHata(e);
    console.error("Portal kullanıcısı oluşturulamadı:", h.mesaj);
    return { success: false, message: h.kod === "23505" ? "Bu telefon numarasıyla başka bir portal hesabı var." : "Portal erişimi açılamadı, lütfen tekrar deneyin." };
  }

  try {
    await withTenant(ctx.bag, (tx) => tx.insert(sema.hastaKullanici).values({ id: hesap.id, hastaId }));
  } catch (e) {
    console.error("hasta_kullanici eklenemedi:", pgHata(e).mesaj);
    await kimlikHesabiSil(hesap.id).catch((x) => console.error("Kimlik hesabı geri alınamadı:", x));
    return { success: false, message: "Portal erişimi açılamadı, lütfen tekrar deneyin." };
  }

  revalidateHastaDetay(hastaId);
  return { success: true, message: "Portal erişimi açıldı.", geciciSifre: hesap.geciciSifre };
}

export async function portalErisimiAc(hastaId: string): Promise<PortalSonucu> {
  return portalErisimiAc_(hastaId);
}

export async function portalSifreSifirla(hastaId: string): Promise<PortalSonucu> {
  const ctx = await hastaBaglami(YONETIM_ROLLERI, hastaId);
  if (ctx.yetkisiz) return { success: false, message: YETKISIZ_MESAJI };
  if (!ctx.hasta) return { success: false, message: "Hasta bulunamadı." };

  const mk = (await withTenant(ctx.bag, (tx) => tx.select({ id: sema.hastaKullanici.id }).from(sema.hastaKullanici).where(eq(sema.hastaKullanici.hastaId, hastaId)).limit(1)))[0];
  if (!mk) {
    return { success: false, message: "Portal erişimi bulunamadı." };
  }

  try {
    // Yeni geçici şifre (7 gün geçerli, ilk girişte değiştirme zorunlu); açık oturumlar iptal edilir.
    const yeni = await geciciSifreYenile(mk.id, { hasta: true });
    return { success: true, message: "Yeni geçici şifre oluşturuldu.", geciciSifre: yeni.geciciSifre };
  } catch (e) {
    console.error("Portal şifresi sıfırlanamadı:", e);
    return { success: false, message: "Şifre sıfırlanamadı, lütfen tekrar deneyin." };
  }
}

function bosIseNull2(deger: FormDataEntryValue | null) {
  if (deger == null) return null;
  const s = String(deger).trim();
  return s === "" ? null : s;
}

const evetHayirSemasi = z
  .union([z.literal("evet"), z.literal("hayir"), z.literal("")])
  .optional()
  .transform((deger) => (deger === "evet" ? true : deger === "hayir" ? false : null));

// NOT (kimlik_no uzunluğu): T.C. Kimlik No 11 hane kontrolü kasıtlı olarak
// burada YOK (sadece client'ta uyarı gösteriliyor, bkz. detayli-bilgiler-karti.tsx).
// Daha önce burada bir superRefine ile sert reddediliyordu, ama üretimde 11
// haneden farklı (10 haneli) kimlik_no ile kayıtlı gerçek hastalar var (bu
// alan eklendiğinde henüz uzunluk kontrolü yoktu) — o hastalarda formun
// HİÇBİR alanı kaydedilemiyordu, kullanıcı kimlik_no alanına hiç dokunmasa
// bile. "Eksik/fazla girilirse uyarılsın" isteği zaten sadece uyarı
// istiyordu, reddetme değil.
//
// NOT (form ikiye ayrıldı): Kimlik/İletişim/Adres/Acil Durum/Veli ile
// Tıbbi Ön Geçmiş (anamnez) tek bir formda birleşikken ciddi bir hata vardı:
// hasta.telefon her submit'te (dokunulmasa bile) "+90..." formatına yeniden
// yazılıyordu, bu da terapist için hasta.telefon'u DEĞİŞTİRİYOR sayılıp
// hasta_terapist_sadece_risk_guncelle trigger'ını (terapist sadece
// risk_bayraklari değiştirebilir) tetikliyor ve TÜM formu (anamnez dahil)
// reddediyordu. Artık iki ayrı action/form var: temelBilgileriGuncelle
// (klinik_admin/resepsiyon-only, hasta tablosu + kimlik/adres/veli) ve
// anamnezGuncelle (terapist + klinik_admin/resepsiyon, sadece anamnez
// alanları, hasta tablosuna hiç dokunmuyor). Aynı ayrım DB'de de
// hasta_hassas_terapist_kisitla trigger'ıyla (migration 20260731100000)
// garanti altına alındı.

const temelBilgilerSemasi = z.object({
  ad_soyad: z.string().trim().min(2, "Ad soyad en az 2 karakter olmalı."),
  telefon: z.string().regex(/^\+90\d{10}$/, "Telefon numarası (başındaki 0 hariç) 10 haneli olmalı."),
  dogum_tarihi: z.union([z.string().date(), z.literal("")]).optional(),
  cinsiyet: z.enum(["kadin", "erkek", "belirtilmemis"]).nullable(),
  kategori: z.enum(["vita", "plus", "elit", "prime"]),
  eposta: z.string().trim().email("Geçersiz e-posta.").nullable(),
  referans_kanali: z.string().nullable(),
  whatsapp_izin_durumu: z.coerce.boolean(),
  kimlik_no: z.string().nullable(),
  kimlik_no_tipi: z.enum(["tc", "pasaport"]).nullable(),
  il: z.string().nullable(),
  ilce: z.string().nullable(),
  mahalle: z.string().nullable(),
  adres: z.string().nullable(),
  acil_durum_ad_soyad: z.string().nullable(),
  acil_durum_yakinlik: z.string().nullable(),
  acil_durum_telefon: z.string().nullable(),
  anne_adi: z.string().nullable(),
  anne_telefon: z.string().nullable(),
  baba_adi: z.string().nullable(),
  baba_telefon: z.string().nullable(),
  diger_yakini_ad_soyad: z.string().nullable(),
  diger_yakini_telefon: z.string().nullable(),
  diger_yakini_yakinlik: z.string().nullable(),
});

export async function temelBilgileriGuncelle(
  hastaId: string,
  _onceki: PortalSonucu,
  formData: FormData
): Promise<PortalSonucu> {
  // Kimlik/iletişim/adres/veli idari veridir — sadece klinik_admin/resepsiyon.
  const ctx = await hastaBaglami(YONETIM_ROLLERI, hastaId);
  if (ctx.yetkisiz) return { success: false, message: YETKISIZ_MESAJI };
  if (!ctx.hasta) return { success: false, message: "Hasta bulunamadı." };

  const ayristirma = temelBilgilerSemasi.safeParse({
    ad_soyad: formData.get("ad_soyad"),
    telefon: formData.get("telefon"),
    dogum_tarihi: formData.get("dogum_tarihi") ?? "",
    cinsiyet: bosIseNull2(formData.get("cinsiyet")),
    kategori: formData.get("kategori") || "vita",
    eposta: bosIseNull2(formData.get("eposta")),
    referans_kanali: bosIseNull2(formData.get("referans_kanali")),
    whatsapp_izin_durumu: formData.get("whatsapp_izin_durumu") === "on",
    kimlik_no: bosIseNull2(formData.get("kimlik_no")),
    kimlik_no_tipi: bosIseNull2(formData.get("kimlik_no_tipi")),
    il: bosIseNull2(formData.get("adres_il")),
    ilce: bosIseNull2(formData.get("adres_ilce")),
    mahalle: bosIseNull2(formData.get("adres_mahalle")),
    adres: bosIseNull2(formData.get("adres")),
    acil_durum_ad_soyad: bosIseNull2(formData.get("acil_durum_ad_soyad")),
    acil_durum_yakinlik: bosIseNull2(formData.get("acil_durum_yakinlik")),
    acil_durum_telefon: bosIseNull2(formData.get("acil_durum_telefon")),
    anne_adi: bosIseNull2(formData.get("anne_adi")),
    anne_telefon: bosIseNull2(formData.get("anne_telefon")),
    baba_adi: bosIseNull2(formData.get("baba_adi")),
    baba_telefon: bosIseNull2(formData.get("baba_telefon")),
    diger_yakini_ad_soyad: bosIseNull2(formData.get("diger_yakini_ad_soyad")),
    diger_yakini_telefon: bosIseNull2(formData.get("diger_yakini_telefon")),
    diger_yakini_yakinlik: bosIseNull2(formData.get("diger_yakini_yakinlik")),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const {
    ad_soyad,
    telefon,
    dogum_tarihi,
    cinsiyet,
    kategori,
    eposta,
    referans_kanali,
    whatsapp_izin_durumu,
    anne_adi,
    baba_adi,
    diger_yakini_ad_soyad,
    ...digerHassas
  } = ayristirma.data;

  const hassasDegerler = snakeKolonlari(sema.hastaHassas, {
    ...digerHassas,
    anne_adi: anne_adi ? isimBasHarfBuyukYap(anne_adi) : null,
    baba_adi: baba_adi ? isimBasHarfBuyukYap(baba_adi) : null,
    diger_yakini_ad_soyad: diger_yakini_ad_soyad ? isimBasHarfBuyukYap(diger_yakini_ad_soyad) : null,
  });

  try {
    // hasta + hasta_hassas TEK transaction (eskiden iki bağımsız çağrı: biri başarısız olursa yarım kayıt kalırdı).
    await withTenant(ctx.bag, async (tx) => {
      await tx
        .update(sema.hasta)
        .set({
          adSoyad: isimBasHarfBuyukYap(ad_soyad),
          telefon,
          dogumTarihi: dogum_tarihi ? dogum_tarihi : null,
          cinsiyet,
          kategori,
          eposta,
          referansKanali: referans_kanali,
          whatsappIzinDurumu: whatsapp_izin_durumu,
        })
        .where(eq(sema.hasta.id, hastaId));
      await tx
        .insert(sema.hastaHassas)
        .values({ hastaId, klinikId: ctx.klinikId, ...hassasDegerler })
        .onConflictDoUpdate({ target: sema.hastaHassas.hastaId, set: hassasDegerler });
    });
  } catch (e) {
    const h = pgHata(e);
    console.error("Temel bilgiler güncellenemedi:", h.mesaj);
    if (h.kod === "23505") {
      return { success: false, message: "Bu kimlik no başka bir hastada kayıtlı." };
    }
    return { success: false, message: "Güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidateHastaDetay(hastaId);
  revalidatePath("/panel/hastalar");
  revalidatePath("/panel/randevular");
  return { success: true, message: "Temel bilgiler kaydedildi." };
}

const anamnezSemasi = z.object({
  alerji_var: evetHayirSemasi,
  alerjiler: z.string().nullable(),
  kan_sulandirici_kullanimi: evetHayirSemasi,
  kan_sulandirici_detay: z.string().nullable(),
  kronik_hastalik_var: evetHayirSemasi,
  kronik_hastaliklar: z.string().nullable(),
  surekli_ilac_var: evetHayirSemasi,
  surekli_ilaclar: z.string().nullable(),
  ameliyat_var: evetHayirSemasi,
  gecirilmis_ameliyatlar: z.string().nullable(),
  bulasici_hastalik_var: evetHayirSemasi,
  bulasici_hastalik_detay: z.string().nullable(),
  protez_implant_var: evetHayirSemasi,
  protez_implant_detay: z.string().nullable(),
  hamilelik_emzirme_var: evetHayirSemasi,
  hamilelik_emzirme_detay: z.string().nullable(),
  sigara_alkol_madde_var: evetHayirSemasi,
  sigara_alkol_madde_detay: z.string().nullable(),

  gelis_sebebi: z.string().nullable(),
});
// NOT: oncelik_durumu (öncelik/aciliyet durumu) BİLİNÇLİ OLARAK bu şemada
// YOK — kullanıcı isteğiyle bu formdan kaldırıldı. Kolon DB'de duruyor
// (Hasta Detay başlığındaki acil rozeti ve Kayıt Formu PDF'i hâlâ okuyor),
// sadece burada artık yazılmıyor/upsert edilmiyor — upsert'e dahil
// edilmediği için mevcut değeri olduğu gibi korunuyor.

export async function anamnezGuncelle(
  hastaId: string,
  _onceki: PortalSonucu,
  formData: FormData
): Promise<PortalSonucu> {
  // Anamnez klinik/tedavi içeriğidir — terapist de düzenleyebilir (klinik_admin/
  // resepsiyon'un yanı sıra). Bu action hasta tablosuna HİÇ dokunmuyor ve
  // hasta_hassas'a sadece anamnez alanlarını yazıyor (bkz. yukarıdaki not).
  const ctx = await hastaBaglami(KLINIK_ROLLERI, hastaId);
  if (ctx.yetkisiz) return { success: false, message: YETKISIZ_MESAJI };
  if (!ctx.hasta) return { success: false, message: "Hasta bulunamadı." };

  const ayristirma = anamnezSemasi.safeParse({
    alerji_var: formData.get("alerji_var") ?? "",
    alerjiler: bosIseNull2(formData.get("alerjiler")),
    kan_sulandirici_kullanimi: formData.get("kan_sulandirici_kullanimi") ?? "",
    kan_sulandirici_detay: bosIseNull2(formData.get("kan_sulandirici_detay")),
    kronik_hastalik_var: formData.get("kronik_hastalik_var") ?? "",
    kronik_hastaliklar: bosIseNull2(formData.get("kronik_hastaliklar")),
    surekli_ilac_var: formData.get("surekli_ilac_var") ?? "",
    surekli_ilaclar: bosIseNull2(formData.get("surekli_ilaclar")),
    ameliyat_var: formData.get("ameliyat_var") ?? "",
    gecirilmis_ameliyatlar: bosIseNull2(formData.get("gecirilmis_ameliyatlar")),
    bulasici_hastalik_var: formData.get("bulasici_hastalik_var") ?? "",
    bulasici_hastalik_detay: bosIseNull2(formData.get("bulasici_hastalik_detay")),
    protez_implant_var: formData.get("protez_implant_var") ?? "",
    protez_implant_detay: bosIseNull2(formData.get("protez_implant_detay")),
    hamilelik_emzirme_var: formData.get("hamilelik_emzirme_var") ?? "",
    hamilelik_emzirme_detay: bosIseNull2(formData.get("hamilelik_emzirme_detay")),
    sigara_alkol_madde_var: formData.get("sigara_alkol_madde_var") ?? "",
    sigara_alkol_madde_detay: bosIseNull2(formData.get("sigara_alkol_madde_detay")),

    gelis_sebebi: bosIseNull2(formData.get("gelis_sebebi")),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const degerler = snakeKolonlari(sema.hastaHassas, ayristirma.data);
  try {
    await withTenant(ctx.bag, (tx) =>
      tx
        .insert(sema.hastaHassas)
        .values({ hastaId, klinikId: ctx.klinikId, ...degerler })
        .onConflictDoUpdate({ target: sema.hastaHassas.hastaId, set: degerler })
    );
  } catch (e) {
    console.error("Anamnez güncellenemedi:", pgHata(e).mesaj);
    return { success: false, message: "Güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidateHastaDetay(hastaId);
  return { success: true, message: "Tıbbi geçmiş kaydedildi." };
}

const sikayetKaydiSemasi = z.object({
  basvuru_sikayeti: z.string().trim().min(1, "Başvuru şikayeti gerekli."),
  sikayet_baslangici: z.string().trim().nullable(),
  agri_oykusu: z.string().trim().nullable(),
  ilk_degerlendirme_notu: z.string().trim().nullable(),
  durum: z.enum(["aktif", "cozuldu"]),
});

// Şikayet & Anamnez — Tedavi & Anamnez sekmesindeki AYRI, tekrarlı kayıt
// listesi (hasta_hassas'taki tek satırlık anamnez formundan farklı, bkz.
// hasta_anamnez migration'ı). Aynı 3 rolün (terapist + klinik_admin/
// resepsiyon) yetki modeli anamnezGuncelle ile tutarlı olsun diye
// KLINIK_ROLLERI yeniden kullanıldı.
export async function sikayetKaydiEkle(
  hastaId: string,
  girdi: {
    basvuru_sikayeti: string;
    sikayet_baslangici: string;
    agri_oykusu: string;
    ilk_degerlendirme_notu: string;
    durum: "aktif" | "cozuldu";
  }
): Promise<PortalSonucu> {
  const ctx = await hastaBaglami(KLINIK_ROLLERI, hastaId);
  if (ctx.yetkisiz) return { success: false, message: YETKISIZ_MESAJI };
  if (!ctx.hasta) return { success: false, message: "Hasta bulunamadı." };

  const ayristirma = sikayetKaydiSemasi.safeParse({
    basvuru_sikayeti: girdi.basvuru_sikayeti,
    sikayet_baslangici: bosIseNull2(girdi.sikayet_baslangici),
    agri_oykusu: bosIseNull2(girdi.agri_oykusu),
    ilk_degerlendirme_notu: bosIseNull2(girdi.ilk_degerlendirme_notu),
    durum: girdi.durum,
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  try {
    await withTenant(ctx.bag, (tx) =>
      tx.insert(sema.hastaAnamnez).values({
        klinikId: ctx.klinikId,
        hastaId,
        basvuruSikayeti: ayristirma.data.basvuru_sikayeti,
        sikayetBaslangici: ayristirma.data.sikayet_baslangici,
        agriOykusu: ayristirma.data.agri_oykusu,
        ilkDegerlendirmeNotu: ayristirma.data.ilk_degerlendirme_notu,
        durum: ayristirma.data.durum,
      })
    );
  } catch (e) {
    console.error("Şikayet kaydı eklenemedi:", pgHata(e).mesaj);
    return { success: false, message: "Eklenemedi, lütfen tekrar deneyin." };
  }

  revalidateHastaDetay(hastaId);
  return { success: true, message: "Şikayet kaydı eklendi." };
}

export async function sikayetDurumGuncelle(kayitId: string, durum: "aktif" | "cozuldu"): Promise<PortalSonucu> {
  const y = await eylemYetkisi(KLINIK_ROLLERI);
  if (!y.yetkili || !y.bag || !UUID.test(kayitId) || !["aktif", "cozuldu"].includes(durum)) {
    return { success: false, message: YETKISIZ_MESAJI };
  }

  let hastaId: string | null = null;
  try {
    // RLS klinik_id = current_klinik_id() ile sınırlar; satır dönerse kendi kliniğindendir.
    const guncellenen = await withTenant(y.bag, (tx) => tx.update(sema.hastaAnamnez).set({ durum }).where(eq(sema.hastaAnamnez.id, kayitId)).returning({ hastaId: sema.hastaAnamnez.hastaId }));
    hastaId = guncellenen[0]?.hastaId ?? null;
  } catch (e) {
    console.error("Şikayet durumu güncellenemedi:", pgHata(e).mesaj);
    return { success: false, message: "Güncellenemedi, lütfen tekrar deneyin." };
  }
  if (!hastaId) return { success: false, message: "Kayıt bulunamadı." };

  revalidateHastaDetay(hastaId);
  return { success: true, message: "Durum güncellendi." };
}

export async function ozelNitelikliOnayVer(hastaId: string): Promise<PortalSonucu> {
  const ctx = await hastaBaglami(YONETIM_ROLLERI, hastaId);
  if (ctx.yetkisiz) return { success: false, message: YETKISIZ_MESAJI };
  if (!ctx.hasta) return { success: false, message: "Hasta bulunamadı." };

  try {
    await withTenant(ctx.bag, (tx) =>
      tx
        .update(sema.hasta)
        .set({ ozelNitelikliVeriOnayTarihi: new Date().toISOString(), ozelNitelikliOnaylayanTip: "personel", ozelNitelikliOnaylayanKullaniciId: ctx.userId })
        .where(eq(sema.hasta.id, hastaId))
    );
  } catch (e) {
    console.error("Özel nitelikli veri onayı kaydedilemedi:", pgHata(e).mesaj);
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidateHastaDetay(hastaId);
  return { success: true, message: "Sağlık verisi işleme onayı kaydedildi." };
}

export async function ticariIletiOnayVer(hastaId: string): Promise<PortalSonucu> {
  const ctx = await hastaBaglami(YONETIM_ROLLERI, hastaId);
  if (ctx.yetkisiz) return { success: false, message: YETKISIZ_MESAJI };
  if (!ctx.hasta) return { success: false, message: "Hasta bulunamadı." };

  try {
    await withTenant(ctx.bag, (tx) =>
      tx
        .update(sema.hasta)
        .set({ ticariIletiOnayTarihi: new Date().toISOString(), ticariIletiOnaylayanTip: "personel", ticariIletiOnaylayanKullaniciId: ctx.userId })
        .where(eq(sema.hasta.id, hastaId))
    );
  } catch (e) {
    console.error("Ticari ileti onayı kaydedilemedi:", pgHata(e).mesaj);
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidateHastaDetay(hastaId);
  return { success: true, message: "Ticari ileti onayı kaydedildi." };
}

const riskBayragiSemasi = z.object({
  tip: z.enum([
    "alerji",
    "kalp_pili",
    "kan_sulandirici",
    "dusme_riski",
    "hamilelik",
    "diyabet",
    "epilepsi",
    "metal_implant",
    "diger",
  ]),
  aciklama: z.string().trim().min(1, "Açıklama gerekli."),
  seviye: z.enum(["yuksek", "orta", "dusuk"]),
});

export async function riskBayragiEkle(
  hastaId: string,
  _onceki: PortalSonucu,
  formData: FormData
): Promise<PortalSonucu> {
  const ctx = await hastaBaglami(KLINIK_ROLLERI, hastaId);
  if (ctx.yetkisiz) return { success: false, message: YETKISIZ_MESAJI };
  if (!ctx.hasta) return { success: false, message: "Hasta bulunamadı." };

  const ayristirma = riskBayragiSemasi.safeParse({
    tip: formData.get("tip"),
    aciklama: formData.get("aciklama"),
    seviye: formData.get("seviye"),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const yeniBayrak = {
    ...ayristirma.data,
    eklenme_tarihi: new Date().toISOString(),
    ekleyen_id: ctx.userId,
  };

  try {
    // Atomik ekleme (jsonb birleştirme): eşzamanlı iki ekleme birbirini ezmez (eski oku-değiştir-yaz yarışı yoktu ama kayıp güncelleme olabilirdi).
    await withTenant(ctx.bag, (tx) =>
      tx
        .update(sema.hasta)
        .set({ riskBayraklari: sql`coalesce(${sema.hasta.riskBayraklari}, '[]'::jsonb) || ${JSON.stringify([yeniBayrak])}::jsonb` })
        .where(eq(sema.hasta.id, hastaId))
    );
  } catch (e) {
    console.error("Risk bayrağı eklenemedi:", pgHata(e).mesaj);
    return { success: false, message: "Eklenemedi, lütfen tekrar deneyin." };
  }

  revalidateHastaDetay(hastaId);
  return { success: true, message: "Risk bayrağı eklendi." };
}

/**
 * Belgeyi görüntüleme bağlantısı: dosya web kökü dışında durur ve yalnız yetkili route'tan (/api/hasta-belge/[id]) servis edilir.
 * Erişim izi (audit_log 'select', hasta_belge_goruntule RPC'si) bağlantı AÇILDIĞI anda, route'ta yazılır (gerçek açma anı).
 */
export async function belgeSignedUrlAl(belgeId: string): Promise<{ url: string } | { error: string }> {
  const y = await eylemYetkisi(BELGE_OKUMA_ROLLERI);
  if (!y.yetkili || !y.bag || !UUID.test(belgeId)) return { error: "Belge bulunamadı veya erişim yetkiniz yok." };
  const var_ = await withTenant(y.bag, (tx) => tx.select({ id: sema.hastaBelge.id }).from(sema.hastaBelge).where(eq(sema.hastaBelge.id, belgeId)).limit(1));
  if (var_.length === 0) return { error: "Belge bulunamadı veya erişim yetkiniz yok." };
  return { url: `/api/hasta-belge/${belgeId}?islem=goruntule` };
}

export async function portalErisimDurumDegistir(hastaId: string, yeniDurum: boolean): Promise<PortalSonucu> {
  const ctx = await hastaBaglami(YONETIM_ROLLERI, hastaId);
  if (ctx.yetkisiz) return { success: false, message: YETKISIZ_MESAJI };
  if (!ctx.hasta) return { success: false, message: "Hasta bulunamadı." };

  try {
    const guncellenen = await withTenant(ctx.bag, (tx) => tx.update(sema.hastaKullanici).set({ aktif: yeniDurum }).where(eq(sema.hastaKullanici.hastaId, hastaId)).returning({ id: sema.hastaKullanici.id }));
    if (guncellenen.length === 0) return { success: false, message: "Portal erişimi bulunamadı." };
  } catch (e) {
    console.error("Portal erişim durumu güncellenemedi:", pgHata(e).mesaj);
    return { success: false, message: "Güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidateHastaDetay(hastaId);
  return { success: true, message: yeniDurum ? "Portal erişimi açıldı." : "Portal erişimi kapatıldı." };
}

const talepTuruSemasi = z.enum([
  "randevu_talebi",
  "randevu_iptali",
  "randevu_ertele",
  "terapist_yorumu",
  "randevu_yorumu",
]);

const randevuTalebiPanelSemasi = z.object({
  islem_tanimi_id: z.string().uuid("Tedavi seçilmeli."),
  tercih_tarih: z.string().min(1, "Tarih gerekli."),
  tercih_saat: z.string().optional(),
  not_metni: z.string().trim().optional(),
});

const randevuIptaliPanelSemasi = z.object({
  randevu_id: z.string().uuid("Randevu seçilmeli."),
});

const randevuErtelePanelSemasi = z.object({
  randevu_id: z.string().uuid("Randevu seçilmeli."),
  tarih: z.string().min(1, "Yeni tarih gerekli."),
  saat: z.string().min(1, "Yeni saat gerekli."),
});

const hastaYorumPanelSemasi = z.object({
  randevu_id: z.string().uuid("Randevu seçilmeli."),
  puan: z.coerce.number().refine((n) => Number.isInteger(n) && n >= 1 && n <= 5, "Bir puan seçilmeli."),
  yorum: z.string().trim().min(1, "Yorum gerekli."),
});

/**
 * Hasta Detayı > "Talep ve Öneriler" popup'ının tek gönderim action'ı — 5 tür
 * (randevu_talebi/randevu_iptali portal'daki randevuTalebiOlustur/iptalTalebiOlustur'un
 * panel eşdeğeri — hasta_id burada zaten context'ten biliniyor, portaldaki gibi
 * current_hasta_id()'ye değil client'ın gönderdiği hastaId'ye güveniyoruz çünkü
 * hastaBaglami zaten RLS ile "bu hasta çağıranın kliniğinde mi"
 * garantisini veriyor; randevu_ertele Randevu Çizelgesi'ndeki "Ertelendi" ile AYNI
 * randevuErtele action'ını çağırır (talep+onay modeli değil, doğrudan taşıma) —
 * yalnız seçilen randevu_id'nin gerçekten bu hastaya ait olduğu burada ayrıca
 * doğrulanır (iptal ve yorum türlerinde de aynı doğrulama yapılır); terapist_yorumu/randevu_yorumu ise hiç karşılığı olmayan yeni
 * hasta_yorum tablosuna yazıyor, tur formData'dan okunuyor ki tek bir
 * useActionState action'ı yeterli olsun (tür seçimi artık dropdown değil kutu).
 */
export async function talepOneriGonder(
  hastaId: string,
  _onceki: PortalSonucu,
  formData: FormData
): Promise<PortalSonucu> {
  const ctx = await hastaBaglami(KLINIK_ROLLERI, hastaId);
  if (ctx.yetkisiz) return { success: false, message: YETKISIZ_MESAJI };
  if (!ctx.hasta) return { success: false, message: "Hasta bulunamadı." };

  const turAyristirma = talepTuruSemasi.safeParse(formData.get("tur"));
  if (!turAyristirma.success) {
    return { success: false, message: "Bir talep türü seçilmeli." };
  }
  const tur = turAyristirma.data;

  /** Seçilen randevu gerçekten BU hastanın mı (RLS ile tenant, kod ile hasta eşleşmesi). */
  const randevuHastayaAitMi = async (randevuId: string) =>
    (await withTenant(ctx.bag, (tx) => tx.select({ hastaId: sema.randevu.hastaId }).from(sema.randevu).where(eq(sema.randevu.id, randevuId)).limit(1)))[0]?.hastaId === hastaId;

  if (tur === "randevu_talebi") {
    const ayristirma = randevuTalebiPanelSemasi.safeParse({
      islem_tanimi_id: formData.get("islem_tanimi_id"),
      tercih_tarih: formData.get("tercih_tarih"),
      tercih_saat: formData.get("tercih_saat") ?? "",
      not_metni: formData.get("not_metni") ?? "",
    });
    if (!ayristirma.success) {
      return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
    }
    const { islem_tanimi_id, tercih_tarih, tercih_saat, not_metni } = ayristirma.data;
    try {
      await withTenant(ctx.bag, async (tx) => {
        const kimlik = await randevuKimlikleriniDogrula(tx, { islemTanimiId: islem_tanimi_id });
        if (kimlik) throw new Error("tedavi_bulunamadi");
        await tx.insert(sema.randevuTalebi).values({
          klinikId: ctx.klinikId,
          hastaId,
          islemTanimiId: islem_tanimi_id,
          tercihTarih: tercih_tarih,
          tercihSaat: tercih_saat ? tercih_saat : null,
          notMetni: not_metni ? not_metni : null,
        });
      });
    } catch (e) {
      console.error("Randevu talebi eklenemedi (panel):", pgHata(e).mesaj);
      return { success: false, message: "Gönderilemedi, lütfen tekrar deneyin." };
    }
  } else if (tur === "randevu_iptali") {
    const ayristirma = randevuIptaliPanelSemasi.safeParse({ randevu_id: formData.get("randevu_id") });
    if (!ayristirma.success) {
      return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
    }
    if (!(await randevuHastayaAitMi(ayristirma.data.randevu_id))) return { success: false, message: "Randevu bulunamadı." };
    try {
      await withTenant(ctx.bag, (tx) => tx.insert(sema.randevuIptalTalebi).values({ klinikId: ctx.klinikId, randevuId: ayristirma.data.randevu_id, hastaId }));
    } catch (e) {
      const h = pgHata(e);
      console.error("İptal talebi eklenemedi (panel):", h.mesaj);
      if (h.kod === "23505") {
        return { success: false, message: "Bu randevu için zaten bir talep gönderilmiş." };
      }
      return { success: false, message: "Gönderilemedi, lütfen tekrar deneyin." };
    }
  } else if (tur === "randevu_ertele") {
    const ayristirma = randevuErtelePanelSemasi.safeParse({
      randevu_id: formData.get("randevu_id"),
      tarih: formData.get("tarih"),
      saat: formData.get("saat"),
    });
    if (!ayristirma.success) {
      return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
    }
    if (!(await randevuHastayaAitMi(ayristirma.data.randevu_id))) return { success: false, message: "Randevu bulunamadı." };
    const erteleFormData = new FormData();
    erteleFormData.set("tarih", ayristirma.data.tarih);
    erteleFormData.set("saat", ayristirma.data.saat);
    const sonuc = await randevuErtele(ayristirma.data.randevu_id, erteleFormData);
    return sonuc ?? { success: false, message: "Ertelenemedi, lütfen tekrar deneyin." };
  } else {
    const ayristirma = hastaYorumPanelSemasi.safeParse({
      randevu_id: formData.get("randevu_id"),
      puan: formData.get("puan"),
      yorum: formData.get("yorum"),
    });
    if (!ayristirma.success) {
      return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
    }
    if (!(await randevuHastayaAitMi(ayristirma.data.randevu_id))) return { success: false, message: "Randevu bulunamadı." };
    try {
      await withTenant(ctx.bag, (tx) =>
        tx.insert(sema.hastaYorum).values({
          klinikId: ctx.klinikId,
          hastaId,
          randevuId: ayristirma.data.randevu_id,
          tur,
          puan: ayristirma.data.puan,
          yorum: ayristirma.data.yorum,
          olusturanKullaniciId: ctx.userId,
        })
      );
    } catch (e) {
      console.error("Hasta yorumu eklenemedi:", pgHata(e).mesaj);
      return { success: false, message: "Gönderilemedi, lütfen tekrar deneyin." };
    }
  }

  revalidateHastaDetay(hastaId);
  return { success: true, message: "Gönderildi." };
}
