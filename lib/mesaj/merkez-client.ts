import { createHmac } from "node:crypto";
import type { MesajKanal } from "@/types/mesajlasma";
import { tetikleyiciGetir } from "./tetikleyiciler";

/**
 * ============================================================================
 * ASİSTAN MERKEZİ İSTEMCİSİ — merkezin /api/v1 sözleşmesi (asistanmerkezi CLAUDE.md §6.3–6.5, docs/hata-kodlari.md)
 * ============================================================================
 * Fitness'taki lib/mesaj/merkez-client.ts ile AYNI çekirdek (2026-10-05'te eski /api/gonder taslağının yerine geçti);
 * yalnız dışa açılan imzalar klinik'e özgü.
 *  - Kimlik: `X-Api-Key: amk_…` + `X-Imza: t=<unix>,v1=<hmac-sha256(anahtar, "${t}.${hamGovde}")>` (±300 sn). GET'te gövde boş.
 *  - Proje kullanıcısı = klinik (`disKullaniciId = klinikId`). Merkez tanımadığı kullanıcıya 404 döner: istemci
 *    `/kullanici/senkron` ile kaydedip isteği BİR kez yeniler (ilk mesajda otomatik kayıt).
 *  - IDEMPOTENCY: /mesaj/gonder `Idempotency-Key` zorunlu; kuyruk satırının sabit anahtarı gönderilir (deneme sayısı katılmaz).
 *    Aynı anahtarla tekrar gelen istekte merkez kredi düşmez, kayıtlı yanıtı döner.
 *  - Gönderim ASENKRON: 200 `queued` = merkez kuyruğuna alındı (kredi rezerve). 202 `askida` = kredi yetersiz, merkezde
 *    bekliyor; kredi yüklenince kendiliğinden gider — YENİDEN GÖNDERİLMEZ (ikisi de burada "basarili" sayılır).
 *  - VERSİYON: yanıttaki `kalanBakiye` + monoton `bakiyeVersiyonu` yerel aynaya `mesaj_kredi_senkronla` ile yazılır.
 *    Yanıtta bakiye yoksa (ör. İYS reddi) /kredi/bakiye'den okunur; o da olmazsa versiyon -1 döner (guard yazmaz).
 *  - Mesaj tipi tetikleyici kataloğundan (`icerikTipi`): 'ticari' mesajda merkez İYS izni arar.
 *  - KREDİ: fiyat merkezden (`/kredi/paketler`); istemci yalnız paketId gönderir. Doğrudan "kredi yükle" ucu YOKTUR
 *    (eski `merkezdenKrediYukle` kaldırıldı — API anahtarıyla bedava kredi kapısıydı). Ödeme oturumu
 *    (`/kredi/odeme-oturumu`) merkezde ödeme sağlayıcısı bağlanınca açılacak; o zamana kadar "ulaşılamadı" döner.
 * ============================================================================
 * MESAJ_MERKEZ_BASE_URL / MESAJ_MERKEZ_API_KEY tanımlı değilse `ulasildi:false` döner; kuyruk-isle.ts bunu geçici hata
 * sayar (bakiye senkronlanmaz).
 */

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

export type MerkezKrediPaketi = {
  id: string;
  adet: number;
  /** Paketin toplam fiyatı (TL) — merkez belirler, klinik tarafı fiyat göndermez (yalnız paket id'si). */
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

// --- Ortak çekirdek (klinikle aynı) -------------------------------------------------------------

type MerkezKanal = "sms" | "whatsapp" | "eposta";
const MERKEZ_KANAL: Record<MesajKanal, MerkezKanal> = { sms: "sms", whatsapp: "whatsapp", mail: "eposta" };

type Govde = Record<string, unknown>;
/** Merkezin /kredi/paketler satırı (fiyat kuruş). */
type HamPaket = { paketId: string; adet: number; fiyatKurus: number; paraBirimi: string };
type HamSonuc = { ulasildi: true; status: number; veri: Govde } | { ulasildi: false; hata: string };

/** Yanıtta bakiye olmayan sonuçlarda kullanılır: versiyon -1 yerel guard'ı geçemez, ayna değişmez. */
const BAKIYE_BILINMIYOR = { kalanBakiye: 0, bakiyeVersiyonu: -1 } as const;

function tabanUrl(): string | null {
  const url = process.env.MESAJ_MERKEZ_BASE_URL;
  return url && url.trim().length > 0 ? url.replace(/\/$/, "") : null;
}

export function merkezYapilandirildiMi(): boolean {
  return tabanUrl() !== null && !!process.env.MESAJ_MERKEZ_API_KEY;
}

function imzala(anahtar: string, hamGovde: string): string {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", anahtar).update(`${t}.${hamGovde}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

async function merkezIstegi(yontem: "GET" | "POST", yol: string, govde?: Govde, ekBaslik?: Record<string, string>): Promise<HamSonuc> {
  const taban = tabanUrl();
  const anahtar = process.env.MESAJ_MERKEZ_API_KEY;
  if (!taban || !anahtar) return { ulasildi: false, hata: "merkez_yapilandirilmadi" };

  const hamGovde = yontem === "POST" ? JSON.stringify(govde ?? {}) : "";
  try {
    const yanit = await fetch(`${taban}/api/v1${yol}`, {
      method: yontem,
      headers: { "Content-Type": "application/json", "X-Api-Key": anahtar, "X-Imza": imzala(anahtar, hamGovde), ...ekBaslik },
      body: yontem === "POST" ? hamGovde : undefined,
      // Merkez geç yanıtlarsa kuyruk işleyici bloklanmasın: geçici hata sayılıp normal geri çekilmeye girer.
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    let veri: Govde = {};
    try {
      veri = ((await yanit.json()) as Govde) ?? {};
    } catch {
      veri = {};
    }
    return { ulasildi: true, status: yanit.status, veri };
  } catch (e) {
    return { ulasildi: false, hata: e instanceof Error ? e.message : "merkez_baglanti_hatasi" };
  }
}

async function kullaniciSenkronla(disKullaniciId: string): Promise<boolean> {
  const sonuc = await merkezIstegi("POST", "/kullanici/senkron", { disKullaniciId });
  return sonuc.ulasildi && sonuc.status === 200;
}

/** Merkez tanımadığı kullanıcıya 404 döner: kullanıcıyı kaydedip isteği bir kez yeniler. */
async function senkronluIstek(disKullaniciId: string, istek: () => Promise<HamSonuc>): Promise<HamSonuc> {
  const ilk = await istek();
  if (!ilk.ulasildi || ilk.status !== 404) return ilk;
  if (!(await kullaniciSenkronla(disKullaniciId))) return ilk;
  return istek();
}

async function bakiyeOku(disKullaniciId: string, kanal: MesajKanal): Promise<MerkezBakiyeSonucu> {
  const sorgu = new URLSearchParams({ disKullaniciId, kanal: MERKEZ_KANAL[kanal] });
  const sonuc = await merkezIstegi("GET", `/kredi/bakiye?${sorgu}`);
  if (!sonuc.ulasildi) return { ulasildi: false, hata: sonuc.hata };
  // Merkezde henüz kayıt/cüzdan yok: bakiye 0, versiyon 0 (yerel aynayı ezmez).
  if (sonuc.status === 404) return { ulasildi: true, bakiye: 0, bakiyeVersiyonu: 0 };
  if (sonuc.status !== 200) return { ulasildi: false, hata: `merkez_http_${sonuc.status}` };
  const cuzdan = (sonuc.veri.bakiyeler as { kanal: string; bakiye: number; bakiyeVersiyonu: number }[] | undefined)?.find(
    (b) => b.kanal === MERKEZ_KANAL[kanal]
  );
  return { ulasildi: true, bakiye: Number(cuzdan?.bakiye ?? 0), bakiyeVersiyonu: Number(cuzdan?.bakiyeVersiyonu ?? 0) };
}

/** Bakiyesiz kalıcı sonuçlar için güncel bakiyeyi okur; okunamazsa aynaya dokunmayan değer döner. */
async function bakiyeEki(disKullaniciId: string, kanal: MesajKanal): Promise<{ kalanBakiye: number; bakiyeVersiyonu: number }> {
  const b = await bakiyeOku(disKullaniciId, kanal);
  return b.ulasildi ? { kalanBakiye: b.bakiye, bakiyeVersiyonu: b.bakiyeVersiyonu } : BAKIYE_BILINMIYOR;
}

type GonderCekirdekGirdi = { disKullaniciId: string; kanal: MesajKanal; aliciAdres: string; metin: string; idempotencyKey: string; tetikleyiciKodu: string };

async function gonderCekirdek(girdi: GonderCekirdekGirdi): Promise<MerkezGonderSonucu> {
  const govde: Govde = {
    disKullaniciId: girdi.disKullaniciId,
    kanal: MERKEZ_KANAL[girdi.kanal],
    alici: girdi.aliciAdres,
    mesajTipi: tetikleyiciGetir(girdi.tetikleyiciKodu)?.icerikTipi ?? "hizmet",
    icerik: girdi.metin,
    kaynakBolum: girdi.tetikleyiciKodu,
  };
  const r = await senkronluIstek(girdi.disKullaniciId, () =>
    merkezIstegi("POST", "/mesaj/gonder", govde, { "Idempotency-Key": girdi.idempotencyKey })
  );
  if (!r.ulasildi) return { ulasildi: false, hata: r.hata };

  const v = r.veri;
  const bakiyeVar = typeof v.kalanBakiye === "number" && typeof v.bakiyeVersiyonu === "number";
  const bakiye = () => (bakiyeVar ? { kalanBakiye: v.kalanBakiye as number, bakiyeVersiyonu: v.bakiyeVersiyonu as number } : bakiyeEki(girdi.disKullaniciId, girdi.kanal));
  const kalici = async (hata: string): Promise<MerkezGonderSonucu> => ({ ulasildi: true, basarili: false, hata, ...(await bakiye()) });

  if ((r.status === 200 || r.status === 202) && (v.durum === "queued" || v.durum === "askida")) {
    return { ulasildi: true, basarili: true, saglayiciMesajId: typeof v.mesajIstekId === "string" ? v.mesajIstekId : undefined, ...(await bakiye()) };
  }
  if (r.status === 200 && v.durum === "iys_rejected") return kalici("izin_yok");
  if (r.status === 402) return kalici("kredi_yetersiz");
  if (r.status === 400) return kalici("gecersiz_alici");
  // 422: WhatsApp gönderen kimliği bağlı değil ya da anahtar farklı gövdeyle kullanılmış — tekrar denemek düzeltmez.
  if (r.status === 422) return kalici("izin_yok");
  // 401/404/409/429/5xx (kill switch 503 dahil): geçici — yerel kuyruk geri çekilmeyle aynı anahtarla yeniden dener.
  if (r.status === 429) return { ulasildi: false, hata: "rate_limit" };
  return { ulasildi: false, hata: `merkez_http_${r.status}` };
}

async function paketleriCek(kanal: MesajKanal): Promise<{ ulasildi: true; paketler: HamPaket[] } | { ulasildi: false; hata: string }> {
  const sonuc = await merkezIstegi("GET", `/kredi/paketler?${new URLSearchParams({ kanal: MERKEZ_KANAL[kanal] })}`);
  if (!sonuc.ulasildi) return { ulasildi: false, hata: sonuc.hata };
  if (sonuc.status !== 200) return { ulasildi: false, hata: `merkez_http_${sonuc.status}` };
  const paketler = ((sonuc.veri.paketler ?? []) as HamPaket[]).filter(
    (p) => p && typeof p.paketId === "string" && Number.isInteger(p.adet) && p.adet > 0 && Number.isFinite(p.fiyatKurus) && p.fiyatKurus >= 0
  );
  return { ulasildi: true, paketler: paketler.map((p) => ({ ...p, paraBirimi: p.paraBirimi ?? "TRY" })).sort((a, b) => a.adet - b.adet) };
}

async function odemeOturumu(disKullaniciId: string, paketId: string, donusUrl: string): Promise<{ ulasildi: true; odemeUrl: string } | { ulasildi: false; hata: string }> {
  const sonuc = await senkronluIstek(disKullaniciId, () => merkezIstegi("POST", "/kredi/odeme-oturumu", { disKullaniciId, paketId, donusUrl }));
  if (!sonuc.ulasildi) return { ulasildi: false, hata: sonuc.hata };
  if (sonuc.status !== 200 || typeof sonuc.veri.odemeUrl !== "string") return { ulasildi: false, hata: `merkez_http_${sonuc.status}` };
  return { ulasildi: true, odemeUrl: sonuc.veri.odemeUrl };
}

// --- Klinik imzaları ----------------------------------------------------------------------------

export async function merkezeGonder(girdi: MerkezGonderGirdi): Promise<MerkezGonderSonucu> {
  const { klinikId, ...geri } = girdi;
  return gonderCekirdek({ ...geri, disKullaniciId: klinikId });
}

export async function merkezdenBakiyeCek(klinikId: string, kanal: MesajKanal): Promise<MerkezBakiyeSonucu> {
  return bakiyeOku(klinikId, kanal);
}

/** Merkezin güncel fiyat çizelgesi; adete göre artan sıralı. Fiyat kuruştan TL'ye çevrilir. */
export async function merkezdenKrediPaketleriCek(kanal: MesajKanal): Promise<MerkezKrediPaketleriSonucu> {
  const sonuc = await paketleriCek(kanal);
  if (!sonuc.ulasildi) return sonuc;
  return { ulasildi: true, paketler: sonuc.paketler.map((p) => ({ id: p.paketId, adet: p.adet, fiyat: p.fiyatKurus / 100, paraBirimi: p.paraBirimi })) };
}

export async function merkezdenOdemeOturumuOlustur(girdi: {
  klinikId: string;
  kanal: MesajKanal;
  paketId: string;
  donusUrl: string;
}): Promise<MerkezOdemeOturumuSonucu> {
  const sonuc = await odemeOturumu(girdi.klinikId, girdi.paketId, girdi.donusUrl);
  if (!sonuc.ulasildi) return sonuc;
  return { ulasildi: true, basarili: true, odemeUrl: sonuc.odemeUrl };
}
