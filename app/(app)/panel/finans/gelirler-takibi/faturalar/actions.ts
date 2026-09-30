"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { FATURA_ALAN_ETIKETLERI } from "@/lib/fatura/eksik-bilgi";
import { revalidateHastaDetay } from "@/app/(app)/panel/hastalar/[id]/revalidate";

type SonucDurumu = { success: boolean; message: string } | null;

const borcDuzenleSemasi = z.object({
  iskonto_tutari: z.coerce.number().min(0, "İskonto 0'dan küçük olamaz."),
  faturali: z.coerce.boolean().optional(),
  aciklama: z.string().trim().optional(),
});

const HATA_MESAJLARI: Record<string, string> = {
  yetkisiz: "Bu işlem için yetkiniz yok.",
  hareket_bulunamadi: "Bakiye hareketi bulunamadı.",
  gecersiz_hareket_turu: "Bu hareket bir borç kaydı değil.",
  iskonto_fazla: "İskonto tutarı borç tutarından büyük olamaz.",
};

function hataMesajiCevir(mesaj: string | undefined) {
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
  for (const [anahtar, turkce] of Object.entries(HATA_MESAJLARI)) {
    if (mesaj.includes(anahtar)) {
      return turkce;
    }
  }
  return "Kaydedilemedi, lütfen tekrar deneyin.";
}

// Hasta Detayı > Cari & Ödeme'deki borcDuzenle'den bilinçli olarak AYRI:
// o action yetkiliHastaVeKlinikGetir üzerinden yalnız klinik_admin/resepsiyon'a
// açık (odemeAl gibi diğer hasta işlemleriyle aynı geniş yetki kapısını
// paylaşıyor). Muhasebe rolü kök CLAUDE.md'de "dar kapsam: fatura kesme"
// olarak tanımlı — o yetkiyi SADECE bu ekrana, SADECE bu RPC'ye açmak için
// ayrı, dar bir action.
export async function finansBorcDuzenle(
  hareketId: string,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, message: "Oturum bulunamadı." };
  }

  const { data: kullanici } = await supabase.from("kullanici").select("rol").eq("id", user.id).single();

  const yetkili =
    kullanici?.rol === "klinik_admin" ||
    kullanici?.rol === "resepsiyon" ||
    kullanici?.rol === "muhasebe" ||
    kullanici?.rol === "super_admin";

  if (!yetkili) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const ayristirma = borcDuzenleSemasi.safeParse({
    iskonto_tutari: formData.get("iskonto_tutari") || 0,
    faturali: formData.get("faturali") === "on",
    aciklama: formData.get("aciklama") ?? "",
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { iskonto_tutari, faturali, aciklama } = ayristirma.data;

  const { error } = await supabase.rpc("hasta_bakiye_hareket_borc_duzenle", {
    p_hareket_id: hareketId,
    p_iskonto_tutari: iskonto_tutari,
    p_faturali: faturali ?? false,
    p_aciklama: aciklama ? aciklama : null,
  });

  if (error) {
    console.error("Borç düzenlenemedi:", error);
    return { success: false, message: hataMesajiCevir(error.message) };
  }

  revalidatePath("/panel/finans/gelirler-takibi/faturalar");
  return { success: true, message: "Kaydedildi." };
}

const faturaBilgisiSemasi = z
  .object({
    eposta: z.string().trim().email("Geçersiz e-posta.").optional(),
    kimlik_no_tipi: z.enum(["tc", "pasaport"]).optional(),
    kimlik_no: z.string().trim().optional(),
    adres: z.string().trim().min(5, "Adres en az 5 karakter olmalı.").optional(),
  })
  .superRefine((deger, ctx) => {
    // Yalnız BU formda yeni girilen kimlik doğrulanır (mevcut kayıtlardaki
    // 10 haneli eski kimlikler etkilenmez, bkz. temelBilgileriGuncelle notu).
    if (deger.kimlik_no && (deger.kimlik_no_tipi ?? "tc") === "tc" && !/^\d{11}$/.test(deger.kimlik_no)) {
      ctx.addIssue({ code: "custom", path: ["kimlik_no"], message: "T.C. Kimlik No 11 haneli olmalı." });
    }
  });

/**
 * Fatura ekranında eksik kalan hasta bilgisini (e-posta / TC-pasaport / adres)
 * sayfadan çıkmadan tamamlar. Yalnız formda GÖNDERİLEN (eksik) alanlar yazılır —
 * `hasta_hassas` upsert'inde diğer kolonlara (anamnez, veli vb.) dokunulmaz.
 *
 * Yetki bilinçli olarak klinik_admin/resepsiyon: kimlik/adres/e-posta idari
 * hasta verisi ve `hasta_hassas` UPDATE RLS'i muhasebe'ye kapalı (kök CLAUDE.md:
 * muhasebe'de hassas veri yönetimi bilinçli kapalı). Muhasebe yalnız uyarı alır.
 */
export async function faturaHastaBilgisiTamamla(
  hastaId: string,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, message: "Oturum bulunamadı." };
  }

  const { data: kullanici } = await supabase.from("kullanici").select("rol").eq("id", user.id).single();
  if (kullanici?.rol !== "klinik_admin" && kullanici?.rol !== "resepsiyon" && kullanici?.rol !== "super_admin") {
    return { success: false, message: "Hasta bilgilerini düzenleme yetkiniz yok." };
  }

  const alan = (ad: string) => {
    const deger = formData.get(ad);
    return typeof deger === "string" && deger.trim() !== "" ? deger : undefined;
  };

  const ayristirma = faturaBilgisiSemasi.safeParse({
    eposta: alan("eposta"),
    kimlik_no_tipi: alan("kimlik_no_tipi"),
    kimlik_no: alan("kimlik_no"),
    adres: alan("adres"),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { eposta, kimlik_no, kimlik_no_tipi, adres } = ayristirma.data;

  if (!eposta && !kimlik_no && !adres) {
    return { success: false, message: "Tamamlanacak bir bilgi girilmedi." };
  }

  // RLS kapsamında hasta görünmüyorsa (başka klinik/yok) sessizce başarılı dönmesin.
  const { data: hasta } = await supabase.from("hasta").select("id").eq("id", hastaId).maybeSingle();
  if (!hasta) {
    return { success: false, message: "Hasta bulunamadı." };
  }

  if (eposta) {
    const { error } = await supabase.from("hasta").update({ eposta }).eq("id", hastaId);
    if (error) {
      console.error("Hasta e-postası güncellenemedi:", error);
      return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
    }
  }

  if (kimlik_no || adres) {
    const { error } = await supabase.from("hasta_hassas").upsert(
      {
        hasta_id: hastaId,
        ...(kimlik_no ? { kimlik_no, kimlik_no_tipi: kimlik_no_tipi ?? "tc" } : {}),
        ...(adres ? { adres } : {}),
      },
      { onConflict: "hasta_id" }
    );
    if (error) {
      console.error("Hasta fatura bilgisi güncellenemedi:", error);
      return {
        success: false,
        message:
          error.code === "23505" ? "Bu kimlik no başka bir hastada kayıtlı." : "Kaydedilemedi, lütfen tekrar deneyin.",
      };
    }
  }

  revalidateHastaDetay(hastaId);
  return { success: true, message: "Hasta bilgileri kaydedildi." };
}
