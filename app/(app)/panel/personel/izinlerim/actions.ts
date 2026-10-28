"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { pgHata, rpc, sema, withTenant, type TenantBaglami } from "@/lib/db";
import { eylemYetkisi, YETKISIZ_MESAJI } from "@/lib/auth/yetki";
import { anlikMesajTetikle } from "@/lib/mesaj/anlik-tetikle";
import { dosyaSil, dosyaYaz } from "@/lib/dosya/depo";
import { icerikTipiDogrula } from "@/lib/dosya/imza";
import { IZIN_TIP_ETIKETLERI, type IzinTip } from "@/types/izin";
import { formatDate } from "@/lib/datetime";

const IZIN_BELGE_TURLERI: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};
const IZIN_BELGE_MAX_BYTE = 10 * 1024 * 1024;

type SonucDurumu = { success: boolean; message: string } | null;

const talepSemasi = z.object({
  tip: z.enum(["yillik", "mazeret", "ucretsiz", "idari", "telafi"]),
  baslangic_tarih: z.string().min(1, "Başlangıç tarihi seçilmeli."),
  bitis_tarih: z.string().min(1, "Bitiş tarihi seçilmeli."),
  gerekce: z.string().trim().optional(),
});

/** Tüm personel rolleri kendi izin talebini yönetebilir (RPC'ler sahiplik/rolü içeride doğrular). */
const PERSONEL_ROLLERI = ["klinik_admin", "resepsiyon", "terapist", "muhasebe"] as const;

type HedefPersonel = { id: string; adSoyad: string; klinikId: string; klinikAd: string | null };

async function personelBul(bag: TenantBaglami, kosul: { id?: string; kullaniciId?: string }): Promise<HedefPersonel | null> {
  const satir = (
    await withTenant(bag, (tx) =>
      tx
        .select({ id: sema.personel.id, adSoyad: sema.personel.adSoyad, klinikId: sema.personel.klinikId, klinikAd: sema.klinik.ad })
        .from(sema.personel)
        .leftJoin(sema.klinik, eq(sema.klinik.id, sema.personel.klinikId))
        .where(kosul.id ? eq(sema.personel.id, kosul.id) : eq(sema.personel.kullaniciId, kosul.kullaniciId ?? ""))
        .limit(1)
    )
  )[0];
  return satir ?? null;
}

/**
 * klinik_admin/muhasebe formdan bir personel_id seçmişse ONUN adına talep oluşturulur (RPC tarafı da bu iki rolü ayrıca yetkilendirir) —
 * aksi halde her zaman çağıranın kendi personel kaydına düşer (self-servis). Tenant dışı kimlik RLS ile görünmez → "bulunamadı".
 */
export async function izinTalebiOlustur(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const y = await eylemYetkisi(PERSONEL_ROLLERI);
  if (!y.yetkili || !y.bag || !y.klinikId) return { success: false, message: YETKISIZ_MESAJI };
  const bag = y.bag;

  const secimYapabilir = y.ctx.rol === "klinik_admin" || y.ctx.rol === "muhasebe";
  const secilen = formData.get("personel_id");
  const personel =
    secimYapabilir && typeof secilen === "string" && secilen
      ? z.string().uuid().safeParse(secilen).success
        ? await personelBul(bag, { id: secilen })
        : null
      : await personelBul(bag, { kullaniciId: y.ctx.userId });
  if (!personel) {
    return { success: false, message: "Personel bulunamadı." };
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

  // Belge: DOSYA_KOKU/personel-belge/<klinik>/izin/<personel>/<zaman>.<uzantı>. Tür ve boyut sunucuda zorlanır (formdaki `accept` yalnız ipucu),
  // uzantı kullanıcı adından değil MIME türünden; dosya imzası (magic number) türle uyuşmalı.
  let belgeUrl: string | null = null;
  let belgeParcalari: string[] | null = null;
  const belgeDosyasi = formData.get("belge");
  if (belgeDosyasi instanceof File && belgeDosyasi.size > 0) {
    const uzanti = IZIN_BELGE_TURLERI[belgeDosyasi.type];
    if (!uzanti) {
      return { success: false, message: "Belge yalnız PDF, JPG veya PNG olabilir." };
    }
    if (belgeDosyasi.size > IZIN_BELGE_MAX_BYTE) {
      return { success: false, message: "Belge en fazla 10 MB olabilir." };
    }
    const veri = Buffer.from(await belgeDosyasi.arrayBuffer());
    if (!icerikTipiDogrula(belgeDosyasi.type, veri)) {
      return { success: false, message: "Belge içeriği dosya türüyle uyuşmuyor." };
    }
    belgeParcalari = [personel.klinikId, "izin", personel.id, `${Date.now()}.${uzanti}`];
    try {
      await dosyaYaz("personel-belge", belgeParcalari, veri);
    } catch (e) {
      console.error("İzin belgesi yüklenemedi:", e instanceof Error ? e.message : e);
      return { success: false, message: "Belge yüklenemedi, lütfen tekrar deneyin." };
    }
    belgeUrl = belgeParcalari.join("/");
  }

  try {
    await withTenant(bag, (tx) =>
      rpc(tx, "personel_izin_talep_olustur", {
        p_personel_id: personel.id,
        p_tip: tip,
        p_baslangic_tarih: baslangic_tarih,
        p_bitis_tarih: bitis_tarih,
        p_gerekce: gerekce ? gerekce : null,
        p_belge_url: belgeUrl,
      })
    );
  } catch (e) {
    const m = pgHata(e).mesaj;
    console.error("İzin talebi oluşturulamadı:", m);
    if (belgeParcalari) await dosyaSil("personel-belge", belgeParcalari).catch(() => undefined); // yetim dosya bırakma
    const mesaj =
      m === "gun_sayisi_sifir"
        ? "Seçilen tarih aralığında hiç iş günü yok (hafta tatili/resmi tatil)."
        : m === "tarih_araligi_gecersiz"
          ? "Bitiş tarihi başlangıçtan önce olamaz."
          : "İzin talebi oluşturulamadı, lütfen tekrar deneyin.";
    return { success: false, message: mesaj };
  }

  // Yöneticilere bildirim — RPC başarıyla döndükten SONRA, en iyi çaba: bildirim gönderilemese bile talep oluştu, kullanıcıya hata gösterilmez.
  try {
    await withTenant(bag, async (tx) => {
      const yoneticiler = await rpc<{ personel_id: string; telefon: string | null; eposta: string | null }>(tx, "izin_bildirim_alicilari", { p_roller: ["klinik_admin", "muhasebe"] });
      const degiskenler = {
        personel_adi: personel.adSoyad,
        izin_tip: IZIN_TIP_ETIKETLERI[tip as IzinTip],
        tarih_araligi: `${formatDate(baslangic_tarih)} – ${formatDate(bitis_tarih)}`,
        klinik_adi: personel.klinikAd ?? "",
      };
      for (const yonetici of yoneticiler) {
        await anlikMesajTetikle(tx, {
          klinikId: personel.klinikId,
          tetikleyiciKodu: "personel_izin_talebi_yeni",
          aliciTipi: "personel",
          aliciId: yonetici.personel_id,
          adres: { telefon: yonetici.telefon, eposta: yonetici.eposta },
          degiskenler,
        });
      }
    });
  } catch (bildirimHatasi) {
    console.error("İzin talebi bildirimi gönderilemedi:", pgHata(bildirimHatasi).mesaj);
  }

  revalidatePath("/panel/personel/izinlerim");
  revalidatePath("/panel/personel/izinler");
  return { success: true, message: "İzin talebiniz oluşturuldu, onay bekliyor." };
}

export async function izinTalebiIptalEt(talepId: string): Promise<SonucDurumu> {
  const y = await eylemYetkisi(PERSONEL_ROLLERI);
  if (!y.yetkili || !y.bag) return { success: false, message: YETKISIZ_MESAJI };
  if (!z.string().uuid().safeParse(talepId).success) return { success: false, message: "Talep bulunamadı." };

  const personel = await personelBul(y.bag, { kullaniciId: y.ctx.userId });
  if (!personel) {
    return { success: false, message: "Personel kaydınız bulunamadı." };
  }

  try {
    // RPC yalnız talebin SAHİBİ personelin iptaline izin verir.
    await withTenant(y.bag, (tx) => rpc(tx, "personel_izin_talep_iptal_et", { p_talep_id: talepId }));
  } catch (e) {
    const m = pgHata(e).mesaj;
    console.error("İzin talebi iptal edilemedi:", m);
    return { success: false, message: m === "gecersiz_durum_gecisi" ? "Bu talep artık iptal edilemez (beklemede değil)." : "İptal edilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/personel/izinlerim");
  revalidatePath("/panel/personel/izinler");
  return { success: true, message: "Talep iptal edildi." };
}
