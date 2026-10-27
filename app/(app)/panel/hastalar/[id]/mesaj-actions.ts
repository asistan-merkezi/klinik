"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { pgHata, sema, withTenant } from "@/lib/db";
import { eylemYetkisi, YETKISIZ_MESAJI } from "@/lib/auth/yetki";
import { manuelGonderilebilirTetikleyiciler, manuelMetniDoldur } from "@/lib/mesaj/manuel-mesaj";
import type { MesajKanal } from "@/types/mesajlasma";

// Hastaya elle mesaj: yalnız resepsiyon + yönetici (RLS'teki hasta yönetimi kümesiyle aynı).
const IZINLI_ROLLER = ["klinik_admin", "resepsiyon"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type HastaMesajSecenegi = {
  kod: string;
  ad: string;
  metin: string;
  ticari: boolean;
  /** Ticari şablon, hastanın ticari ileti onayı yoksa gönderilemez. */
  engelli: boolean;
};

export type HastaMesajSecenekleri = {
  secenekler: HastaMesajSecenegi[];
  kanallar: { sms: boolean; whatsapp: boolean; mail: boolean };
};

export type HastaMesajGonderSonucu = { success: boolean; message: string };

async function yetkiliHastaGetir(hastaId: string) {
  const y = await eylemYetkisi(IZINLI_ROLLER);
  if (!y.yetkili || !y.bag || !y.klinikId) return { ok: false as const, hata: YETKISIZ_MESAJI };
  if (!UUID.test(hastaId)) return { ok: false as const, hata: "Hasta bulunamadı." };

  // Kullanıcı oturumuyla (RLS) okunur: başka kliniğin hastası burada hiç dönmez.
  const hasta = (
    await withTenant(y.bag, (tx) =>
      tx
        .select({ id: sema.hasta.id, klinikId: sema.hasta.klinikId, adSoyad: sema.hasta.adSoyad, telefon: sema.hasta.telefon, eposta: sema.hasta.eposta, wp: sema.hasta.whatsappIzinDurumu, ticari: sema.hasta.ticariIletiOnayTarihi })
        .from(sema.hasta)
        .where(eq(sema.hasta.id, hastaId))
        .limit(1)
    )
  )[0];
  if (!hasta) return { ok: false as const, hata: "Hasta bulunamadı." };

  const klinik = (await withTenant(y.bag, (tx) => tx.select({ ad: sema.klinik.ad }).from(sema.klinik).where(eq(sema.klinik.id, hasta.klinikId)).limit(1)))[0];
  return { ok: true as const, bag: y.bag, hasta, klinikAdi: klinik?.ad ?? "" };
}

/** Modal açılınca: gönderilebilecek şablonlar (kliniğin kendi metni varsa o, yoksa varsayılan) + hastanın erişilebilir kanalları. */
export async function hastaMesajSecenekleriGetir(hastaId: string): Promise<HastaMesajSecenekleri | { hata: string }> {
  const bag = await yetkiliHastaGetir(hastaId);
  if (!bag.ok) return { hata: bag.hata };
  const { hasta, klinikAdi } = bag;

  const kurallar = await withTenant(bag.bag, (tx) =>
    tx.select({ kod: sema.mesajKurallari.tetikleyiciKodu, metin: sema.mesajKurallari.mesajMetni }).from(sema.mesajKurallari).where(eq(sema.mesajKurallari.klinikId, hasta.klinikId))
  );
  const ozelMetin = new Map(kurallar.map((k) => [k.kod, k.metin ?? ""]));

  const ticariOnayi = !!hasta.ticari;
  const degiskenler = { hasta_adi: hasta.adSoyad, klinik_adi: klinikAdi };

  return {
    secenekler: manuelGonderilebilirTetikleyiciler().map((t) => ({
      kod: t.kod,
      ad: t.ad,
      metin: manuelMetniDoldur(ozelMetin.get(t.kod) || t.varsayilanMesajMetni, degiskenler),
      ticari: t.icerikTipi === "ticari",
      engelli: t.icerikTipi === "ticari" && !ticariOnayi,
    })),
    kanallar: {
      sms: !!hasta.telefon,
      whatsapp: !!hasta.telefon && hasta.wp,
      mail: !!hasta.eposta,
    },
  };
}

const gonderSemasi = z.object({
  kod: z.string().min(1),
  metin: z.string().trim().min(1, "Mesaj metni boş olamaz.").max(1000, "Mesaj en fazla 1000 karakter olabilir."),
  kanallar: z.array(z.enum(["sms", "whatsapp", "mail"])).min(1, "En az bir kanal seçin."),
});

export async function hastaMesajiGonder(
  hastaId: string,
  girdi: { kod: string; metin: string; kanallar: MesajKanal[] }
): Promise<HastaMesajGonderSonucu> {
  const ayristirma = gonderSemasi.safeParse(girdi);
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }
  const { kod, metin, kanallar } = ayristirma.data;

  const tanim = manuelGonderilebilirTetikleyiciler().find((t) => t.kod === kod);
  if (!tanim) return { success: false, message: "Geçersiz mesaj türü." };

  const bag = await yetkiliHastaGetir(hastaId);
  if (!bag.ok) return { success: false, message: bag.hata };
  const { hasta } = bag;

  // KVKK/İYS: ticari ileti onayı yoksa gönderilmez; WhatsApp yalnız izinli hastaya.
  if (tanim.icerikTipi === "ticari" && !hasta.ticari) {
    return { success: false, message: "Hastanın ticari ileti onayı yok, bu mesaj gönderilemez." };
  }

  const adresler: Record<MesajKanal, string | null> = {
    sms: hasta.telefon,
    whatsapp: hasta.wp ? hasta.telefon : null,
    mail: hasta.eposta,
  };

  const atlananlar: MesajKanal[] = [];
  const eklenecekler: { kanal: MesajKanal; adres: string }[] = [];
  for (const kanal of new Set(kanallar)) {
    const adres = adresler[kanal];
    if (!adres) atlananlar.push(kanal);
    else eklenecekler.push({ kanal, adres });
  }
  if (eklenecekler.length === 0) {
    return { success: false, message: "Seçilen kanallar için hastanın iletişim bilgisi/izni yok." };
  }

  try {
    // Tüm kanallar tek transaction'da kuyruğa yazılır. Gönderimi kuyruk işçisi (zamanlanmış betik) yapar; kullanıcı oturumu kuyruk satırını
    // işleyemez/güncelleyemez (yalnız ekleyebilir) — eskiden burada servis rolüyle anında gönderim denenirdi.
    await withTenant(bag.bag, (tx) =>
      tx.insert(sema.mesajKuyrugu).values(
        eklenecekler.map((e) => ({
          klinikId: hasta.klinikId,
          tetikleyiciKodu: kod,
          kanal: e.kanal,
          aliciTipi: "hasta" as const,
          aliciId: hasta.id,
          aliciAdres: e.adres,
          gonderilecekMetin: metin,
          // Elle gönderimde her tıklama ayrı bir mesajdır; aynı metin bilerek tekrar gönderilebilir.
          idempotencyAnahtari: `manuel:${hasta.id}:${kod}:${e.kanal}:${randomUUID()}`,
        }))
      )
    );
  } catch (e) {
    console.error(`[mesaj] elle mesaj kuyruğa yazılamadı (hasta ${hasta.id}):`, pgHata(e).mesaj);
    return { success: false, message: "Mesaj kuyruğa alınamadı, lütfen tekrar deneyin." };
  }

  const atlandiNotu = atlananlar.length > 0 ? ` (${atlananlar.join(", ")} için iletişim bilgisi/izni yok, atlandı)` : "";
  return { success: true, message: `Mesaj kuyruğa alındı, birazdan gönderilecek.${atlandiNotu}` };
}
