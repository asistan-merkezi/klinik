import type { createAdminClient } from "@/lib/supabase/admin";
import { and, eq } from "drizzle-orm";
import { sema, pgHata, type Tx } from "@/lib/db";
import { TETIKLEYICILER } from "./tetikleyiciler";
import { SESSIZ_SAAT_MUAF_TETIKLEYICILER, gonderimZamani, sessizSaatAyariCoz } from "./sessiz-saat";
import type { MesajKanal } from "@/types/mesajlasma";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * `whatsappIzni` yalnız hasta alıcılarda anlamlı (hasta.whatsapp_izin_durumu); verilmezse izinli sayılır (personel).
 * `ticariIletiOnayi`: hasta.ticari_ileti_onay_tarihi dolu mu — 'ticari' içerikli tetikleyiciler hastaya
 * ancak bu `true` ise gönderilir (verilmezse onay YOK sayılır).
 */
type AliciAdres = { telefon: string | null; eposta: string | null; whatsappIzni?: boolean; ticariIletiOnayi?: boolean };

/**
 * "anlik" tetikleme tipindeki bir olay gerçekleştiğinde mesaj_kuyrugu'na satır
 * ekler — Faz 4'ün (projede daha önce hiç yazılmamış) olay-tetikleme kod
 * yoluna ait TEK ortak fonksiyon. `hasta_belge_goruntule` deseniyle aynı ruh:
 * Postgres'te "bir şey oldu, dışarı bildir" için trigger yeterli değil (mesaj
 * göndermek bir yan etki, DB transaction'ının parçası olmamalı), bu yüzden
 * TS katmanında, RPC başarıyla döndükten SONRA çağrılır.
 *
 * Aktif değilse (kural yok veya aktif=false) veya adres eksikse SESSİZCE atlar
 * — bu "hata" değil, mesajlaşma modülünün Faz 1'den beri kurallı davranışı
 * (bkz. lib/mesaj/kural-cozumle.ts'teki "kayıt yoksa pasif" ilkesi).
 */
export async function anlikMesajTetikleAdmin(
  admin: AdminClient,
  params: {
    klinikId: string;
    tetikleyiciKodu: string;
    aliciTipi: "personel" | "hasta";
    aliciId: string;
    adres: AliciAdres;
    degiskenler: Record<string, string>;
    /**
     * Verilirse (kanal eki eklenerek) idempotency anahtarı olarak kullanılır —
     * aynı olay tekrar tetiklense de (örn. aynı seans iki kez "bitirilse") kuyruğa
     * TEK satır düşer (UNIQUE ihlali sessizce yutulur). Verilmezse eski davranış:
     * her çağrı benzersiz (Date.now()).
     */
    idempotencyTemeli?: string;
    /**
     * Sessiz saat (bkz. sessiz-saat.ts) mesajı ileri bir zamana erteleyecekse ve o zaman bunu AŞIYORSA mesaj hiç
     * kuyruğa yazılmaz — ör. 2 saat önce hatırlatması sabah 06:00'da üretilip 08:00'e ertelenirse randevu saatinden
     * sonra giderdi. Verilmezse erteleme sınırsızdır.
     */
    enGecGonderimZamani?: Date;
  }
): Promise<void> {
  const tanim = TETIKLEYICILER.find((t) => t.kod === params.tetikleyiciKodu);
  if (!tanim) {
    console.error(`[mesaj] bilinmeyen tetikleyici kodu: ${params.tetikleyiciKodu}`);
    return;
  }

  // KVKK/İYS: ticari (pazarlama) ileti, hastanın ticari ileti onayı yoksa hiç kuyruğa girmez.
  if (tanim.icerikTipi === "ticari" && params.aliciTipi === "hasta" && params.adres.ticariIletiOnayi !== true) {
    return;
  }

  const { data: kural } = await admin
    .from("mesaj_kurallari")
    .select("aktif, sms_aktif, whatsapp_aktif, mail_aktif, mesaj_metni")
    .eq("klinik_id", params.klinikId)
    .eq("tetikleyici_kodu", params.tetikleyiciKodu)
    .maybeSingle();

  if (!kural || !kural.aktif) return;

  // Sessiz saat: klinik ayarı (yoksa varsayılan 21:00-08:00 İstanbul). Sessizse planlanan_zaman aralığın bitişine alınır.
  let planlananZaman: string | null = null;
  if (!SESSIZ_SAAT_MUAF_TETIKLEYICILER.includes(params.tetikleyiciKodu)) {
    const { data: ayarSatiri } = await admin
      .from("klinik_ayarlar")
      .select("ayarlar")
      .eq("klinik_id", params.klinikId)
      .maybeSingle();
    const ayar = sessizSaatAyariCoz((ayarSatiri?.ayarlar as Record<string, unknown> | null)?.mesaj_sessiz_saat);
    const simdi = new Date();
    const gonderim = gonderimZamani(simdi, ayar);
    if (gonderim.getTime() !== simdi.getTime()) {
      if (params.enGecGonderimZamani && gonderim > params.enGecGonderimZamani) return;
      planlananZaman = gonderim.toISOString();
    }
  }

  const metinDoldur = (sablon: string) =>
    sablon.replace(/\{\{(\w+)\}\}/g, (tam, ad) => params.degiskenler[ad] ?? tam);

  const metin = metinDoldur(kural.mesaj_metni || tanim.varsayilanMesajMetni);

  const kanallar: { kanal: MesajKanal; aktif: boolean; adres: string | null }[] = [
    { kanal: "sms", aktif: kural.sms_aktif, adres: params.adres.telefon },
    {
      kanal: "whatsapp",
      aktif: kural.whatsapp_aktif && params.adres.whatsappIzni !== false,
      adres: params.adres.telefon,
    },
    { kanal: "mail", aktif: kural.mail_aktif, adres: params.adres.eposta },
  ];

  for (const k of kanallar) {
    if (!k.aktif || !k.adres) continue;

    const idempotencyAnahtari = params.idempotencyTemeli
      ? `${params.idempotencyTemeli}:${k.kanal}`
      : `${params.tetikleyiciKodu}:${params.aliciId}:${k.kanal}:${Date.now()}`;

    const { error } = await admin.from("mesaj_kuyrugu").insert({
      klinik_id: params.klinikId,
      tetikleyici_kodu: params.tetikleyiciKodu,
      kanal: k.kanal,
      alici_tipi: params.aliciTipi,
      alici_id: params.aliciId,
      alici_adres: k.adres,
      gonderilecek_metin: metin,
      idempotency_anahtari: idempotencyAnahtari,
      ...(planlananZaman ? { planlanan_zaman: planlananZaman } : {}),
    });

    // 23505 = aynı idempotency anahtarı zaten kuyrukta: beklenen, hata değil.
    if (error && error.code !== "23505") {
      console.error(`[mesaj] mesaj_kuyrugu insert hatası (${params.tetikleyiciKodu}/${k.kanal}):`, error.message);
    }
  }
}

/** `anlikMesajTetikle` parametreleri (Tx ve eski admin sürümü aynı şekli paylaşır). */
export type AnlikMesajParametreleri = Parameters<typeof anlikMesajTetikleAdmin>[1];

/**
 * Tenant bağlamlı sürüm (withTenant transaction'ı içinde ya da `after()` içinde kendi withTenant'ıyla çağrılır; RLS aynen geçerli).
 * Davranış `anlikMesajTetikleAdmin` ile birebir aynıdır. Not: mesaj yazımı beklenen hatalarda (23505) transaction'ı ABORT ETMEMELİ —
 * bu yüzden her kuyruk satırı kendi savepoint'inde (iç transaction) yazılır.
 */
export async function anlikMesajTetikle(tx: Tx, params: AnlikMesajParametreleri): Promise<void> {
  const tanim = TETIKLEYICILER.find((t) => t.kod === params.tetikleyiciKodu);
  if (!tanim) {
    console.error(`[mesaj] bilinmeyen tetikleyici kodu: ${params.tetikleyiciKodu}`);
    return;
  }
  if (tanim.icerikTipi === "ticari" && params.aliciTipi === "hasta" && params.adres.ticariIletiOnayi !== true) return;

  const kural = (
    await tx
      .select({ aktif: sema.mesajKurallari.aktif, smsAktif: sema.mesajKurallari.smsAktif, whatsappAktif: sema.mesajKurallari.whatsappAktif, mailAktif: sema.mesajKurallari.mailAktif, mesajMetni: sema.mesajKurallari.mesajMetni })
      .from(sema.mesajKurallari)
      .where(and(eq(sema.mesajKurallari.klinikId, params.klinikId), eq(sema.mesajKurallari.tetikleyiciKodu, params.tetikleyiciKodu)))
      .limit(1)
  )[0];
  if (!kural || !kural.aktif) return;

  let planlananZaman: string | null = null;
  if (!SESSIZ_SAAT_MUAF_TETIKLEYICILER.includes(params.tetikleyiciKodu)) {
    const ayarSatiri = (await tx.select({ ayarlar: sema.klinikAyarlar.ayarlar }).from(sema.klinikAyarlar).where(eq(sema.klinikAyarlar.klinikId, params.klinikId)).limit(1))[0];
    const ayar = sessizSaatAyariCoz((ayarSatiri?.ayarlar as Record<string, unknown> | null)?.mesaj_sessiz_saat);
    const simdi = new Date();
    const gonderim = gonderimZamani(simdi, ayar);
    if (gonderim.getTime() !== simdi.getTime()) {
      if (params.enGecGonderimZamani && gonderim > params.enGecGonderimZamani) return;
      planlananZaman = gonderim.toISOString();
    }
  }

  const metin = (kural.mesajMetni || tanim.varsayilanMesajMetni).replace(/\{\{(\w+)\}\}/g, (tam, ad) => params.degiskenler[ad] ?? tam);
  const kanallar: { kanal: MesajKanal; aktif: boolean; adres: string | null }[] = [
    { kanal: "sms", aktif: kural.smsAktif, adres: params.adres.telefon },
    { kanal: "whatsapp", aktif: kural.whatsappAktif && params.adres.whatsappIzni !== false, adres: params.adres.telefon },
    { kanal: "mail", aktif: kural.mailAktif, adres: params.adres.eposta },
  ];

  for (const k of kanallar) {
    if (!k.aktif || !k.adres) continue;
    const idempotencyAnahtari = params.idempotencyTemeli ? `${params.idempotencyTemeli}:${k.kanal}` : `${params.tetikleyiciKodu}:${params.aliciId}:${k.kanal}:${Date.now()}`;
    try {
      // 23505 (aynı idempotency anahtarı zaten kuyrukta) beklenen durumdur; savepoint sayesinde dış transaction bozulmaz.
      await tx.transaction((s) =>
        s.insert(sema.mesajKuyrugu).values({
          klinikId: params.klinikId,
          tetikleyiciKodu: params.tetikleyiciKodu,
          kanal: k.kanal,
          aliciTipi: params.aliciTipi,
          aliciId: params.aliciId,
          aliciAdres: k.adres!,
          gonderilecekMetin: metin,
          idempotencyAnahtari,
          ...(planlananZaman ? { planlananZaman } : {}),
        })
      );
    } catch (e) {
      if (pgHata(e).kod !== "23505") console.error(`[mesaj] mesaj_kuyrugu insert hatası (${params.tetikleyiciKodu}/${k.kanal}):`, pgHata(e).mesaj);
    }
  }
}

/** Bir kliniğin klinik_admin rolündeki, personel kaydı olan üyeleri — izin talebi bildirimi gibi "yöneticiye" olaylar için. */
export async function klinikAdminleriniGetir(
  admin: AdminClient,
  klinikId: string,
  roller: string[] = ["klinik_admin"]
): Promise<{ personelId: string; telefon: string | null; eposta: string | null }[]> {
  const { data: adminKullanicilar } = await admin
    .from("kullanici")
    .select("id")
    .eq("klinik_id", klinikId)
    .in("rol", roller);

  const kullaniciIdler = (adminKullanicilar ?? []).map((k) => k.id);
  if (kullaniciIdler.length === 0) return [];

  const { data: personeller } = await admin
    .from("personel")
    .select("id, eposta, kullanici:kullanici_id(telefon)")
    .in("kullanici_id", kullaniciIdler)
    .eq("aktif", true);

  return (personeller ?? []).map((p) => {
    const kullanici = (Array.isArray(p.kullanici) ? p.kullanici[0] : p.kullanici) as { telefon: string | null } | null;
    return { personelId: p.id, telefon: kullanici?.telefon ?? null, eposta: p.eposta };
  });
}
