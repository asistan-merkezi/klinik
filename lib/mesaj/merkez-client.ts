import type { MesajKanal } from "@/types/mesajlasma";

/**
 * ============================================================================
 * MERKEZ SÖZLEŞMESİ (mesaj.asistanmerkezi tarafında UYGULANMASI ZORUNLU)
 * ============================================================================
 * Bu dosya SADECE istemci (klinik) tarafıdır — merkez servisi bu repoda YOK,
 * ayrı bir Asistan Merkezi projesinde yaşıyor. Aşağıdaki kurallar merkezin
 * KENDİSİNİN uyması gereken zorunluluklardır, burada sadece dokümante
 * ediliyor:
 *
 * 1. IDEMPOTENCY — POST /api/gonder isteğinde `Idempotency-Key` header'ı
 *    ZORUNLU okunmalı. Aynı Idempotency-Key ile ikinci (üçüncü, ...) kez
 *    istek geldiğinde merkez YENİDEN KREDİ DÜŞMEMELİ — ilk çağrının
 *    SONUCUNU (aynı basarili/hata/kalanBakiye/bakiyeVersiyonu) AYNEN
 *    döndürmeli. Bu, klinik tarafının bir ağ hatası sonrası güvenle
 *    retry yapabilmesinin TEK garantisi; merkez bunu uygulamazsa aynı
 *    mesaj birden fazla kez ücretlendirilebilir/gönderilebilir.
 * 2. VERSİYON — her yanıt (başarılı/başarısız fark etmeksizin) o an
 *    geçerli olan `kalanBakiye` + tekil artan bir `bakiyeVersiyonu`
 *    içermeli. Klinik tarafı bunu `merkez_bakiye_versiyonu < gelen`
 *    koşuluyla yazıyor (bkz. mesaj_kredi_senkronla) — versiyon geriye
 *    gitmeyecek şekilde artmalı (örn. monoton bir sayaç veya sıra numarası).
 * 3. HATA KODLARI — `hata` alanı `lib/mesaj/hata-kodlari.ts`'teki bilinen
 *    kodlardan biri olmalı (kredi_yetersiz, izin_yok, gecersiz_alici,
 *    saglayici_hatasi, rate_limit, zaman_asimi) — bilinmeyen bir kod geçici
 *    hata sayılıp 3 kez tekrar denenir, bu yüzden yeni bir kalıcı hata
 *    türü eklenirse HEM merkezde HEM burada aynı anda güncellenmeli.
 * 4. ÖDEME DOĞRULAMASI (kredi yükleme) — /api/kredi-yukle şu an sadece
 *    MESAJ_MERKEZ_API_KEY ile korunuyor, bu TEK BAŞINA YETERLİ DEĞİL.
 *    Merkez, `odemeReferansi` alanını gerçek bir ödeme/tahsilat kaydına
 *    karşı DOĞRULAMAK ZORUNDA — aksi halde bu uç, geçerli bir API
 *    anahtarına sahip herhangi bir çağıranın keyfi miktarda "bedava"
 *    kredi tanımlamasına izin verir. Klinik tarafı bu görevde ayrıca
 *    kendi içinde bir önlem daha aldı (yalnızca super_admin çağırabiliyor,
 *    klinik_admin'in gönderdiği form gerçek krediye dönüşmüyor, bkz.
 *    kredi/[kanal]/actions.ts) ama bu SADECE klinik tarafının önlemi —
 *    merkez KENDİ tarafında ödeme doğrulamasını atlarsa, doğrudan merkez
 *    API'sine erişimi olan başka bir çağıran (başka bir istemci, veya
 *    API anahtarını ele geçiren biri) bu korumayı bypass edebilir.
 * 5. FİYAT ÇİZELGESİ + ÖDEME OTURUMU — /api/kredi-paketleri kanal başına
 *    satılabilir paketleri (id, adet, fiyat) döner; /api/odeme-oturumu
 *    `tenantId + kanal + paketId + donusUrl` alıp merkezin ödeme sayfasının
 *    adresini (`odemeUrl`) döner. Fiyatı HER ZAMAN merkez paketId'den kendisi
 *    çözmeli (istemci fiyat/adet göndermez); ödeme tamamlanınca krediyi
 *    merkez kendi defterine yazar, klinik tarafı bakiyeyi /api/bakiye ile
 *    senkronlar. `donusUrl` yalnız kliniğin kayıtlı alan adlarına izinli
 *    olmalı (open redirect).
 * ============================================================================
 *
 * Gerçek merkez base URL/API anahtarı bu ortamda YOK (kullanıcı onayı: "henüz
 * yok, sadece istemci kodunu yaz") — MESAJ_MERKEZ_BASE_URL tanımlı değilse
 * veya ağ hatası olursa `ulasildi:false` dönülür, kuyruk-isle.ts bunu geçici
 * hata olarak retry backoff'una sokar (bakiye senkronize EDİLMEZ — merkez hiç
 * yanıt vermediyse elimizde güvenilir bir bakiye bilgisi yok).
 */

type MerkezYaniti<T> = { ulasildi: true; veri: T } | { ulasildi: false; hata: string };

export type MerkezGonderGirdi = {
  klinikId: string;
  kanal: MesajKanal;
  aliciAdres: string;
  metin: string;
  idempotencyKey: string;
  testMi: boolean;
  tetikleyiciKodu: string;
};

export type MerkezGonderSonucu =
  | { ulasildi: true; basarili: true; saglayiciMesajId?: string; kalanBakiye: number; bakiyeVersiyonu: number }
  | { ulasildi: true; basarili: false; hata: string; kalanBakiye: number; bakiyeVersiyonu: number }
  | { ulasildi: false; hata: string };

export type MerkezKrediYukleGirdi = {
  klinikId: string;
  kanal: MesajKanal;
  miktar: number;
  odemeReferansi: string;
};

export type MerkezKrediYukleSonucu =
  | { ulasildi: true; basarili: true; kalanBakiye: number; bakiyeVersiyonu: number }
  | { ulasildi: true; basarili: false; hata: string }
  | { ulasildi: false; hata: string };

export type MerkezKrediPaketi = {
  id: string;
  adet: number;
  /** Paketin toplam fiyatı — merkez belirler, klinik tarafı fiyat göndermez (yalnız paket id'si). */
  fiyat: number;
  paraBirimi: string;
};

export type MerkezKrediPaketleriSonucu =
  | { ulasildi: true; paketler: MerkezKrediPaketi[] }
  | { ulasildi: false; hata: string };

export type MerkezOdemeOturumuSonucu =
  | { ulasildi: true; basarili: true; odemeUrl: string }
  | { ulasildi: true; basarili: false; hata: string }
  | { ulasildi: false; hata: string };

export type MerkezBakiyeSonucu =
  | { ulasildi: true; bakiye: number; bakiyeVersiyonu: number }
  | { ulasildi: false; hata: string };

function tabanUrl(): string | null {
  const url = process.env.MESAJ_MERKEZ_BASE_URL;
  return url && url.trim().length > 0 ? url.replace(/\/$/, "") : null;
}

async function merkezeIstekAt<T>(yol: string, gövde: unknown, ekBaslik?: Record<string, string>): Promise<MerkezYaniti<T>> {
  const taban = tabanUrl();
  const anahtar = process.env.MESAJ_MERKEZ_API_KEY;
  if (!taban || !anahtar) {
    return { ulasildi: false, hata: "merkez_yapilandirilmadi" };
  }

  try {
    const yanit = await fetch(`${taban}${yol}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anahtar}`,
        ...ekBaslik,
      },
      body: JSON.stringify(gövde),
      // Merkez yanıtı gecikirse kuyruk-isle'ı sonsuza kadar bloklamasın —
      // geçici hata sayılıp normal backoff'a girsin.
      signal: AbortSignal.timeout(15_000),
    });

    if (!yanit.ok) {
      return { ulasildi: false, hata: `merkez_http_${yanit.status}` };
    }

    const veri = (await yanit.json()) as T;
    return { ulasildi: true, veri };
  } catch (e) {
    return { ulasildi: false, hata: e instanceof Error ? e.message : "merkez_baglanti_hatasi" };
  }
}

export async function merkezeGonder(girdi: MerkezGonderGirdi): Promise<MerkezGonderSonucu> {
  const sonuc = await merkezeIstekAt<{
    basarili: boolean;
    saglayiciMesajId?: string;
    hata?: string;
    kalanBakiye: number;
    bakiyeVersiyonu: number;
  }>(
    "/api/gonder",
    {
      tenantId: girdi.klinikId,
      kanal: girdi.kanal,
      aliciAdres: girdi.aliciAdres,
      metin: girdi.metin,
      testMi: girdi.testMi,
      tetikleyiciKodu: girdi.tetikleyiciKodu,
    },
    { "Idempotency-Key": girdi.idempotencyKey }
  );

  if (!sonuc.ulasildi) {
    return { ulasildi: false, hata: sonuc.hata };
  }

  if (sonuc.veri.basarili) {
    return {
      ulasildi: true,
      basarili: true,
      saglayiciMesajId: sonuc.veri.saglayiciMesajId,
      kalanBakiye: sonuc.veri.kalanBakiye,
      bakiyeVersiyonu: sonuc.veri.bakiyeVersiyonu,
    };
  }

  return {
    ulasildi: true,
    basarili: false,
    hata: sonuc.veri.hata ?? "bilinmeyen_hata",
    kalanBakiye: sonuc.veri.kalanBakiye,
    bakiyeVersiyonu: sonuc.veri.bakiyeVersiyonu,
  };
}

export async function merkezdenKrediYukle(girdi: MerkezKrediYukleGirdi): Promise<MerkezKrediYukleSonucu> {
  const sonuc = await merkezeIstekAt<{ basarili: boolean; hata?: string; kalanBakiye: number; bakiyeVersiyonu: number }>(
    "/api/kredi-yukle",
    {
      tenantId: girdi.klinikId,
      kanal: girdi.kanal,
      miktar: girdi.miktar,
      odemeReferansi: girdi.odemeReferansi,
    }
  );

  if (!sonuc.ulasildi) {
    return { ulasildi: false, hata: sonuc.hata };
  }

  if (sonuc.veri.basarili) {
    return { ulasildi: true, basarili: true, kalanBakiye: sonuc.veri.kalanBakiye, bakiyeVersiyonu: sonuc.veri.bakiyeVersiyonu };
  }

  return { ulasildi: true, basarili: false, hata: sonuc.veri.hata ?? "bilinmeyen_hata" };
}

export async function merkezdenBakiyeCek(klinikId: string, kanal: MesajKanal): Promise<MerkezBakiyeSonucu> {
  const sonuc = await merkezeIstekAt<{ bakiye: number; bakiyeVersiyonu: number }>("/api/bakiye", {
    tenantId: klinikId,
    kanal,
  });

  if (!sonuc.ulasildi) {
    return { ulasildi: false, hata: sonuc.hata };
  }

  return { ulasildi: true, bakiye: sonuc.veri.bakiye, bakiyeVersiyonu: sonuc.veri.bakiyeVersiyonu };
}

export async function merkezdenKrediPaketleriCek(kanal: MesajKanal): Promise<MerkezKrediPaketleriSonucu> {
  const sonuc = await merkezeIstekAt<{ paketler: MerkezKrediPaketi[] }>("/api/kredi-paketleri", { kanal });

  if (!sonuc.ulasildi) {
    return { ulasildi: false, hata: sonuc.hata };
  }

  const paketler = (sonuc.veri.paketler ?? [])
    .filter((p) => p && typeof p.id === "string" && Number.isFinite(p.adet) && Number.isFinite(p.fiyat))
    .sort((a, b) => a.adet - b.adet);
  return { ulasildi: true, paketler };
}

export async function merkezdenOdemeOturumuOlustur(girdi: {
  klinikId: string;
  kanal: MesajKanal;
  paketId: string;
  donusUrl: string;
}): Promise<MerkezOdemeOturumuSonucu> {
  const sonuc = await merkezeIstekAt<{ basarili: boolean; hata?: string; odemeUrl?: string }>("/api/odeme-oturumu", {
    tenantId: girdi.klinikId,
    kanal: girdi.kanal,
    paketId: girdi.paketId,
    donusUrl: girdi.donusUrl,
  });

  if (!sonuc.ulasildi) {
    return { ulasildi: false, hata: sonuc.hata };
  }
  if (sonuc.veri.basarili && sonuc.veri.odemeUrl) {
    return { ulasildi: true, basarili: true, odemeUrl: sonuc.veri.odemeUrl };
  }
  return { ulasildi: true, basarili: false, hata: sonuc.veri.hata ?? "bilinmeyen_hata" };
}
