"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type SonucDurumu = { success: boolean; message: string } | null;

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
  musteri_bulunamadi: "Müşteri bulunamadı.",
  urun_bulunamadi: "Seçilen ürün bulunamadı veya pasif.",
  kalem_yok: "En az bir ürün eklenmeli.",
  iskonto_fazla: "İskonto tutarı toplam tutardan büyük olamaz.",
  odeme_tutari_uyusmuyor: "Ödeme satırları toplamı, ödenecek tutara eşit olmalı.",
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
  musteriId: string,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

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

  const { error } = await supabase.rpc("odeme_olustur", {
    p_musteri_id: musteriId,
    p_iskonto_tutari: iskonto_tutari,
    p_faturali: faturali ?? false,
    p_aciklama: aciklama ? aciklama : null,
    p_kalemler: kalemler_json,
    p_satirlar: satirlar_json,
  });

  if (error) {
    console.error("Ödeme oluşturulamadı:", error);
    return { success: false, message: odemeHatasiniCevir(error.message) };
  }

  revalidatePath(`/panel/musteriler/${musteriId}`);
  return { success: true, message: "Ödeme alındı." };
}

export async function faturaTetikle(faturaId: string): Promise<SonucDurumu> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("rol")
    .eq("id", user.id)
    .single();

  if (kullanici?.rol !== "klinik_admin" && kullanici?.rol !== "resepsiyon") {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const { data: fatura } = await supabase.from("fatura").select("id").eq("id", faturaId).single();
  if (!fatura) {
    return { success: false, message: "Fatura bulunamadı." };
  }

  // Paraşüt hesap/kimlik bilgisi henüz yok (bkz. CLAUDE.md); gerçek entegrasyon
  // yazılana kadar fatura durumu "bekliyor" kalır, otomatik/varsayılan bir
  // yeniden deneme yapılmaz (accounting-sync kuralı).
  if (!process.env.PARASUT_CLIENT_ID) {
    return {
      success: false,
      message: "Paraşüt bağlantısı henüz kurulmadı. Hesap bilgileri eklenince bu buton faturayı otomatik kesecek.",
    };
  }

  return { success: false, message: "Fatura kesilemedi, lütfen tekrar deneyin." };
}

type PortalSonucu = { success: boolean; message: string; geciciSifre?: string } | null;

const KARAKTER_HAVUZU = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function geciciSifreUret(): string {
  let sifre = "";
  for (let i = 0; i < 10; i++) {
    sifre += KARAKTER_HAVUZU[Math.floor(Math.random() * KARAKTER_HAVUZU.length)];
  }
  return sifre;
}

async function yetkiliMusteriGetir(musteriId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("rol")
    .eq("id", user.id)
    .single();

  if (kullanici?.rol !== "klinik_admin" && kullanici?.rol !== "resepsiyon") {
    return { supabase, musteri: null, yetkisiz: true as const };
  }

  // RLS klinik_id = current_klinik_id() ile sınırlar; sonuç dönerse müşteri kendi kliniğindendir.
  const { data: musteri } = await supabase.from("musteri").select("id").eq("id", musteriId).single();

  return { supabase, musteri, yetkisiz: false as const };
}

export async function portalErisimiAc(musteriId: string): Promise<PortalSonucu> {
  const { musteri, yetkisiz } = await yetkiliMusteriGetir(musteriId);
  if (yetkisiz) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }
  if (!musteri) {
    return { success: false, message: "Müşteri bulunamadı." };
  }

  const adminClient = createAdminClient();
  const geciciSifre = geciciSifreUret();
  const eposta = `m-${musteri.id}@portal.local`;

  const { data: yeniKullanici, error: createError } = await adminClient.auth.admin.createUser({
    email: eposta,
    password: geciciSifre,
    email_confirm: true,
  });

  if (createError || !yeniKullanici.user) {
    console.error("Portal kullanıcısı oluşturulamadı:", createError);
    return { success: false, message: "Portal erişimi açılamadı, lütfen tekrar deneyin." };
  }

  const { error: insertError } = await adminClient
    .from("musteri_kullanici")
    .insert({ id: yeniKullanici.user.id, musteri_id: musteri.id });

  if (insertError) {
    console.error("musteri_kullanici eklenemedi:", insertError);
    await adminClient.auth.admin.deleteUser(yeniKullanici.user.id);
    return { success: false, message: "Portal erişimi açılamadı, lütfen tekrar deneyin." };
  }

  revalidatePath(`/panel/musteriler/${musteriId}`);
  return { success: true, message: "Portal erişimi açıldı.", geciciSifre };
}

export async function portalSifreSifirla(musteriId: string): Promise<PortalSonucu> {
  const { supabase, musteri, yetkisiz } = await yetkiliMusteriGetir(musteriId);
  if (yetkisiz) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }
  if (!musteri) {
    return { success: false, message: "Müşteri bulunamadı." };
  }

  const { data: mk } = await supabase
    .from("musteri_kullanici")
    .select("id")
    .eq("musteri_id", musteriId)
    .single();

  if (!mk) {
    return { success: false, message: "Portal erişimi bulunamadı." };
  }

  const adminClient = createAdminClient();
  const geciciSifre = geciciSifreUret();
  const { error } = await adminClient.auth.admin.updateUserById(mk.id, { password: geciciSifre });

  if (error) {
    console.error("Portal şifresi sıfırlanamadı:", error);
    return { success: false, message: "Şifre sıfırlanamadı, lütfen tekrar deneyin." };
  }

  return { success: true, message: "Yeni geçici şifre oluşturuldu.", geciciSifre };
}

export async function portalErisimDurumDegistir(musteriId: string, yeniDurum: boolean): Promise<PortalSonucu> {
  const { supabase, musteri, yetkisiz } = await yetkiliMusteriGetir(musteriId);
  if (yetkisiz) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }
  if (!musteri) {
    return { success: false, message: "Müşteri bulunamadı." };
  }

  const { error } = await supabase
    .from("musteri_kullanici")
    .update({ aktif: yeniDurum })
    .eq("musteri_id", musteriId);

  if (error) {
    console.error("Portal erişim durumu güncellenemedi:", error);
    return { success: false, message: "Güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath(`/panel/musteriler/${musteriId}`);
  return { success: true, message: yeniDurum ? "Portal erişimi açıldı." : "Portal erişimi kapatıldı." };
}
