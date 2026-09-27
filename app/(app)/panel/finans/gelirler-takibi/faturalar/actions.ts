"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { FATURA_ALAN_ETIKETLERI } from "@/lib/fatura/eksik-bilgi";

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
