"use server";

import { redirect } from "next/navigation";
import { bankaHesabiHatasiniCevir, havaleHesapEksikMi, HAVALE_HESAP_GEREKLI_MESAJI } from "@/lib/finans/banka-hesabi-kurali";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { finansSayfalariniYenile } from "@/lib/finans/sayfa-yenile";
import { ARAC_GOSTERILEN_KATEGORILER, type HarcamaKategori, type HarcamaOdemeTipi, type OdemeTipi } from "@/types/klinik-harcama";

type SonucDurumu = { success: boolean; message: string } | null;

const ODEME_TIPLERI: OdemeTipi[] = ["nakit", "havale", "kredi_karti"];
// Giderde ayrıca "Cariye Ekle" (borç yazılır, ödeme sonra yapılır) seçilebilir; "Ödeme bilgisi gir" akışında değil.
const HARCAMA_ODEME_TIPLERI: HarcamaOdemeTipi[] = [...ODEME_TIPLERI, "cari"];

// Migration 20260914090000'daki klinik_harcama.kategori CHECK'iyle birebir aynı liste.
const harcamaSemasi = z.object({
  tarih: z.string().min(1, "Tarih seçilmeli."),
  kategori: z.enum(["kira", "fatura", "malzeme", "bakim_hizmet", "diger"]),
  tutar: z.coerce.number().positive("Tutar 0'dan büyük olmalı."),
  tedarikci_adi: z.string().trim().optional(),
  arac_id: z.string().trim().optional(),
  odeme_tipi: z.string().trim().optional(),
  banka_hesap_id: z.string().trim().optional(),
  kredi_karti_id: z.string().trim().optional(),
  aciklama: z.string().trim().optional(),
  is_faturali: z.string().optional(),
  fatura_no: z.string().trim().optional(),
});

async function yetkiliBaglantiGetir() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("klinik_id, rol")
    .eq("id", user.id)
    .single();

  return { supabase, user, klinikId: kullanici?.klinik_id ?? null, rol: kullanici?.rol ?? null };
}

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
    tutar: veri.tutar,
    tedarikci_adi: veri.tedarikci_adi ? veri.tedarikci_adi : null,
    arac_id: aracGosterilir && veri.arac_id ? veri.arac_id : null,
    odeme_tipi: odemeTipi,
    banka_hesap_id: odemeTipi === "havale" && veri.banka_hesap_id ? veri.banka_hesap_id : null,
    kredi_karti_id: odemeTipi === "kredi_karti" && veri.kredi_karti_id ? veri.kredi_karti_id : null,
    aciklama: veri.aciklama ? veri.aciklama : null,
    is_faturali: isFaturali,
    fatura_no: isFaturali && veri.fatura_no ? veri.fatura_no : null,
  };
}

/**
 * Cariye eklenen gider tedarikçisiz olamaz (DB CHECK'i de zorlar); seçilen kredi kartı bu kliniğe ait olmalı.
 * İstemciden ne gelirse gelsin burada garanti edilir.
 */
async function harcamaDogrula(
  supabase: Awaited<ReturnType<typeof createClient>>,
  klinikId: string,
  veri: z.infer<typeof harcamaSemasi>
): Promise<string | null> {
  if (veri.odeme_tipi === "cari" && !veri.tedarikci_adi) {
    return "Cariye eklemek için tedarikçi adı girilmeli.";
  }
  if (havaleHesapEksikMi(veri.odeme_tipi, veri.banka_hesap_id)) {
    return HAVALE_HESAP_GEREKLI_MESAJI;
  }
  if (veri.odeme_tipi === "kredi_karti" && veri.kredi_karti_id) {
    const { data: kart } = await supabase
      .from("klinik_kredi_kartlari")
      .select("id")
      .eq("id", veri.kredi_karti_id)
      .eq("klinik_id", klinikId)
      .maybeSingle();
    if (!kart) return "Seçilen kredi kartı bulunamadı.";
  }
  return null;
}

/** Cari bütünlük tetikleyicisi (klinik_harcama_cari_butunluk) hatasını kullanıcıya anlaşılır çevirir. */
function giderYazmaHatasi(hata: { message?: string } | null, varsayilan: string): string {
  const bankaHatasi = bankaHesabiHatasiniCevir(hata?.message);
  if (bankaHatasi) return bankaHatasi;
  if (hata?.message?.includes("cari_bakiye_negatif")) {
    return "Bu cari gideri değiştirirseniz tedarikçiye yapılmış ödemeler kalan borcu aşar. Önce Tedarikçiler'den ilgili cari ödemelerini silin.";
  }
  return varsayilan;
}

export async function giderEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const { supabase, user, klinikId, rol } = await yetkiliBaglantiGetir();
  if (!klinikId) {
    return { success: false, message: "Klinik bilgisi bulunamadı." };
  }
  if (rol !== "klinik_admin") {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const ayristirma = formVerisiOku(formData);
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const dogrulamaHatasi = await harcamaDogrula(supabase, klinikId, ayristirma.data);
  if (dogrulamaHatasi) {
    return { success: false, message: dogrulamaHatasi };
  }

  const { error } = await supabase.from("klinik_harcama").insert({
    klinik_id: klinikId,
    ...harcamaSatiriOlustur(ayristirma.data),
    olusturan_kullanici_id: user!.id,
  });

  if (error) {
    console.error("Gider kaydedilemedi:", error);
    return { success: false, message: "Gider kaydedilemedi, lütfen tekrar deneyin." };
  }

  finansSayfalariniYenile();
  return { success: true, message: "Gider kaydedildi." };
}

export async function giderGuncelle(
  id: string,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const { supabase, klinikId, rol } = await yetkiliBaglantiGetir();
  if (!klinikId) {
    return { success: false, message: "Klinik bilgisi bulunamadı." };
  }
  if (rol !== "klinik_admin") {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const ayristirma = formVerisiOku(formData);
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const dogrulamaHatasi = await harcamaDogrula(supabase, klinikId, ayristirma.data);
  if (dogrulamaHatasi) {
    return { success: false, message: dogrulamaHatasi };
  }

  const { error } = await supabase
    .from("klinik_harcama")
    .update(harcamaSatiriOlustur(ayristirma.data))
    .eq("id", id);

  if (error) {
    console.error("Gider güncellenemedi:", error);
    return { success: false, message: giderYazmaHatasi(error, "Gider güncellenemedi, lütfen tekrar deneyin.") };
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
  const { supabase, klinikId, rol } = await yetkiliBaglantiGetir();
  if (!klinikId) {
    return { success: false, message: "Klinik bilgisi bulunamadı." };
  }
  if (rol !== "klinik_admin") {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const id = formData.get("id");
  const odemeTipi = String(formData.get("odeme_tipi") ?? "") as OdemeTipi;
  const bankaHesapId = String(formData.get("banka_hesap_id") ?? "").trim();
  const krediKartiId = String(formData.get("kredi_karti_id") ?? "").trim();
  if (typeof id !== "string" || !id) {
    return { success: false, message: "Gider bulunamadı." };
  }
  if (!ODEME_TIPLERI.includes(odemeTipi)) {
    return { success: false, message: "Ödeme yöntemi seçilmeli." };
  }
  if (odemeTipi === "havale") {
    if (!bankaHesapId) {
      return { success: false, message: "Havale için banka hesabı seçilmeli." };
    }
    const { data: hesap } = await supabase
      .from("klinik_banka_hesaplari")
      .select("id")
      .eq("id", bankaHesapId)
      .eq("klinik_id", klinikId)
      .maybeSingle();
    if (!hesap) {
      return { success: false, message: "Seçilen banka hesabı bulunamadı." };
    }
  }

  if (odemeTipi === "kredi_karti" && krediKartiId) {
    const { data: kart } = await supabase
      .from("klinik_kredi_kartlari")
      .select("id")
      .eq("id", krediKartiId)
      .eq("klinik_id", klinikId)
      .maybeSingle();
    if (!kart) {
      return { success: false, message: "Seçilen kredi kartı bulunamadı." };
    }
  }

  // Yalnız yöntemi HÂLÂ boş kayıtlar: ödenmiş/cariye eklenmiş bir giderin yöntemini sonradan değiştirmek
  // geçmiş Kasa/Banka/cari bakiyelerini sessizce kaydırırdı.
  const { data: guncellenen, error } = await supabase
    .from("klinik_harcama")
    .update({
      odeme_tipi: odemeTipi,
      banka_hesap_id: odemeTipi === "havale" ? bankaHesapId : null,
      kredi_karti_id: odemeTipi === "kredi_karti" && krediKartiId ? krediKartiId : null,
    })
    .eq("id", id)
    .eq("klinik_id", klinikId)
    .is("odeme_tipi", null)
    .select("id");

  if (error) {
    console.error("Gider ödeme bilgisi kaydedilemedi:", error);
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }
  if (!guncellenen?.length) {
    return { success: false, message: "Bu giderin ödeme bilgisi zaten girilmiş." };
  }

  revalidatePath("/panel/finans/giderler/tedarikciler");
  revalidatePath("/panel/finans/giderler");
  revalidatePath("/panel/finans/kasa");
  revalidatePath("/panel/finans/banka");
  revalidatePath("/panel/finans/kredi-karti");
  return { success: true, message: "Ödeme bilgisi kaydedildi." };
}

export async function giderSil(id: string): Promise<SonucDurumu> {
  const { supabase, rol } = await yetkiliBaglantiGetir();
  if (rol !== "klinik_admin") {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const { error } = await supabase.from("klinik_harcama").delete().eq("id", id);

  if (error) {
    console.error("Gider silinemedi:", error);
    return { success: false, message: giderYazmaHatasi(error, "Gider silinemedi, lütfen tekrar deneyin.") };
  }

  finansSayfalariniYenile();
  return { success: true, message: "Gider silindi." };
}
