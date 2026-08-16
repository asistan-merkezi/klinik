"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { anlikMesajTetikle, klinikAdminleriniGetir } from "@/lib/mesaj/anlik-tetikle";
import { IZIN_TIP_ETIKETLERI, type IzinTip } from "@/types/izin";
import { formatDate } from "@/lib/datetime";

type SonucDurumu = { success: boolean; message: string } | null;

const talepSemasi = z.object({
  tip: z.enum(["yillik", "mazeret", "ucretsiz", "idari", "telafi"]),
  baslangic_tarih: z.string().min(1, "Başlangıç tarihi seçilmeli."),
  bitis_tarih: z.string().min(1, "Bitiş tarihi seçilmeli."),
  gerekce: z.string().trim().optional(),
});

async function kendiPersoneliGetir() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: personel } = await supabase
    .from("personel")
    .select("id, ad_soyad, klinik_id, klinik:klinik_id(ad)")
    .eq("kullanici_id", user.id)
    .maybeSingle<{ id: string; ad_soyad: string; klinik_id: string; klinik: { ad: string } | null }>();

  return { supabase, personel };
}

export async function izinTalebiOlustur(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const { supabase, personel } = await kendiPersoneliGetir();
  if (!personel) {
    return { success: false, message: "Personel kaydınız bulunamadı." };
  }

  const ayristirma = talepSemasi.safeParse({
    tip: formData.get("tip"),
    baslangic_tarih: formData.get("baslangic_tarih"),
    bitis_tarih: formData.get("bitis_tarih"),
    gerekce: formData.get("gerekce") ?? "",
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { tip, baslangic_tarih, bitis_tarih, gerekce } = ayristirma.data;

  // Belge yükleme — personel-belge bucket'ının INSERT RLS'i klinik_admin-only
  // (kaşe görseli için kurulmuştu), o yüzden yükleme burada admin client ile
  // yapılıyor (personelHesabiOlustur'daki kaşe görseli yüklemesiyle aynı desen).
  let belgeUrl: string | null = null;
  const belgeDosyasi = formData.get("belge");
  if (belgeDosyasi instanceof File && belgeDosyasi.size > 0) {
    const adminClient = createAdminClient();
    const uzanti = belgeDosyasi.name.split(".").pop() || "pdf";
    const yol = `${personel.klinik_id}/izin/${personel.id}/${Date.now()}.${uzanti}`;
    const { error: yuklemeHatasi } = await adminClient.storage
      .from("personel-belge")
      .upload(yol, belgeDosyasi, { contentType: belgeDosyasi.type });
    if (yuklemeHatasi) {
      console.error("İzin belgesi yüklenemedi:", yuklemeHatasi);
      return { success: false, message: "Belge yüklenemedi, lütfen tekrar deneyin." };
    }
    belgeUrl = yol;
  }

  const { error } = await supabase.rpc("personel_izin_talep_olustur", {
    p_personel_id: personel.id,
    p_tip: tip,
    p_baslangic_tarih: baslangic_tarih,
    p_bitis_tarih: bitis_tarih,
    p_gerekce: gerekce ? gerekce : null,
    p_belge_url: belgeUrl,
  });

  if (error) {
    console.error("İzin talebi oluşturulamadı:", error);
    const mesaj =
      error.message === "gun_sayisi_sifir"
        ? "Seçilen tarih aralığında hiç iş günü yok (hafta tatili/resmi tatil)."
        : error.message === "tarih_araligi_gecersiz"
          ? "Bitiş tarihi başlangıçtan önce olamaz."
          : "İzin talebi oluşturulamadı, lütfen tekrar deneyin.";
    return { success: false, message: mesaj };
  }

  // Yöneticilere bildirim — RPC başarıyla döndükten SONRA, en iyi çaba (best
  // effort): bildirim gönderilemese bile talep zaten oluşturuldu, kullanıcıya
  // hata gösterilmez.
  try {
    const adminClient = createAdminClient();
    const yoneticiler = await klinikAdminleriniGetir(adminClient, personel.klinik_id);
    const degiskenler = {
      personel_adi: personel.ad_soyad,
      izin_tip: IZIN_TIP_ETIKETLERI[tip as IzinTip],
      tarih_araligi: `${formatDate(baslangic_tarih)} – ${formatDate(bitis_tarih)}`,
      klinik_adi: personel.klinik?.ad ?? "",
    };
    for (const yonetici of yoneticiler) {
      await anlikMesajTetikle(adminClient, {
        klinikId: personel.klinik_id,
        tetikleyiciKodu: "personel_izin_talebi_yeni",
        aliciTipi: "personel",
        aliciId: yonetici.personelId,
        adres: { telefon: yonetici.telefon, eposta: yonetici.eposta },
        degiskenler,
      });
    }
  } catch (bildirimHatasi) {
    console.error("İzin talebi bildirimi gönderilemedi:", bildirimHatasi);
  }

  revalidatePath("/panel/personel/izinlerim");
  revalidatePath("/panel/personel/izinler");
  return { success: true, message: "İzin talebiniz oluşturuldu, onay bekliyor." };
}

export async function izinTalebiIptalEt(talepId: string): Promise<SonucDurumu> {
  const { supabase, personel } = await kendiPersoneliGetir();
  if (!personel) {
    return { success: false, message: "Personel kaydınız bulunamadı." };
  }

  const { error } = await supabase.rpc("personel_izin_talep_iptal_et", { p_talep_id: talepId });

  if (error) {
    console.error("İzin talebi iptal edilemedi:", error);
    const mesaj =
      error.message === "gecersiz_durum_gecisi"
        ? "Bu talep artık iptal edilemez (beklemede değil)."
        : "İptal edilemedi, lütfen tekrar deneyin.";
    return { success: false, message: mesaj };
  }

  revalidatePath("/panel/personel/izinlerim");
  revalidatePath("/panel/personel/izinler");
  return { success: true, message: "Talep iptal edildi." };
}
