import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { sema, pgHata, type Tx } from "@/lib/db";
import { TETIKLEYICILER } from "./tetikleyiciler";
import { SESSIZ_SAAT_MUAF_TETIKLEYICILER, gonderimZamani, sessizSaatAyariCoz } from "./sessiz-saat";
import { metniDoldur, sablonuDogrula } from "./icerik";
import { bildirimBaglantisiUret } from "./baglanti";
import type { MesajKanal } from "@/types/mesajlasma";

/**
 * `whatsappIzni` yalnız hasta alıcılarda anlamlı (hasta.whatsapp_izin_durumu); verilmezse izinli sayılır (personel).
 * `ticariIletiOnayi`: hasta.ticari_ileti_onay_tarihi dolu mu — 'ticari' içerikli tetikleyiciler hastaya
 * ancak bu `true` ise gönderilir (verilmezse onay YOK sayılır).
 */
type AliciAdres = { telefon: string | null; eposta: string | null; whatsappIzni?: boolean; ticariIletiOnayi?: boolean };

export type AnlikMesajParametreleri = {
  klinikId: string;
  tetikleyiciKodu: string;
  aliciTipi: "personel" | "hasta";
  aliciId: string;
  adres: AliciAdres;
  /** Mesaja girebilen TEK bilgi: klinik adı (lib/mesaj/icerik.ts). Ad, tarih, tutar vb. mesaja girmez; alıcı bağlantıdan uygulamada görür. */
  klinikAdi: string;
  /**
   * Verilirse (kanal eki eklenerek) idempotency anahtarı olarak kullanılır — aynı olay tekrar tetiklense de (örn. aynı seans iki kez "bitirilse")
   * kuyruğa TEK satır düşer (UNIQUE ihlali sessizce yutulur, o satır için üretilen bağlantı da geri alınır). Anahtar klinik kimliğiyle
   * ön eklenir: farklı kliniklerin anahtarları çakışıp bir kliniğin mesajını sessizce düşüremez. Verilmezse her çağrı benzersizdir.
   */
  idempotencyTemeli?: string;
  /**
   * Sessiz saat (bkz. sessiz-saat.ts) mesajı ileri bir zamana erteleyecekse ve o zaman bunu AŞIYORSA mesaj hiç kuyruğa yazılmaz — ör. 2 saat önce
   * hatırlatması sabah 06:00'da üretilip 08:00'e ertelenirse randevu saatinden sonra giderdi. Verilmezse erteleme sınırsızdır.
   */
  enGecGonderimZamani?: Date;
};

/**
 * "anlik" tetikleme tipindeki bir olay gerçekleştiğinde mesaj_kuyrugu'na satır ekler. Tenant bağlamlı: withTenant transaction'ı (ya da bakım
 * betiğinin klinik başına açtığı sistem bağlamı) içinde çağrılır; RLS aynen geçerli. Mesaj göndermek bir yan etkidir, DB transaction'ının parçası
 * olmamalı: gönderimi kuyruk işçisi (scripts/bakim/mesaj-kuyruk-isle) yapar.
 *
 * Aktif değilse (kural yok veya aktif=false) veya adres eksikse SESSİZCE atlar (bkz. kural-cozumle.ts "kayıt yoksa pasif" ilkesi).
 * Şablon KVKK kuralına uymuyorsa (bilinmeyen değişken, kimlik/IBAN/telefon deseni) mesaj yazılmaz ve hata günlüğe düşer — göndermeden hemen önce
 * ikinci kez doğrulanır (kaydetme anındaki doğrulama atlatılmış olsa da, ör. eski kayıt).
 * Her kuyruk satırı kendi savepoint'inde (iç transaction) yazılır: beklenen hatalar (23505) dış transaction'ı ABORT ETMEZ.
 */
export async function anlikMesajTetikle(tx: Tx, params: AnlikMesajParametreleri): Promise<void> {
  const tanim = TETIKLEYICILER.find((t) => t.kod === params.tetikleyiciKodu);
  if (!tanim) {
    console.error(`[mesaj] bilinmeyen tetikleyici kodu: ${params.tetikleyiciKodu}`);
    return;
  }
  // KVKK/İYS: ticari (pazarlama) ileti, hastanın ticari ileti onayı yoksa hiç kuyruğa girmez.
  if (tanim.icerikTipi === "ticari" && params.aliciTipi === "hasta" && params.adres.ticariIletiOnayi !== true) return;

  const kural = (
    await tx
      .select({ aktif: sema.mesajKurallari.aktif, smsAktif: sema.mesajKurallari.smsAktif, whatsappAktif: sema.mesajKurallari.whatsappAktif, mailAktif: sema.mesajKurallari.mailAktif, mesajMetni: sema.mesajKurallari.mesajMetni })
      .from(sema.mesajKurallari)
      .where(and(eq(sema.mesajKurallari.klinikId, params.klinikId), eq(sema.mesajKurallari.tetikleyiciKodu, params.tetikleyiciKodu)))
      .limit(1)
  )[0];
  if (!kural || !kural.aktif) return;

  const sablon = kural.mesajMetni || tanim.varsayilanMesajMetni;
  const kontrol = sablonuDogrula(sablon);
  if (!kontrol.gecerli) {
    console.error(`[mesaj] şablon KVKK kuralına uymuyor, mesaj yazılmadı (${params.tetikleyiciKodu}): ${kontrol.neden}`);
    return;
  }

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

  const kanallar: { kanal: MesajKanal; aktif: boolean; adres: string | null }[] = [
    { kanal: "sms", aktif: kural.smsAktif, adres: params.adres.telefon },
    { kanal: "whatsapp", aktif: kural.whatsappAktif && params.adres.whatsappIzni !== false, adres: params.adres.telefon },
    { kanal: "mail", aktif: kural.mailAktif, adres: params.adres.eposta },
  ];

  for (const k of kanallar) {
    if (!k.aktif || !k.adres) continue;
    const temel = params.idempotencyTemeli ?? `${params.tetikleyiciKodu}:${params.aliciId}:${randomUUID()}`;
    const idempotencyAnahtari = `${params.klinikId}:${temel}:${k.kanal}`;
    try {
      await tx.transaction(async (s) => {
        // Her kanal satırına AYRI tek kullanımlık bağlantı. Anahtar zaten varsa insert 23505 verir ve bu savepoint (bağlantı satırı dahil) geri alınır.
        const baglanti = await bildirimBaglantisiUret(s, { klinikId: params.klinikId, aliciTipi: params.aliciTipi, tetikleyiciKodu: params.tetikleyiciKodu });
        await s.insert(sema.mesajKuyrugu).values({
          klinikId: params.klinikId,
          tetikleyiciKodu: params.tetikleyiciKodu,
          kanal: k.kanal,
          aliciTipi: params.aliciTipi,
          aliciId: params.aliciId,
          aliciAdres: k.adres!,
          gonderilecekMetin: metniDoldur(sablon, { klinikAdi: params.klinikAdi || "Klinik", baglanti }),
          idempotencyAnahtari,
          ...(planlananZaman ? { planlananZaman } : {}),
        });
      });
    } catch (e) {
      // 23505 = aynı idempotency anahtarı zaten kuyrukta: beklenen, hata değil.
      if (pgHata(e).kod !== "23505") console.error(`[mesaj] mesaj_kuyrugu insert hatası (${params.tetikleyiciKodu}/${k.kanal}):`, pgHata(e).mesaj);
    }
  }
}
