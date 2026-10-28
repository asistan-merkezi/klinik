"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { pgHata, rpc, sema, snakeKolonlari, withTenant } from "@/lib/db";
import { finansOturumu } from "@/lib/finans/eylem";
import { negatifOlmayanTutarKurus } from "@/lib/finans/tutar";
import { kurusMetni } from "@/lib/para";
import { YETKISIZ_MESAJI } from "@/lib/auth/yetki";
import { FATURA_ALAN_ETIKETLERI } from "@/lib/fatura/eksik-bilgi";
import { revalidateHastaDetay } from "@/app/(app)/panel/hastalar/[id]/revalidate";

type SonucDurumu = { success: boolean; message: string } | null;

const borcDuzenleSemasi = z.object({
  iskonto_tutari: negatifOlmayanTutarKurus("İskonto 0'dan küçük olamaz."),
  faturali: z.coerce.boolean().optional(),
  aciklama: z.string().trim().optional(),
});

const HATA_MESAJLARI: Record<string, string> = {
  yetkisiz: "Bu işlem için yetkiniz yok.",
  hareket_bulunamadi: "Bakiye hareketi bulunamadı.",
  gecersiz_hareket_turu: "Bu hareket bir borç kaydı değil.",
  iskonto_fazla: "İskonto tutarı borç tutarından büyük olamaz.",
  fatura_kesilmis: "Bu borcun faturası kesilmiş; tutarı değiştirilemez. Önce faturayı iptal/iade edin.",
  fatura_tutari_sifir: "Net tutarı 0 olan borç faturalanamaz (tam iskonto).",
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
  const o = await finansOturumu(["klinik_admin", "resepsiyon", "muhasebe"]);
  if (!o) {
    return { success: false, message: YETKISIZ_MESAJI };
  }
  if (!z.string().uuid().safeParse(hareketId).success) {
    return { success: false, message: "Bakiye hareketi bulunamadı." };
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

  try {
    // RPC rol (klinik_admin/resepsiyon/muhasebe) + tenant + hareket sahipliğini kendisi doğrular.
    await withTenant(o.bag, (tx) =>
      rpc(tx, "hasta_bakiye_hareket_borc_duzenle", {
        p_hareket_id: hareketId,
        p_iskonto_tutari: kurusMetni(iskonto_tutari),
        p_faturali: faturali ?? false,
        p_aciklama: aciklama ? aciklama : null,
      })
    );
  } catch (e) {
    const h = pgHata(e);
    console.error("Borç düzenlenemedi:", h.mesaj);
    return { success: false, message: hataMesajiCevir(h.mesaj) };
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
  const o = await finansOturumu(["klinik_admin", "resepsiyon"]);
  if (!o) {
    return { success: false, message: "Hasta bilgilerini düzenleme yetkiniz yok." };
  }
  if (!z.string().uuid().safeParse(hastaId).success) {
    return { success: false, message: "Hasta bulunamadı." };
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

  try {
    // hasta + hasta_hassas TEK transaction; RLS kapsamında hasta görünmüyorsa (başka klinik/yok) sessizce başarılı dönmez.
    const bulundu = await withTenant(o.bag, async (tx) => {
      const hasta = await tx.select({ id: sema.hasta.id }).from(sema.hasta).where(eq(sema.hasta.id, hastaId)).limit(1);
      if (hasta.length === 0) return false;
      if (eposta) await tx.update(sema.hasta).set({ eposta }).where(eq(sema.hasta.id, hastaId));
      if (kimlik_no || adres) {
        const degerler = snakeKolonlari(sema.hastaHassas, {
          ...(kimlik_no ? { kimlik_no, kimlik_no_tipi: kimlik_no_tipi ?? "tc" } : {}),
          ...(adres ? { adres } : {}),
        });
        await tx.insert(sema.hastaHassas).values({ hastaId, klinikId: o.klinikId, ...degerler }).onConflictDoUpdate({ target: sema.hastaHassas.hastaId, set: degerler });
      }
      return true;
    });
    if (!bulundu) return { success: false, message: "Hasta bulunamadı." };
  } catch (e) {
    const h = pgHata(e);
    console.error("Hasta fatura bilgisi güncellenemedi:", h.mesaj);
    return { success: false, message: h.kod === "23505" ? "Bu kimlik no başka bir hastada kayıtlı." : "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidateHastaDetay(hastaId);
  return { success: true, message: "Hasta bilgileri kaydedildi." };
}
