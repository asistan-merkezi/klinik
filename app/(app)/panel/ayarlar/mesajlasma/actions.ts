"use server";

import { z } from "zod";
import { mesajKanaliSemasi } from "@/lib/guvenlik/girdi";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { pgHata, sema, withTenant } from "@/lib/db";
import { eylemYetkisi } from "@/lib/auth/yetki";
import { tetikleyiciGetir } from "@/lib/mesaj/tetikleyiciler";
import { metniDoldur, sablonuDogrula } from "@/lib/mesaj/icerik";
import { bildirimBaglantisiUret } from "@/lib/mesaj/baglanti";
import { sessizSaatAraligiGecerliMi } from "@/lib/mesaj/sessiz-saat";
import type { MesajKanal } from "@/types/mesajlasma";

type SonucDurumu = { success: boolean; message: string };

const MESAJ_METNI_MAX_UZUNLUK = 1000;

async function klinikAdminDogrula() {
  const y = await eylemYetkisi(["klinik_admin"]);
  if (!y.yetkili || !y.bag || !y.klinikId || y.ctx.rol !== "klinik_admin") return null;
  return { bag: y.bag, klinikId: y.klinikId, kullaniciId: y.ctx.userId };
}

type KuralGuncellemeAlanlari = {
  aktif: boolean;
  sms_aktif: boolean;
  whatsapp_aktif: boolean;
  mail_aktif: boolean;
  mesaj_metni: string;
};

/**
 * Kural düzenleme dialogundaki TEK "Değişiklikleri Kaydet" butonu — Aktif
 * switch'i, SMS/WhatsApp/Mail kanal seçimi ve mesaj metnini AYNI ANDA, tek
 * satırda kaydeder. Tetikleyici kataloğu artık kodda sabit (bkz. lib/mesaj/
 * tetikleyiciler.ts) — DB'de (mesaj_kurallari) bu tetikleyici için hiç satır
 * olmayabilir ("kayıt yoksa pasif" kuralı), bu yüzden düz `.update()` değil
 * `.upsert()` kullanılıyor: ilk kez kaydedilen bir kural burada satırını
 * oluşturur.
 */
export async function kuralGuncelle(tetikleyiciKodu: string, alanlar: KuralGuncellemeAlanlari): Promise<SonucDurumu> {
  const yetki = await klinikAdminDogrula();
  if (!yetki) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const tanim = tetikleyiciGetir(tetikleyiciKodu);
  if (!tanim) {
    return { success: false, message: "Geçersiz tetikleyici." };
  }
  const alanKontrol = z.object({ aktif: z.boolean(), sms_aktif: z.boolean(), whatsapp_aktif: z.boolean(), mail_aktif: z.boolean(), mesaj_metni: z.string().max(5000) }).safeParse(alanlar);
  if (!alanKontrol.success) return { success: false, message: "Geçersiz veri." };

  const metin = alanlar.mesaj_metni.trim().slice(0, MESAJ_METNI_MAX_UZUNLUK);
  // KVKK: mesajda yalnız {{klinik_adi}} ve {{baglanti}} olabilir; kimlik/IBAN/kart/telefon/e-posta deseni içeren metin kaydedilmez.
  const kontrol = sablonuDogrula(metin);
  if (!kontrol.gecerli) {
    return {
      success: false,
      message:
        kontrol.neden === "bilinmeyen_degisken"
          ? `Bilinmeyen değişken(ler): ${(kontrol.ayrinti ?? []).map((d) => `{{${d}}}`).join(", ")}. Yalnız {{klinik_adi}} ve {{baglanti}} kullanılabilir.`
          : "Mesaj metni kimlik, IBAN, kart, telefon veya e-posta benzeri bilgi içeremez.",
    };
  }

  try {
    await withTenant(yetki.bag, (tx) =>
      tx
        .insert(sema.mesajKurallari)
        .values({ klinikId: yetki.klinikId, tetikleyiciKodu: tetikleyiciKodu, aktif: alanlar.aktif, smsAktif: alanlar.sms_aktif, whatsappAktif: alanlar.whatsapp_aktif, mailAktif: alanlar.mail_aktif, mesajMetni: metin })
        .onConflictDoUpdate({
          target: [sema.mesajKurallari.klinikId, sema.mesajKurallari.tetikleyiciKodu],
          set: { aktif: alanlar.aktif, smsAktif: alanlar.sms_aktif, whatsappAktif: alanlar.whatsapp_aktif, mailAktif: alanlar.mail_aktif, mesajMetni: metin },
        })
    );
  } catch (e) {
    console.error("Mesaj kuralı güncellenemedi:", pgHata(e).mesaj);
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/ayarlar/mesajlasma");
  return { success: true, message: "Değişiklikler kaydedildi." };
}

const KANAL_ALAN = { sms: "sms_aktif", whatsapp: "whatsapp_aktif", mail: "mail_aktif" } as const;

/**
 * "Test Gönder": test_mi=true işaretiyle kuyruğa bir satır yazar; gerçek gönderimi kuyruk işçisi (zamanlanmış betik, birkaç dakika içinde) yapar.
 * Alıcı HER ZAMAN giriş yapmış yöneticinin kendi telefonu/e-postasıdır. Kullanıcı oturumu kuyruk satırını işleyemez (yalnız ekleyebilir);
 * eskiden burada servis rolüyle anında gönderim denenirdi. İçerik de KVKK kuralına tabidir: tek kullanımlık bağlantı taşıyan sabit metin.
 */
export async function testGonder(tetikleyiciKodu: string, kanal: MesajKanal): Promise<SonucDurumu> {
  const yetki = await klinikAdminDogrula();
  if (!yetki) return { success: false, message: "Bu işlem için yetkiniz yok." };
  const tanim = tetikleyiciGetir(tetikleyiciKodu);
  if (!tanim || !mesajKanaliSemasi.safeParse(kanal).success) return { success: false, message: "Geçersiz tetikleyici." };

  try {
    const sonuc = await withTenant(yetki.bag, async (tx) => {
      const kural = (
        await tx
          .select({ aktif: sema.mesajKurallari.aktif, sms_aktif: sema.mesajKurallari.smsAktif, whatsapp_aktif: sema.mesajKurallari.whatsappAktif, mail_aktif: sema.mesajKurallari.mailAktif, metin: sema.mesajKurallari.mesajMetni })
          .from(sema.mesajKurallari)
          .where(and(eq(sema.mesajKurallari.klinikId, yetki.klinikId), eq(sema.mesajKurallari.tetikleyiciKodu, tetikleyiciKodu)))
          .limit(1)
      )[0];
      if (!kural || !kural.aktif || !kural[KANAL_ALAN[kanal]]) return { success: false, message: "Bu kural veya kanal aktif değil — önce kaydedin." };

      const kisi = (
        await tx
          .select({ telefon: sema.kullanici.telefon, eposta: sema.personel.eposta })
          .from(sema.kullanici)
          .leftJoin(sema.personel, eq(sema.personel.kullaniciId, sema.kullanici.id))
          .where(eq(sema.kullanici.id, yetki.kullaniciId))
          .limit(1)
      )[0];
      const aliciAdres = kanal === "mail" ? kisi?.eposta : kisi?.telefon;
      if (!aliciAdres) return { success: false, message: kanal === "mail" ? "Hesabınızda e-posta bulunamadı." : "Hesabınızda telefon numarası bulunamadı." };

      const sablon = kural.metin || tanim.varsayilanMesajMetni;
      if (!sablonuDogrula(sablon).gecerli) return { success: false, message: "Mesaj metni KVKK içerik kuralına uymuyor." };
      const klinik = (await tx.select({ ad: sema.klinik.ad }).from(sema.klinik).where(eq(sema.klinik.id, yetki.klinikId)).limit(1))[0];
      const baglanti = await bildirimBaglantisiUret(tx, { klinikId: yetki.klinikId, aliciTipi: "personel", tetikleyiciKodu });
      await tx.insert(sema.mesajKuyrugu).values({
        klinikId: yetki.klinikId,
        tetikleyiciKodu,
        kanal,
        aliciTipi: "personel",
        aliciId: yetki.kullaniciId,
        aliciAdres,
        gonderilecekMetin: metniDoldur(sablon, { klinikAdi: klinik?.ad ?? "Klinik", baglanti }),
        testMi: true,
        idempotencyAnahtari: `${yetki.klinikId}:test:${tetikleyiciKodu}:${kanal}:${randomUUID()}`,
      });
      return { success: true, message: "Test mesajı kuyruğa alındı; birkaç dakika içinde gönderilir." };
    });
    revalidatePath("/panel/ayarlar/mesajlasma");
    return sonuc;
  } catch (e) {
    console.error("Test mesajı kuyruğa eklenemedi:", pgHata(e).mesaj);
    return { success: false, message: "Test gönderilemedi, lütfen tekrar deneyin." };
  }
}

/**
 * Sessiz saat ayarı (bkz. lib/mesaj/sessiz-saat.ts): `klinik_ayarlar.ayarlar.mesaj_sessiz_saat`.
 * Aynı jsonb'de başka anahtarlar (qr_kodlari, kasa, sidebar_gizli…) bulunduğundan önce mevcut değer okunup
 * yalnız bu anahtar üzerine yazılır (read-modify-write; upsert tüm jsonb'yi ezmesin).
 */
export async function sessizSaatKaydet(kapali: boolean, baslangic: string, bitis: string): Promise<SonucDurumu> {
  const yetki = await klinikAdminDogrula();
  if (!yetki) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }
  if (!kapali && !sessizSaatAraligiGecerliMi(baslangic, bitis)) {
    return { success: false, message: "Başlangıç ve bitiş saati farklı ve SS:DD biçiminde olmalı." };
  }

  try {
    await withTenant(yetki.bag, async (tx) => {
      // Aynı jsonb'de başka anahtarlar (qr_kodlari, kasa, sidebar_gizli…) var: read-modify-write, yalnız bu anahtar değişir.
      const mevcutSatir = (await tx.select({ ayarlar: sema.klinikAyarlar.ayarlar }).from(sema.klinikAyarlar).where(eq(sema.klinikAyarlar.klinikId, yetki.klinikId)).limit(1).for("update"))[0];
      const mevcut = (mevcutSatir?.ayarlar as Record<string, unknown> | null) ?? {};
      const ayarlar = { ...mevcut, mesaj_sessiz_saat: kapali ? { kapali: true } : { baslangic, bitis } };
      await tx.insert(sema.klinikAyarlar).values({ klinikId: yetki.klinikId, ayarlar }).onConflictDoUpdate({ target: sema.klinikAyarlar.klinikId, set: { ayarlar } });
    });
  } catch (e) {
    console.error("Sessiz saat kaydedilemedi:", pgHata(e).mesaj);
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/ayarlar/mesajlasma");
  return { success: true, message: kapali ? "Sessiz saat kapatıldı." : "Sessiz saat kaydedildi." };
}
