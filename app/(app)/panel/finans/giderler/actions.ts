"use server";

import { bankaHesabiHatasiniCevir, havaleHesapEksikMi, HAVALE_HESAP_GEREKLI_MESAJI } from "@/lib/finans/banka-hesabi-kurali";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { pgHata, sema, withTenant, type Tx } from "@/lib/db";
import { finansOturumu } from "@/lib/finans/eylem";
import { islemAnahtariniKaydet, islemAnahtariniOku } from "@/lib/finans/idempotans";
import { pozitifTutarKurus } from "@/lib/finans/tutar";
import { kurusMetni } from "@/lib/para";
import { YETKISIZ_MESAJI } from "@/lib/auth/yetki";
import { finansSayfalariniYenile } from "@/lib/finans/sayfa-yenile";
import { ARAC_GOSTERILEN_KATEGORILER, type HarcamaKategori, type HarcamaOdemeTipi, type OdemeTipi } from "@/types/klinik-harcama";

type SonucDurumu = { success: boolean; message: string } | null;

const ODEME_TIPLERI: OdemeTipi[] = ["nakit", "havale", "kredi_karti"];
// Giderde ayrıca "Cariye Ekle" (borç yazılır, ödeme sonra yapılır) seçilebilir; "Ödeme bilgisi gir" akışında değil.
const HARCAMA_ODEME_TIPLERI: HarcamaOdemeTipi[] = [...ODEME_TIPLERI, "cari"];

// Migration 20260914090000'daki klinik_harcama.kategori CHECK'iyle birebir aynı liste.
const harcamaSemasi = z.strictObject({
  tarih: z.string().min(1, "Tarih seçilmeli."),
  kategori: z.enum(["kira", "fatura", "malzeme", "bakim_hizmet", "diger"]),
  tutar: pozitifTutarKurus(),
  tedarikci_adi: z.string().trim().optional(),
  arac_id: z.string().trim().optional(),
  odeme_tipi: z.string().trim().optional(),
  banka_hesap_id: z.string().trim().optional(),
  kredi_karti_id: z.string().trim().optional(),
  aciklama: z.string().trim().optional(),
  is_faturali: z.string().optional(),
  fatura_no: z.string().trim().optional(),
});

function formVerisiOku(formData: FormData) {
  return harcamaSemasi.safeParse({
    tarih: formData.get("tarih"),
    kategori: formData.get("kategori"),
    tutar: formData.get("tutar"),
    tedarikci_adi: formData.get("tedarikci_adi") ?? "",
    arac_id: formData.get("arac_id") ?? "",
    odeme_tipi: formData.get("odeme_tipi") ?? "",
    banka_hesap_id: formData.get("banka_hesap_id") ?? "",
    kredi_karti_id: formData.get("kredi_karti_id") ?? "",
    aciklama: formData.get("aciklama") ?? "",
    is_faturali: formData.get("is_faturali") ?? "",
    fatura_no: formData.get("fatura_no") ?? "",
  });
}

/** Kategoriye göre araç, ödeme tipine göre banka hesabı zorunlu tutarlılığı — istemciden ne gelirse gelsin burada garanti edilir. */
function harcamaSatiriOlustur(veri: z.infer<typeof harcamaSemasi>) {
  const kategori = veri.kategori as HarcamaKategori;
  const odemeTipi = HARCAMA_ODEME_TIPLERI.includes(veri.odeme_tipi as HarcamaOdemeTipi)
    ? (veri.odeme_tipi as HarcamaOdemeTipi)
    : null;
  const aracGosterilir = ARAC_GOSTERILEN_KATEGORILER.includes(kategori);
  const isFaturali = veri.is_faturali === "on" || veri.is_faturali === "true";

  return {
    tarih: veri.tarih,
    kategori,
    tutar: kurusMetni(veri.tutar),
    tedarikciAdi: veri.tedarikci_adi ? veri.tedarikci_adi : null,
    aracId: aracGosterilir && veri.arac_id ? veri.arac_id : null,
    odemeTipi,
    bankaHesapId: odemeTipi === "havale" && veri.banka_hesap_id ? veri.banka_hesap_id : null,
    krediKartiId: odemeTipi === "kredi_karti" && veri.kredi_karti_id ? veri.kredi_karti_id : null,
    aciklama: veri.aciklama ? veri.aciklama : null,
    isFaturali,
    faturaNo: isFaturali && veri.fatura_no ? veri.fatura_no : null,
  };
}

/**
 * Cariye eklenen gider tedarikçisiz olamaz (DB CHECK'i de zorlar); seçilen kredi kartı bu kliniğe ait olmalı.
 * İstemciden ne gelirse gelsin burada garanti edilir.
 */
async function harcamaDogrula(tx: Tx, klinikId: string, veri: z.infer<typeof harcamaSemasi>): Promise<string | null> {
  if (veri.odeme_tipi === "cari" && !veri.tedarikci_adi) {
    return "Cariye eklemek için tedarikçi adı girilmeli.";
  }
  if (havaleHesapEksikMi(veri.odeme_tipi, veri.banka_hesap_id)) {
    return HAVALE_HESAP_GEREKLI_MESAJI;
  }
  // Seçilen id'ler gerçekten bu kliniğe ait mi (FK tenant'ı doğrulamaz; RLS'li sorgu başka kliniğinkini göstermez).
  if (veri.odeme_tipi === "kredi_karti" && veri.kredi_karti_id) {
    const kart = await tx.select({ id: sema.klinikKrediKartlari.id }).from(sema.klinikKrediKartlari).where(and(eq(sema.klinikKrediKartlari.id, veri.kredi_karti_id), eq(sema.klinikKrediKartlari.klinikId, klinikId))).limit(1);
    if (kart.length === 0) return "Seçilen kredi kartı bulunamadı.";
  }
  if (veri.odeme_tipi === "havale" && veri.banka_hesap_id) {
    const hesap = await tx.select({ id: sema.klinikBankaHesaplari.id }).from(sema.klinikBankaHesaplari).where(and(eq(sema.klinikBankaHesaplari.id, veri.banka_hesap_id), eq(sema.klinikBankaHesaplari.klinikId, klinikId))).limit(1);
    if (hesap.length === 0) return "Seçilen banka hesabı bulunamadı.";
  }
  if (veri.arac_id) {
    const arac = await tx.select({ id: sema.klinikArac.id }).from(sema.klinikArac).where(and(eq(sema.klinikArac.id, veri.arac_id), eq(sema.klinikArac.klinikId, klinikId))).limit(1);
    if (arac.length === 0) return "Seçilen araç bulunamadı.";
  }
  return null;
}

/** Cari bütünlük tetikleyicisi (klinik_harcama_cari_butunluk) hatasını kullanıcıya anlaşılır çevirir. */
function giderYazmaHatasi(hata: unknown, varsayilan: string): string {
  const mesaj = pgHata(hata).mesaj;
  const bankaHatasi = bankaHesabiHatasiniCevir(mesaj);
  if (bankaHatasi) return bankaHatasi;
  if (mesaj?.includes("cari_bakiye_negatif")) {
    return "Bu cari gideri değiştirirseniz tedarikçiye yapılmış ödemeler kalan borcu aşar. Önce Tedarikçiler'den ilgili cari ödemelerini silin.";
  }
  return varsayilan;
}

export async function giderEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const o = await finansOturumu(["klinik_admin"]);
  if (!o) return { success: false, message: YETKISIZ_MESAJI };

  const ayristirma = formVerisiOku(formData);
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }
  const anahtar = islemAnahtariniOku(formData);

  try {
    const hata = await withTenant(o.bag, async (tx) => {
      const dogrulamaHatasi = await harcamaDogrula(tx, o.klinikId, ayristirma.data);
      if (dogrulamaHatasi) return dogrulamaHatasi;
      if (!(await islemAnahtariniKaydet(tx, o.klinikId, anahtar, "gider_ekle", o.kullaniciId))) return null;
      await tx.insert(sema.klinikHarcama).values({ klinikId: o.klinikId, ...harcamaSatiriOlustur(ayristirma.data), olusturanKullaniciId: o.kullaniciId });
      return null;
    });
    if (hata) return { success: false, message: hata };
  } catch (e) {
    console.error("Gider kaydedilemedi:", pgHata(e).mesaj);
    return { success: false, message: giderYazmaHatasi(e, "Gider kaydedilemedi, lütfen tekrar deneyin.") };
  }

  finansSayfalariniYenile();
  return { success: true, message: "Gider kaydedildi." };
}

export async function giderGuncelle(
  id: string,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const o = await finansOturumu(["klinik_admin"]);
  if (!o) return { success: false, message: YETKISIZ_MESAJI };
  if (!z.string().uuid().safeParse(id).success) return { success: false, message: "Gider bulunamadı." };

  const ayristirma = formVerisiOku(formData);
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  try {
    const hata = await withTenant(o.bag, async (tx) => {
      const dogrulamaHatasi = await harcamaDogrula(tx, o.klinikId, ayristirma.data);
      if (dogrulamaHatasi) return dogrulamaHatasi;
      const g = await tx.update(sema.klinikHarcama).set(harcamaSatiriOlustur(ayristirma.data)).where(eq(sema.klinikHarcama.id, id)).returning({ id: sema.klinikHarcama.id });
      return g.length === 0 ? "Gider bulunamadı." : null;
    });
    if (hata) return { success: false, message: hata };
  } catch (e) {
    console.error("Gider güncellenemedi:", pgHata(e).mesaj);
    return { success: false, message: giderYazmaHatasi(e, "Gider güncellenemedi, lütfen tekrar deneyin.") };
  }

  finansSayfalariniYenile();
  return { success: true, message: "Gider güncellendi." };
}

/**
 * Mevcut bir giderin yalnız ÖDEME BİLGİSİNİ (yöntem + havale ise banka hesabı) yazar — örn. Paraşüt'ten
 * "ödendi" gelip yöntemi belli olmayan kayıtlar. Kasa/Banka mutabakatı `odeme_tipi`/`banka_hesap_id`'den okur,
 * bu yüzden kayıt bu bilgi girilince ilgili ekrana düşer. Diğer alanlara (tutar, tarih…) dokunmaz.
 */
export async function giderOdemeBilgisiGuncelle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const o = await finansOturumu(["klinik_admin"]);
  if (!o) return { success: false, message: YETKISIZ_MESAJI };

  const id = formData.get("id");
  const odemeTipi = String(formData.get("odeme_tipi") ?? "") as OdemeTipi;
  const bankaHesapId = String(formData.get("banka_hesap_id") ?? "").trim();
  const krediKartiId = String(formData.get("kredi_karti_id") ?? "").trim();
  if (typeof id !== "string" || !z.string().uuid().safeParse(id).success) {
    return { success: false, message: "Gider bulunamadı." };
  }
  if (!ODEME_TIPLERI.includes(odemeTipi)) {
    return { success: false, message: "Ödeme yöntemi seçilmeli." };
  }
  if (odemeTipi === "havale" && !z.string().uuid().safeParse(bankaHesapId).success) {
    return { success: false, message: "Havale için banka hesabı seçilmeli." };
  }

  try {
    const hata = await withTenant(o.bag, async (tx) => {
      if (odemeTipi === "havale") {
        const hesap = await tx.select({ id: sema.klinikBankaHesaplari.id }).from(sema.klinikBankaHesaplari).where(and(eq(sema.klinikBankaHesaplari.id, bankaHesapId), eq(sema.klinikBankaHesaplari.klinikId, o.klinikId))).limit(1);
        if (hesap.length === 0) return "Seçilen banka hesabı bulunamadı.";
      }
      if (odemeTipi === "kredi_karti" && krediKartiId) {
        const kart = await tx.select({ id: sema.klinikKrediKartlari.id }).from(sema.klinikKrediKartlari).where(and(eq(sema.klinikKrediKartlari.id, krediKartiId), eq(sema.klinikKrediKartlari.klinikId, o.klinikId))).limit(1);
        if (kart.length === 0) return "Seçilen kredi kartı bulunamadı.";
      }
      // Yalnız yöntemi HÂLÂ boş kayıtlar: ödenmiş/cariye eklenmiş bir giderin yöntemini sonradan değiştirmek geçmiş Kasa/Banka/cari bakiyelerini sessizce kaydırırdı.
      const guncellenen = await tx
        .update(sema.klinikHarcama)
        .set({
          odemeTipi,
          bankaHesapId: odemeTipi === "havale" ? bankaHesapId : null,
          krediKartiId: odemeTipi === "kredi_karti" && krediKartiId ? krediKartiId : null,
        })
        .where(and(eq(sema.klinikHarcama.id, id), eq(sema.klinikHarcama.klinikId, o.klinikId), isNull(sema.klinikHarcama.odemeTipi)))
        .returning({ id: sema.klinikHarcama.id });
      return guncellenen.length === 0 ? "Bu giderin ödeme bilgisi zaten girilmiş." : null;
    });
    if (hata) return { success: false, message: hata };
  } catch (e) {
    console.error("Gider ödeme bilgisi kaydedilemedi:", pgHata(e).mesaj);
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/finans/giderler/tedarikciler");
  revalidatePath("/panel/finans/giderler");
  revalidatePath("/panel/finans/kasa");
  revalidatePath("/panel/finans/banka");
  revalidatePath("/panel/finans/kredi-karti");
  return { success: true, message: "Ödeme bilgisi kaydedildi." };
}

export async function giderSil(id: string): Promise<SonucDurumu> {
  const o = await finansOturumu(["klinik_admin"]);
  if (!o) return { success: false, message: YETKISIZ_MESAJI };
  if (!z.string().uuid().safeParse(id).success) return { success: false, message: "Gider bulunamadı." };

  try {
    // Cari bütünlük tetikleyicisi (klinik_harcama_cari_butunluk) ödemelerin altına düşüren silmeyi reddeder.
    const silinen = await withTenant(o.bag, (tx) => tx.delete(sema.klinikHarcama).where(eq(sema.klinikHarcama.id, id)).returning({ id: sema.klinikHarcama.id }));
    if (silinen.length === 0) return { success: false, message: "Gider bulunamadı." };
  } catch (e) {
    console.error("Gider silinemedi:", pgHata(e).mesaj);
    return { success: false, message: giderYazmaHatasi(e, "Gider silinemedi, lütfen tekrar deneyin.") };
  }

  finansSayfalariniYenile();
  return { success: true, message: "Gider silindi." };
}
