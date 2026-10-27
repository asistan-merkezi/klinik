"use server";

import { revalidatePath } from "next/cache";
import { and, count, desc, eq, or } from "drizzle-orm";
import { z } from "zod";
import { sema, withTenant } from "@/lib/db";
import { eylemYetkisi, YETKISIZ_MESAJI } from "@/lib/auth/yetki";
import { IZINLI_LOGO_TIPLERI, LOGO_MAKS_BAYT, logoKaydet } from "@/lib/dosya/logo";
import { isimBasHarfBuyukYap } from "@/lib/utils";

type SonucDurumu = { success: boolean; message: string } | null;

/**
 * Bu dosyadaki tüm eylemler YALNIZ klinik_admin içindir (super_admin klinik bağlamı olmadığından zaten eleniyor).
 * Rol kontrolü RLS'e güvenmeden kodda da yapılır; klinik kimliği oturumdan gelir (istemciden asla).
 */
async function klinikAdminYetkisi() {
  const y = await eylemYetkisi(["klinik_admin"]);
  if (!y.yetkili || !y.bag || !y.klinikId || y.ctx.rol !== "klinik_admin") return null;
  return { bag: y.bag, klinikId: y.klinikId, kullaniciId: y.ctx.userId };
}

function bosIseNull(deger: FormDataEntryValue | null) {
  if (deger == null) return null;
  const s = String(deger).trim();
  return s === "" ? null : s;
}

/** Logo içerik doğrulaması: istemcinin bildirdiği MIME'a güvenmeden dosya imzasına bakar. */
function logoIcerigiGecerliMi(tip: string, veri: Buffer): boolean {
  switch (tip) {
    case "image/png":
      return veri.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case "image/jpeg":
      return veri[0] === 0xff && veri[1] === 0xd8 && veri[2] === 0xff;
    case "image/webp":
      return veri.subarray(0, 4).toString("latin1") === "RIFF" && veri.subarray(8, 12).toString("latin1") === "WEBP";
    case "image/svg+xml": {
      const metin = veri.toString("utf8").toLowerCase();
      return metin.includes("<svg") && !/<script|onload\s*=|onerror\s*=|javascript:|<foreignobject/.test(metin);
    }
    default:
      return false;
  }
}

const sirketSemasi = z.object({
  ad: z.string().trim().min(1, "Şirket adı gerekli."),
  unvan: z.string().nullable(),
  il: z.string().nullable(),
  ilce: z.string().nullable(),
  mahalle: z.string().nullable(),
  adres: z.string().nullable(),
  vergi_dairesi: z.string().nullable(),
  vergi_no: z.string().nullable(),
  telefon: z.string().nullable(),
  whatsapp_no: z.string().nullable(),
  eposta: z.string().email("Geçersiz e-posta.").nullable(),
  yetkili_kisi: z.string().nullable(),
  yetkili_telefon: z.string().nullable(),
  yetkili_eposta: z.string().email("Geçersiz yetkili e-postası.").nullable(),
  hafta_ici_baslangic: z.string().regex(/^\d{2}:\d{2}$/, "Geçersiz saat.").nullable(),
  hafta_ici_bitis: z.string().regex(/^\d{2}:\d{2}$/, "Geçersiz saat.").nullable(),
  cumartesi_baslangic: z.string().regex(/^\d{2}:\d{2}$/, "Geçersiz saat.").nullable(),
  cumartesi_bitis: z.string().regex(/^\d{2}:\d{2}$/, "Geçersiz saat.").nullable(),
  pazar_baslangic: z.string().regex(/^\d{2}:\d{2}$/, "Geçersiz saat.").nullable(),
  pazar_bitis: z.string().regex(/^\d{2}:\d{2}$/, "Geçersiz saat.").nullable(),
});

export async function sirketBilgileriGuncelle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const yetki = await klinikAdminYetkisi();
  if (!yetki) return { success: false, message: YETKISIZ_MESAJI };
  const { bag, klinikId } = yetki;

  const ayristirma = sirketSemasi.safeParse({
    ad: formData.get("ad"),
    unvan: bosIseNull(formData.get("unvan")),
    il: bosIseNull(formData.get("adres_il")),
    ilce: bosIseNull(formData.get("adres_ilce")),
    mahalle: bosIseNull(formData.get("adres_mahalle")),
    adres: bosIseNull(formData.get("adres")),
    vergi_dairesi: bosIseNull(formData.get("vergi_dairesi")),
    vergi_no: bosIseNull(formData.get("vergi_no")),
    telefon: bosIseNull(formData.get("telefon")),
    whatsapp_no: bosIseNull(formData.get("whatsapp_no")),
    eposta: bosIseNull(formData.get("eposta")),
    yetkili_kisi: bosIseNull(formData.get("yetkili_kisi")),
    yetkili_telefon: bosIseNull(formData.get("yetkili_telefon")),
    yetkili_eposta: bosIseNull(formData.get("yetkili_eposta")),
    hafta_ici_baslangic: bosIseNull(formData.get("hafta_ici_baslangic")),
    hafta_ici_bitis: bosIseNull(formData.get("hafta_ici_bitis")),
    cumartesi_baslangic: bosIseNull(formData.get("cumartesi_baslangic")),
    cumartesi_bitis: bosIseNull(formData.get("cumartesi_bitis")),
    pazar_baslangic: bosIseNull(formData.get("pazar_baslangic")),
    pazar_bitis: bosIseNull(formData.get("pazar_bitis")),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }
  const d = ayristirma.data;

  const guncellenecek: Partial<typeof sema.klinik.$inferInsert> = {
    ad: isimBasHarfBuyukYap(d.ad),
    unvan: d.unvan ? isimBasHarfBuyukYap(d.unvan) : null,
    il: d.il,
    ilce: d.ilce,
    mahalle: d.mahalle,
    adres: d.adres,
    vergiDairesi: d.vergi_dairesi ? isimBasHarfBuyukYap(d.vergi_dairesi) : null,
    vergiNo: d.vergi_no,
    telefon: d.telefon,
    whatsappNo: d.whatsapp_no,
    eposta: d.eposta,
    yetkiliKisi: d.yetkili_kisi ? isimBasHarfBuyukYap(d.yetkili_kisi) : null,
    yetkiliTelefon: d.yetkili_telefon,
    yetkiliEposta: d.yetkili_eposta,
    haftaIciBaslangic: d.hafta_ici_baslangic,
    haftaIciBitis: d.hafta_ici_bitis,
    cumartesiBaslangic: d.cumartesi_baslangic,
    cumartesiBitis: d.cumartesi_bitis,
    pazarBaslangic: d.pazar_baslangic,
    pazarBitis: d.pazar_bitis,
  };

  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    if (!IZINLI_LOGO_TIPLERI[logo.type]) {
      return { success: false, message: "Logo PNG, JPG, WEBP veya SVG olmalı." };
    }
    if (logo.size > LOGO_MAKS_BAYT) {
      return { success: false, message: "Logo en fazla 2 MB olabilir." };
    }
    const veri = Buffer.from(await logo.arrayBuffer());
    if (!logoIcerigiGecerliMi(logo.type, veri)) {
      return { success: false, message: "Logo dosyası geçerli bir görsel değil." };
    }
    try {
      await logoKaydet(klinikId, logo.type, veri);
    } catch (e) {
      console.error("Logo yüklenemedi:", e);
      return { success: false, message: "Logo yüklenemedi, lütfen tekrar deneyin." };
    }
    // Adres sabit (oturumlu route kendi kliniğinin logosunu verir); tarayıcı önbelleğini atlatmak için sürüm parametresi eklenir.
    guncellenecek.logoUrl = `/api/dosya/logo?v=${Date.now()}`;
  }

  try {
    await withTenant(bag, (tx) => tx.update(sema.klinik).set(guncellenecek).where(eq(sema.klinik.id, klinikId)));
  } catch (error) {
    console.error("Şirket bilgileri güncellenemedi:", error);
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/ayarlar/sirket-bilgileri");
  return { success: true, message: "Şirket bilgileri kaydedildi." };
}

const aracSemasi = z.object({
  marka: z.string().trim().min(1, "Marka gerekli."),
  model: z.string().trim().min(1, "Model gerekli."),
  plaka: z.string().trim().min(1, "Plaka gerekli."),
});

export async function aracEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const yetki = await klinikAdminYetkisi();
  if (!yetki) return { success: false, message: YETKISIZ_MESAJI };

  const ayristirma = aracSemasi.safeParse({ marka: formData.get("marka"), model: formData.get("model"), plaka: formData.get("plaka") });
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  try {
    await withTenant(yetki.bag, (tx) =>
      tx.insert(sema.klinikArac).values({
        klinikId: yetki.klinikId,
        marka: isimBasHarfBuyukYap(ayristirma.data.marka),
        model: isimBasHarfBuyukYap(ayristirma.data.model),
        plaka: ayristirma.data.plaka,
        olusturanKullaniciId: yetki.kullaniciId,
      })
    );
  } catch (error) {
    console.error("Araç eklenemedi:", error);
    return { success: false, message: "Araç eklenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/ayarlar/sirket-bilgileri");
  return { success: true, message: "Araç eklendi." };
}

export async function aracSil(id: string): Promise<SonucDurumu> {
  const yetki = await klinikAdminYetkisi();
  if (!yetki) return { success: false, message: YETKISIZ_MESAJI };
  if (!z.string().uuid().safeParse(id).success) return { success: false, message: "Araç bulunamadı." };

  try {
    await withTenant(yetki.bag, (tx) => tx.delete(sema.klinikArac).where(and(eq(sema.klinikArac.id, id), eq(sema.klinikArac.klinikId, yetki.klinikId))));
  } catch (error) {
    console.error("Araç silinemedi:", error);
    return { success: false, message: "Araç silinemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/ayarlar/sirket-bilgileri");
  return { success: true, message: "Araç silindi." };
}

const bankaHesabiSemasi = z.object({
  hesap_tipi: z.enum(["klinik", "sahis"]),
  banka_adi: z.string().trim().min(1, "Banka adı gerekli."),
  sube: z.string().trim().optional(),
  hesap_sahibi: z.string().trim().optional(),
  // IBAN opsiyonel; boşluklar atılıp büyük harfe çevrilir. Girildiyse TR + 24 hane olmalı.
  iban: z
    .string()
    .transform((v) => v.replace(/\s+/g, "").toUpperCase())
    .refine((v) => v === "" || /^TR\d{24}$/.test(v), "IBAN TR ile başlayan 26 karakter olmalı."),
});

function bankaHesabiGirdisi(formData: FormData) {
  return bankaHesabiSemasi.safeParse({
    hesap_tipi: formData.get("hesap_tipi"),
    banka_adi: formData.get("banka_adi"),
    sube: formData.get("sube") ?? "",
    hesap_sahibi: formData.get("hesap_sahibi") ?? "",
    iban: formData.get("iban") ?? "",
  });
}

function bankaSayfalariniTazele() {
  revalidatePath("/panel/ayarlar/sirket-bilgileri");
  revalidatePath("/panel/finans/banka");
  revalidatePath("/panel/finans/kasa");
  revalidatePath("/panel/finans/giderler");
}

/** klinik_banka_hesaplari — Kasa/Banka sayfalarının (ve giderler/personel/hasta ödeme formlarının) "hesap seçin" dropdown'larını besleyen tek kaynak. */
export async function bankaHesabiEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const yetki = await klinikAdminYetkisi();
  if (!yetki) return { success: false, message: YETKISIZ_MESAJI };

  const ayristirma = bankaHesabiGirdisi(formData);
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  try {
    await withTenant(yetki.bag, async (tx) => {
      const son = await tx
        .select({ sira: sema.klinikBankaHesaplari.sortOrder })
        .from(sema.klinikBankaHesaplari)
        .where(eq(sema.klinikBankaHesaplari.klinikId, yetki.klinikId))
        .orderBy(desc(sema.klinikBankaHesaplari.sortOrder))
        .limit(1);
      // hesap_sahibi/iban kolonları NOT NULL (migration) — boş girilince "" yazılır, ekranda "—" görünür.
      await tx.insert(sema.klinikBankaHesaplari).values({
        klinikId: yetki.klinikId,
        hesapTipi: ayristirma.data.hesap_tipi,
        bankaAdi: ayristirma.data.banka_adi,
        sube: ayristirma.data.sube ? ayristirma.data.sube : null,
        hesapSahibi: ayristirma.data.hesap_sahibi ?? "",
        iban: ayristirma.data.iban,
        sortOrder: (son[0]?.sira ?? -1) + 1,
      });
    });
  } catch (error) {
    console.error("Banka hesabı eklenemedi:", error);
    return { success: false, message: "Banka hesabı eklenemedi, lütfen tekrar deneyin." };
  }

  bankaSayfalariniTazele();
  return { success: true, message: "Banka hesabı eklendi." };
}

export async function bankaHesabiGuncelle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const yetki = await klinikAdminYetkisi();
  if (!yetki) return { success: false, message: YETKISIZ_MESAJI };

  const id = formData.get("id");
  if (typeof id !== "string" || !z.string().uuid().safeParse(id).success) {
    return { success: false, message: "Hesap bulunamadı." };
  }
  const ayristirma = bankaHesabiGirdisi(formData);
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  try {
    await withTenant(yetki.bag, (tx) =>
      tx
        .update(sema.klinikBankaHesaplari)
        .set({
          hesapTipi: ayristirma.data.hesap_tipi,
          bankaAdi: ayristirma.data.banka_adi,
          sube: ayristirma.data.sube ? ayristirma.data.sube : null,
          hesapSahibi: ayristirma.data.hesap_sahibi ?? "",
          iban: ayristirma.data.iban,
        })
        .where(and(eq(sema.klinikBankaHesaplari.id, id), eq(sema.klinikBankaHesaplari.klinikId, yetki.klinikId)))
    );
  } catch (error) {
    console.error("Banka hesabı güncellenemedi:", error);
    return { success: false, message: "Banka hesabı güncellenemedi, lütfen tekrar deneyin." };
  }

  bankaSayfalariniTazele();
  return { success: true, message: "Banka hesabı güncellendi." };
}

const MAKS_KOMISYON_ORANI = 3.5;

/** Tahsilat Bilgisi: kartla alınan hasta tahsilatının yatacağı banka hesabı + komisyon oranı (klinik başına tek ayar). */
export async function krediKartiTahsilatAyariKaydet(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const yetki = await klinikAdminYetkisi();
  if (!yetki) return { success: false, message: YETKISIZ_MESAJI };

  const hesapId = bosIseNull(formData.get("banka_hesap_id"));
  const oran = Number(String(formData.get("komisyon_orani") ?? "").trim().replace(",", ".") || "0");
  if (!Number.isFinite(oran) || oran < 0 || oran > MAKS_KOMISYON_ORANI) {
    return { success: false, message: "Komisyon oranı 0 ile %3,5 arasında olmalı." };
  }
  if (hesapId && !z.string().uuid().safeParse(hesapId).success) {
    return { success: false, message: "Seçilen banka hesabı bulunamadı." };
  }
  const oranYuvarlak = Math.round(oran * 100) / 100;

  try {
    const bulundu = await withTenant(yetki.bag, async (tx) => {
      if (hesapId) {
        const hesap = await tx
          .select({ id: sema.klinikBankaHesaplari.id })
          .from(sema.klinikBankaHesaplari)
          .where(and(eq(sema.klinikBankaHesaplari.id, hesapId), eq(sema.klinikBankaHesaplari.klinikId, yetki.klinikId)))
          .limit(1);
        if (!hesap[0]) return false;
      }
      await tx
        .update(sema.klinik)
        .set({ krediKartiTahsilatBankaHesapId: hesapId, krediKartiKomisyonOrani: String(oranYuvarlak) })
        .where(eq(sema.klinik.id, yetki.klinikId));
      return true;
    });
    if (!bulundu) return { success: false, message: "Seçilen banka hesabı bulunamadı." };
  } catch (error) {
    console.error("Kredi kartı tahsilat ayarı kaydedilemedi:", error);
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/ayarlar/sirket-bilgileri");
  revalidatePath("/panel/finans/banka");
  return { success: true, message: "Tahsilat bilgisi kaydedildi." };
}

const krediKartiSemasi = z.object({
  kart_tipi: z.enum(["klinik", "sahis"]),
  kart_adi: z.string().trim().min(1, "Kart adı gerekli."),
  banka_adi: z.string().trim().min(1, "Banka adı gerekli."),
  kart_sahibi: z.string().trim(),
  // Yalnız son 4 hane saklanır; tam numara girilirse sessizce kırpmak yerine reddedilir.
  son_dort_hane: z
    .string()
    .transform((v) => v.replace(/\s+/g, ""))
    .refine((v) => v === "" || /^\d{4}$/.test(v), "Yalnızca kartın son 4 hanesini girin (tam kart numarası saklanmaz)."),
});

function krediKartiGirdisi(formData: FormData) {
  return krediKartiSemasi.safeParse({
    kart_tipi: formData.get("kart_tipi"),
    kart_adi: formData.get("kart_adi"),
    banka_adi: formData.get("banka_adi"),
    kart_sahibi: formData.get("kart_sahibi") ?? "",
    son_dort_hane: formData.get("son_dort_hane") ?? "",
  });
}

/** klinik_kredi_kartlari — yalnız tanımlayıcı bilgi (ad/banka/sahip/son 4 hane); tam kart no ve CVV saklanmaz. */
export async function krediKartiEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const yetki = await klinikAdminYetkisi();
  if (!yetki) return { success: false, message: YETKISIZ_MESAJI };

  const ayristirma = krediKartiGirdisi(formData);
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  try {
    await withTenant(yetki.bag, async (tx) => {
      const son = await tx
        .select({ sira: sema.klinikKrediKartlari.sortOrder })
        .from(sema.klinikKrediKartlari)
        .where(eq(sema.klinikKrediKartlari.klinikId, yetki.klinikId))
        .orderBy(desc(sema.klinikKrediKartlari.sortOrder))
        .limit(1);
      await tx.insert(sema.klinikKrediKartlari).values({
        klinikId: yetki.klinikId,
        kartTipi: ayristirma.data.kart_tipi,
        kartAdi: ayristirma.data.kart_adi,
        bankaAdi: ayristirma.data.banka_adi,
        kartSahibi: ayristirma.data.kart_sahibi,
        sonDortHane: ayristirma.data.son_dort_hane || null,
        sortOrder: (son[0]?.sira ?? -1) + 1,
      });
    });
  } catch (error) {
    console.error("Kredi kartı eklenemedi:", error);
    return { success: false, message: "Kredi kartı eklenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/ayarlar/sirket-bilgileri");
  return { success: true, message: "Kredi kartı eklendi." };
}

export async function krediKartiGuncelle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const yetki = await klinikAdminYetkisi();
  if (!yetki) return { success: false, message: YETKISIZ_MESAJI };

  const id = formData.get("id");
  if (typeof id !== "string" || !z.string().uuid().safeParse(id).success) {
    return { success: false, message: "Kart bulunamadı." };
  }
  const ayristirma = krediKartiGirdisi(formData);
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  try {
    await withTenant(yetki.bag, (tx) =>
      tx
        .update(sema.klinikKrediKartlari)
        .set({
          kartTipi: ayristirma.data.kart_tipi,
          kartAdi: ayristirma.data.kart_adi,
          bankaAdi: ayristirma.data.banka_adi,
          kartSahibi: ayristirma.data.kart_sahibi,
          sonDortHane: ayristirma.data.son_dort_hane || null,
        })
        .where(and(eq(sema.klinikKrediKartlari.id, id), eq(sema.klinikKrediKartlari.klinikId, yetki.klinikId)))
    );
  } catch (error) {
    console.error("Kredi kartı güncellenemedi:", error);
    return { success: false, message: "Kredi kartı güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/ayarlar/sirket-bilgileri");
  return { success: true, message: "Kredi kartı güncellendi." };
}

export async function krediKartiSil(id: string): Promise<SonucDurumu> {
  const yetki = await klinikAdminYetkisi();
  if (!yetki) return { success: false, message: YETKISIZ_MESAJI };
  if (!z.string().uuid().safeParse(id).success) return { success: false, message: "Kredi kartı bulunamadı." };

  try {
    const sonuc = await withTenant(yetki.bag, async (tx) => {
      // Karta bağlı kayıt varsa silme: harcama/cari ödemesindeki bağ SET NULL olup kart borcundan sessizce "kart seçilmedi"ye kayardı,
      // kart ödemeleri ise FK'ya takılırdı. Önce bağlı kayıtları say.
      const [harcama, cari, kartOdeme] = await Promise.all([
        tx.select({ n: count() }).from(sema.klinikHarcama).where(eq(sema.klinikHarcama.krediKartiId, id)),
        tx.select({ n: count() }).from(sema.klinikCariOdeme).where(eq(sema.klinikCariOdeme.krediKartiId, id)),
        tx.select({ n: count() }).from(sema.klinikKrediKartiOdeme).where(eq(sema.klinikKrediKartiOdeme.krediKartiId, id)),
      ]);
      if ((harcama[0]?.n ?? 0) + (cari[0]?.n ?? 0) + (kartOdeme[0]?.n ?? 0) > 0) return "bagli" as const;
      await tx.delete(sema.klinikKrediKartlari).where(and(eq(sema.klinikKrediKartlari.id, id), eq(sema.klinikKrediKartlari.klinikId, yetki.klinikId)));
      return "silindi" as const;
    });
    if (sonuc === "bagli") {
      return { success: false, message: "Bu karta bağlı gider, cari ödemesi veya kart ödemesi kayıtları var; kart silinemez." };
    }
  } catch (error) {
    console.error("Kredi kartı silinemedi:", error);
    return { success: false, message: "Kredi kartı silinemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/ayarlar/sirket-bilgileri");
  return { success: true, message: "Kredi kartı silindi." };
}

export async function bankaHesabiSil(id: string): Promise<SonucDurumu> {
  const yetki = await klinikAdminYetkisi();
  if (!yetki) return { success: false, message: YETKISIZ_MESAJI };

  // Yalnız UUID kabul et (istemciden gelir).
  if (!z.string().uuid().safeParse(id).success) {
    return { success: false, message: "Banka hesabı bulunamadı." };
  }

  try {
    const sonuc = await withTenant(yetki.bag, async (tx) => {
      // Hesaba bağlı tahsilat/gider/personel/cari/kart ödemesi varsa silme: bağ ON DELETE SET NULL olduğundan o hesabın tüm geçmişi Banka defterinden
      // geri dönüşsüz düşerdi. DB'de de banka_hesabi_silme_engeli tetikleyicisi aynı kuralı zorlar (migration 20261012120000).
      const sayimlar = await Promise.all([
        tx.select({ n: count() }).from(sema.hastaBakiyeHareket).where(eq(sema.hastaBakiyeHareket.bankaHesapId, id)),
        tx.select({ n: count() }).from(sema.klinikHarcama).where(eq(sema.klinikHarcama.bankaHesapId, id)),
        tx.select({ n: count() }).from(sema.personelHesapHareket).where(eq(sema.personelHesapHareket.bankaHesapId, id)),
        tx.select({ n: count() }).from(sema.klinikCariOdeme).where(eq(sema.klinikCariOdeme.bankaHesapId, id)),
        tx.select({ n: count() }).from(sema.klinikKrediKartiOdeme).where(eq(sema.klinikKrediKartiOdeme.bankaHesapId, id)),
        tx
          .select({ n: count() })
          .from(sema.nakitBankaHareketi)
          .where(or(eq(sema.nakitBankaHareketi.kaynakBankaHesapId, id), eq(sema.nakitBankaHareketi.hedefBankaHesapId, id))),
      ]);
      if (sayimlar.some((s) => (s[0]?.n ?? 0) > 0)) return "bagli" as const;
      await tx.delete(sema.klinikBankaHesaplari).where(and(eq(sema.klinikBankaHesaplari.id, id), eq(sema.klinikBankaHesaplari.klinikId, yetki.klinikId)));
      return "silindi" as const;
    });
    if (sonuc === "bagli") {
      return { success: false, message: "Bu hesaba bağlı tahsilat, ödeme veya transfer kayıtları var; geçmiş kaybolmasın diye hesap silinemez." };
    }
  } catch (error) {
    console.error("Banka hesabı silinemedi:", error);
    const mesaj = error instanceof Error ? `${error.message} ${(error as { cause?: Error }).cause?.message ?? ""}` : "";
    if (mesaj.includes("banka_hesabi_kullaniliyor") || mesaj.includes("23503")) {
      return { success: false, message: "Bu hesaba bağlı kayıtlar var; hesap silinemez." };
    }
    return { success: false, message: "Banka hesabı silinemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/ayarlar/sirket-bilgileri");
  revalidatePath("/panel/finans/banka");
  revalidatePath("/panel/finans/giderler");
  return { success: true, message: "Banka hesabı silindi." };
}
