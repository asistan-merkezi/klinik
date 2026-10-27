import { rpc, type Tx } from "@/lib/db";

/**
 * Randevu yazılırken terapistin O GÜN çalışabilir olup olmadığı:
 *  - işten çıkış tarihi randevu gününden önceyse (çıkış günü dahil son gün) atanamaz;
 *  - onaylı izin talebi o günü kapsıyorsa ya da puantajda o gün izinli/raporlu ise atanamaz.
 *
 * Önceden yalnız çıkış tarihi BUGÜNE göre kontrol ediliyordu (31 Ekim'de ayrılacak birine Kasım
 * randevusu verilebiliyordu) ve izin/rapor hiç kontrol edilmiyordu (CLAUDE.md "izinli saate randevu
 * yazılamaz" diyordu). Vardiya/çalışma saati kontrolü hâlâ YOK (bkz. musait-saatler.ts).
 */
export type TerapistUygunluk = {
  cikisTarihi: string | null;
  /** "YYYY-MM-DD" — onaylı izin aralıkları + puantajdaki izinli/raporlu günler */
  izinliGunler: Set<string>;
};

/** Saf: bir günün engel mesajı (yoksa null). Test: terapist-uygunluk.test.ts */
export function terapistGunEngeli(u: TerapistUygunluk, tarih: string): string | null {
  if (u.cikisTarihi && u.cikisTarihi < tarih) return "Seçilen terapist bu tarihte işten ayrılmış olacak, randevu atanamaz.";
  if (u.izinliGunler.has(tarih)) return "Seçilen terapist bu tarihte izinli/raporlu, randevu atanamaz.";
  return null;
}

/** Saf: [bas, bit] izin aralığının [sinirBas, sinirBit] ile kesişen günleri. */
export function aralikGunleri(bas: string, bit: string, sinirBas: string, sinirBit: string): string[] {
  const ilk = bas > sinirBas ? bas : sinirBas;
  const son = bit < sinirBit ? bit : sinirBit;
  const gunler: string[] = [];
  const [y, a, g] = ilk.split("-").map(Number);
  for (let d = new Date(Date.UTC(y, a - 1, g)); ; d.setUTCDate(d.getUTCDate() + 1)) {
    const s = d.toISOString().slice(0, 10);
    if (s > son) break;
    gunler.push(s);
  }
  return gunler;
}

/**
 * Terapist kliniğin değilse / bulunamazsa null döner. İzin/puantaj kayıtları rol bazlı RLS'e takılabileceğinden (resepsiyon/terapist başka
 * personelin izin kaydını göremez) okuma DAR bir DEFINER fonksiyondan yapılır (`terapist_uygunluk_getir`, migration 0009): yalnız tarih bilgisi
 * döner (izin türü/gerekçe/belge ve "izinli mi raporlu mu" ayrımı dışarı çıkmaz), çağıranın tenant'ı ve rolü fonksiyon içinde doğrulanır.
 */
export async function terapistUygunlukGetir(tx: Tx, terapistId: string, basTarih: string, bitTarih: string): Promise<TerapistUygunluk | null> {
  const satir = (await rpc<{ terapist_uygunluk_getir: { cikis_tarihi: string | null; izinli_gunler: string[] } | null }>(tx, "terapist_uygunluk_getir", {
    p_terapist_id: terapistId,
    p_bas: basTarih,
    p_bit: bitTarih,
  }))[0]?.terapist_uygunluk_getir;
  if (!satir) return null;
  return { cikisTarihi: satir.cikis_tarihi ?? null, izinliGunler: new Set(satir.izinli_gunler ?? []) };
}

/** Tek gün için kısayol: engel mesajı ya da null. Terapist bulunamazsa da mesaj döner. */
export async function terapistTarihteAtanabilirMi(tx: Tx, terapistId: string, tarih: string): Promise<string | null> {
  const u = await terapistUygunlukGetir(tx, terapistId, tarih, tarih);
  if (!u) return "Terapist bulunamadı.";
  return terapistGunEngeli(u, tarih);
}
