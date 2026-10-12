import type { SupabaseClient } from "@supabase/supabase-js";

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
 * `supabase` kullanıcının RLS'li client'ı: terapist kliniğin değilse null döner.
 * İzin/puantaj kayıtları rol bazlı RLS'e (resepsiyon/terapist göremeyebilir) takılıp kontrolü
 * sessizce geçmesin diye `admin` (servis rolü) ile, yalnız RLS'ten geçmiş personel_id için okunur.
 */
export async function terapistUygunlukGetir(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  terapistId: string,
  basTarih: string,
  bitTarih: string
): Promise<TerapistUygunluk | null> {
  const { data: terapist } = await supabase
    .from("terapist")
    .select("personel_id, personel(isten_cikis_tarihi)")
    .eq("id", terapistId)
    .maybeSingle<{ personel_id: string; personel: { isten_cikis_tarihi: string | null } | null }>();
  if (!terapist) return null;

  const [izinSonucu, puantajSonucu] = await Promise.all([
    admin
      .from("personel_izin_talebi")
      .select("baslangic_tarih, bitis_tarih")
      .eq("personel_id", terapist.personel_id)
      .eq("durum", "onaylandi")
      .lte("baslangic_tarih", bitTarih)
      .gte("bitis_tarih", basTarih),
    admin
      .from("personel_puantaj")
      .select("tarih")
      .eq("personel_id", terapist.personel_id)
      .in("durum", ["izinli", "raporlu"])
      .gte("tarih", basTarih)
      .lte("tarih", bitTarih),
  ]);
  if (izinSonucu.error) throw new Error(izinSonucu.error.message);
  if (puantajSonucu.error) throw new Error(puantajSonucu.error.message);

  const izinliGunler = new Set<string>();
  for (const i of izinSonucu.data ?? []) {
    for (const g of aralikGunleri(i.baslangic_tarih, i.bitis_tarih, basTarih, bitTarih)) izinliGunler.add(g);
  }
  for (const p of puantajSonucu.data ?? []) izinliGunler.add(p.tarih as string);

  return { cikisTarihi: terapist.personel?.isten_cikis_tarihi ?? null, izinliGunler };
}

/** Tek gün için kısayol: engel mesajı ya da null. Terapist bulunamazsa da mesaj döner. */
export async function terapistTarihteAtanabilirMi(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  terapistId: string,
  tarih: string
): Promise<string | null> {
  const u = await terapistUygunlukGetir(supabase, admin, terapistId, tarih, tarih);
  if (!u) return "Terapist bulunamadı.";
  return terapistGunEngeli(u, tarih);
}
