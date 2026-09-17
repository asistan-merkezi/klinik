"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { anlikMesajTetikle } from "@/lib/mesaj/anlik-tetikle";
import { IZIN_DURUM_ETIKETLERI, type IzinDurum } from "@/types/izin";

type SonucDurumu = { success: boolean; message: string } | null;

async function yetkiliBaglantiGetir() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("klinik_id, rol").eq("id", user.id).single();

  return { supabase, klinikId: kullanici?.klinik_id ?? null, rol: kullanici?.rol ?? null };
}

async function sonucBildir(
  supabase: Awaited<ReturnType<typeof createClient>>,
  talepId: string,
  durum: IzinDurum
) {
  const { data: talep } = await supabase
    .from("personel_izin_talebi")
    .select("klinik_id, klinik:klinik_id(ad), personel:personel_id(id, ad_soyad, eposta, kullanici:kullanici_id(telefon))")
    .eq("id", talepId)
    .maybeSingle<{
      klinik_id: string;
      klinik: { ad: string } | null;
      personel: { id: string; ad_soyad: string; eposta: string | null; kullanici: { telefon: string | null } | null } | null;
    }>();

  if (!talep?.personel) return;

  try {
    const adminClient = createAdminClient();
    await anlikMesajTetikle(adminClient, {
      klinikId: talep.klinik_id,
      tetikleyiciKodu: "personel_izin_sonuc",
      aliciTipi: "personel",
      aliciId: talep.personel.id,
      adres: { telefon: talep.personel.kullanici?.telefon ?? null, eposta: talep.personel.eposta },
      degiskenler: {
        personel_adi: talep.personel.ad_soyad,
        izin_durumu: IZIN_DURUM_ETIKETLERI[durum],
        klinik_adi: talep.klinik?.ad ?? "",
      },
    });
  } catch (e) {
    console.error("İzin sonucu bildirimi gönderilemedi:", e);
  }
}

export async function izinTalebiOnayla(talepId: string): Promise<SonucDurumu> {
  const { supabase, klinikId, rol } = await yetkiliBaglantiGetir();
  if (!klinikId || rol !== "klinik_admin") {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const { error } = await supabase.rpc("personel_izin_talebi_onayla", { p_talep_id: talepId });

  if (error) {
    console.error("İzin talebi onaylanamadı:", error);
    const mesaj = error.message?.startsWith("donem_kapali")
      ? `Onaylanamadı: ${error.message.split(":")[1]?.trim() ?? ""} dönemi kapalı, önce dönemi yeniden açın.`
      : error.message === "gecersiz_durum_gecisi"
        ? "Bu talep artık onaylanamaz (beklemede değil)."
        : "Onaylanamadı, lütfen tekrar deneyin.";
    return { success: false, message: mesaj };
  }

  await sonucBildir(supabase, talepId, "onaylandi");

  revalidatePath("/panel/personel/izinler");
  revalidatePath("/panel/personel/izinlerim");
  return { success: true, message: "Talep onaylandı, ilgili günlere puantaj kaydı işlendi." };
}

export async function izinTalebiReddet(talepId: string, redGerekce: string): Promise<SonucDurumu> {
  const { supabase, klinikId, rol } = await yetkiliBaglantiGetir();
  if (!klinikId || rol !== "klinik_admin") {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  if (!redGerekce.trim()) {
    return { success: false, message: "Red gerekçesi zorunlu." };
  }

  const { error } = await supabase.rpc("personel_izin_talebi_reddet", {
    p_talep_id: talepId,
    p_red_gerekce: redGerekce.trim(),
  });

  if (error) {
    console.error("İzin talebi reddedilemedi:", error);
    const mesaj = error.message === "gecersiz_durum_gecisi" ? "Bu talep artık reddedilemez (beklemede değil)." : "Reddedilemedi, lütfen tekrar deneyin.";
    return { success: false, message: mesaj };
  }

  await sonucBildir(supabase, talepId, "reddedildi");

  revalidatePath("/panel/personel/izinler");
  revalidatePath("/panel/personel/izinlerim");
  return { success: true, message: "Talep reddedildi." };
}

export async function izinTalebiYoneticiIptalEt(talepId: string): Promise<SonucDurumu> {
  const { supabase, klinikId, rol } = await yetkiliBaglantiGetir();
  if (!klinikId || rol !== "klinik_admin") {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const { error } = await supabase.rpc("personel_izin_talebi_yonetici_iptal", { p_talep_id: talepId });

  if (error) {
    console.error("Onaylı izin iptal edilemedi:", error);
    const mesaj =
      error.message === "izin_baslamis"
        ? "İzin zaten başladığı için iptal edilemez."
        : error.message === "gecersiz_durum_gecisi"
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
 * personel_izin_talep_olustur zaten klinik_admin'in KENDİ dışındaki bir
 * personel için talep açmasına izin veriyor (bkz. RPC yetki kontrolü) —
 * ayrı bir "manuel" RPC'ye gerek yok.
 */
export async function manuelIzinEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const { supabase, klinikId, rol } = await yetkiliBaglantiGetir();
  if (!klinikId || rol !== "klinik_admin") {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

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

  const { data: talepId, error: olusturHata } = await supabase.rpc("personel_izin_talep_olustur", {
    p_personel_id: personel_id,
    p_tip: tip,
    p_baslangic_tarih: baslangic_tarih,
    p_bitis_tarih: bitis_tarih,
    p_gerekce: gerekce ? gerekce : "Yönetici tarafından girildi.",
    p_belge_url: null,
  });

  if (olusturHata || !talepId) {
    console.error("Manuel izin talebi oluşturulamadı:", olusturHata);
    const mesaj =
      olusturHata?.message === "gun_sayisi_sifir"
        ? "Seçilen tarih aralığında hiç iş günü yok (hafta tatili/resmi tatil)."
        : olusturHata?.message === "tarih_araligi_gecersiz"
          ? "Bitiş tarihi başlangıçtan önce olamaz."
          : "İzin eklenemedi, lütfen tekrar deneyin.";
    return { success: false, message: mesaj };
  }

  const { error: onayHata } = await supabase.rpc("personel_izin_talebi_onayla", { p_talep_id: talepId as string });

  revalidatePath("/panel/personel/izinler");
  revalidatePath("/panel/personel/izinlerim");
  revalidatePath("/panel/personel/puantaj-cetveli");

  if (onayHata) {
    console.error("Manuel izin onaylanamadı:", onayHata);
    const mesaj = onayHata.message?.startsWith("donem_kapali")
      ? `Talep oluşturuldu ama onaylanamadı: ${onayHata.message.split(":")[1]?.trim() ?? ""} dönemi kapalı — önce dönemi yeniden açın, sonra listeden onaylayın.`
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
 * İzin onayının izlediği "hiç yazmadan önce hafta tatili/resmi tatil hariç
 * günleri hesapla" mantığı burada JS'de tekrarlanıyor (kismiAyOrani'nin
 * yanına SQL tarafında genel bir yardımcı YOK, personel_izin_is_gunu_sayisi
 * sadece izin_talebi akışına özel).
 */
export async function manuelRaporEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const { supabase, klinikId, rol } = await yetkiliBaglantiGetir();
  if (!klinikId || rol !== "klinik_admin") {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

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

  const { data: personel } = await supabase.from("personel").select("klinik_id").eq("id", personel_id).maybeSingle();
  if (!personel || personel.klinik_id !== klinikId) {
    return { success: false, message: "Personel bulunamadı." };
  }

  const [{ data: klinik }, { data: resmiTatiller }] = await Promise.all([
    supabase.from("klinik").select("cumartesi_baslangic, pazar_baslangic").eq("id", klinikId).single(),
    supabase.from("resmi_tatil").select("tarih").gte("tarih", baslangic_tarih).lte("tarih", bitis_tarih),
  ]);
  const resmiTatilSet = new Set((resmiTatiller ?? []).map((r) => r.tarih as string));

  const gunler: string[] = [];
  const cursor = new Date(`${baslangic_tarih}T00:00:00Z`);
  const bitisDate = new Date(`${bitis_tarih}T00:00:00Z`);
  while (cursor.getTime() <= bitisDate.getTime()) {
    const iso = cursor.toISOString().slice(0, 10);
    const dow = cursor.getUTCDay();
    const kapaliHaftaSonu = (dow === 0 && !klinik?.pazar_baslangic) || (dow === 6 && !klinik?.cumartesi_baslangic);
    if (!kapaliHaftaSonu && !resmiTatilSet.has(iso)) gunler.push(iso);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  if (gunler.length === 0) {
    return { success: false, message: "Seçilen tarih aralığında hiç iş günü yok (hafta tatili/resmi tatil)." };
  }

  // İzin talebinden gelen günlerin üzerine sessizce yazmıyoruz — kaynak orada
  // kalmalı, düzeltme ilgili izin talebi üzerinden yapılmalı (izinKaynakli
  // kilidiyle aynı ilke, bkz. HucreDuzenleDialog).
  const { data: izinKaynakliGunler } = await supabase
    .from("personel_puantaj")
    .select("tarih")
    .eq("personel_id", personel_id)
    .eq("kaynak", "izin_talebi")
    .in("tarih", gunler);

  if (izinKaynakliGunler && izinKaynakliGunler.length > 0) {
    return {
      success: false,
      message: "Bu aralıkta onaylı izin günleri var — önce ilgili izin talebi üzerinden düzenleyin.",
    };
  }

  const satirlar = gunler.map((tarih) => ({
    personel_id,
    tarih,
    durum: "raporlu",
    kaynak: "manuel",
    mola_dakika: 0,
    not_metni: not_metni || null,
    giris_saat: null,
    cikis_saat: null,
  }));

  const { error } = await supabase.from("personel_puantaj").upsert(satirlar, { onConflict: "personel_id,tarih" });

  if (error) {
    console.error("Manuel rapor eklenemedi:", error);
    if (error.code === "42501" || error.message?.includes("row-level security")) {
      return { success: false, message: "Bu aralıktaki bazı aylar dönem kapalı olduğu için işlenemedi." };
    }
    return { success: false, message: "Eklenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/personel/izinler");
  revalidatePath("/panel/personel/puantaj-cetveli");
  revalidatePath(`/panel/personel/${personel_id}`);
  return { success: true, message: `${gunler.length} gün raporlu olarak işlendi.` };
}
