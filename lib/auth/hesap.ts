// Kimlik hesabı yaşam döngüsü (yalnız kimlik_rolu havuzu). Hesapları YÖNETİCİ/RESEPSİYON oluşturur; Better Auth sign-up kapalıdır.
//
// İKİ HAVUZ UYARISI: kimlik kaydı (kimlik_rolu) ve tenant satırı (kullanici / hasta_kullanici, klinik_uygulama) ayrı bağlantılar/transaction'lardır.
// Sıra: önce kimlik hesabı, sonra tenant satırı; tenant yazımı düşerse çağıran `kimlikHesabiSil(id)` ile geri alır (örnek: docs/platform-katmani.md).
import { randomUUID } from "node:crypto";
import { kimlikHavuzu } from "@/lib/db/havuz-kimlik";
import { geciciSifreUret, sifreHashle } from "./sifre";

export type PersonelRolu = "super_admin" | "klinik_admin" | "resepsiyon" | "terapist" | "muhasebe";
export const HASTA_GECICI_SIFRE_GUN = 7;

/** Panel kuralı: yalnız klinik_admin/super_admin e-postayla girer; diğer roller yalnız telefonla girer. */
export const telefonlaGirisRolu = (rol: PersonelRolu) => rol !== "klinik_admin" && rol !== "super_admin";

export type HesapSonucu = { id: string; geciciSifre: string; geciciSifreBitis: Date | null };

export async function personelHesabiOlustur(g: { id?: string; eposta: string; ad: string; telefon?: string | null; rol: PersonelRolu; klinikId?: string | null; geciciSifre?: string }): Promise<HesapSonucu> {
  const id = g.id ?? randomUUID();
  const sifre = g.geciciSifre ?? geciciSifreUret();
  const parolaHash = await sifreHashle(sifre);
  const c = await kimlikHavuzu().connect();
  try {
    await c.query("BEGIN");
    await c.query(
      `insert into kimlik_kullanici(id, ad, eposta, eposta_dogrulandi, telefon, tur, klinik_id, telefonla_giris, sifre_degistirmeli)
       values ($1, $2, $3, true, $4, 'personel', $5, $6, true)`,
      [id, g.ad, g.eposta.trim().toLowerCase(), g.telefon ?? null, g.klinikId ?? null, telefonlaGirisRolu(g.rol)]
    );
    await c.query(`insert into kimlik_hesap(kullanici_id, saglayici_id, hesap_id, parola_hash) values ($1::uuid, 'credential', $1::text, $2)`, [id, parolaHash]);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
  return { id, geciciSifre: sifre, geciciSifreBitis: null };
}

/** Hasta portal hesabı: giriş tanımlayıcısı (klinik, telefon). E-posta sentetiktir ve kullanıcıya gösterilmez. */
export async function hastaHesabiOlustur(g: { id?: string; hastaId: string; klinikId: string; ad: string; telefon: string; geciciSifre?: string }): Promise<HesapSonucu> {
  const id = g.id ?? randomUUID();
  const sifre = g.geciciSifre ?? geciciSifreUret();
  const parolaHash = await sifreHashle(sifre);
  const bitis = new Date(Date.now() + HASTA_GECICI_SIFRE_GUN * 24 * 60 * 60 * 1000);
  const c = await kimlikHavuzu().connect();
  try {
    await c.query("BEGIN");
    await c.query(
      `insert into kimlik_kullanici(id, ad, eposta, eposta_dogrulandi, telefon, tur, klinik_id, hasta_id, telefonla_giris, sifre_degistirmeli, gecici_sifre_bitis)
       values ($1, $2, $3, true, $4, 'hasta', $5, $6, false, true, $7)`,
      [id, g.ad, `h-${g.hastaId}@portal.invalid`, g.telefon, g.klinikId, g.hastaId, bitis]
    );
    await c.query(`insert into kimlik_hesap(kullanici_id, saglayici_id, hesap_id, parola_hash) values ($1::uuid, 'credential', $1::text, $2)`, [id, parolaHash]);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
  return { id, geciciSifre: sifre, geciciSifreBitis: bitis };
}

/** Resepsiyonun hastaya (veya yöneticinin personele) yeni geçici şifre vermesi: eski oturumlar iptal, değiştirme zorunlu. */
export async function geciciSifreYenile(kullaniciId: string, secenek: { hasta: boolean }): Promise<{ geciciSifre: string; geciciSifreBitis: Date | null }> {
  const sifre = geciciSifreUret();
  const parolaHash = await sifreHashle(sifre);
  const bitis = secenek.hasta ? new Date(Date.now() + HASTA_GECICI_SIFRE_GUN * 24 * 60 * 60 * 1000) : null;
  const c = await kimlikHavuzu().connect();
  try {
    await c.query("BEGIN");
    const r = await c.query(`update kimlik_hesap set parola_hash = $2, guncelleme = now() where kullanici_id = $1 and saglayici_id = 'credential'`, [kullaniciId, parolaHash]);
    if (r.rowCount !== 1) throw new Error("hesap_bulunamadi");
    await c.query(`update kimlik_kullanici set sifre_degistirmeli = true, gecici_sifre_bitis = $2, guncelleme = now() where id = $1`, [kullaniciId, bitis]);
    await c.query(`delete from oturum where kullanici_id = $1`, [kullaniciId]);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
  return { geciciSifre: sifre, geciciSifreBitis: bitis };
}

/** İşten çıkış / hesap kapatma: devre_disi bayrağı + AÇIK OTURUMLARIN iptali (hemen etkili; cookieCache kapalı olduğundan sonraki istek reddedilir). */
export async function hesabiDevreDisiBirak(kullaniciId: string): Promise<{ iptalEdilenOturum: number }> {
  const c = await kimlikHavuzu().connect();
  try {
    await c.query("BEGIN");
    await c.query(`update kimlik_kullanici set devre_disi = true, devre_disi_zamani = now(), guncelleme = now() where id = $1`, [kullaniciId]);
    const r = await c.query(`delete from oturum where kullanici_id = $1`, [kullaniciId]);
    await c.query(`delete from kimlik_dogrulama where tanimlayici like 'reset-password:%' and deger = $1`, [kullaniciId]);
    await c.query("COMMIT");
    return { iptalEdilenOturum: r.rowCount ?? 0 };
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export async function hesabiYenidenEtkinlestir(kullaniciId: string): Promise<void> {
  await kimlikHavuzu().query(`update kimlik_kullanici set devre_disi = false, devre_disi_zamani = null, guncelleme = now() where id = $1`, [kullaniciId]);
}

/** Rol değişince (admin ↔ diğer) telefonla/e-postayla giriş kuralını ve telefonu eşitler. */
export async function kimlikBilgisiGuncelle(kullaniciId: string, g: { telefon?: string | null; rol?: PersonelRolu }): Promise<void> {
  const parcalar: string[] = [];
  const degerler: unknown[] = [kullaniciId];
  if (g.telefon !== undefined) { degerler.push(g.telefon); parcalar.push(`telefon = $${degerler.length}`); }
  if (g.rol !== undefined) { degerler.push(telefonlaGirisRolu(g.rol)); parcalar.push(`telefonla_giris = $${degerler.length}`); }
  if (!parcalar.length) return;
  await kimlikHavuzu().query(`update kimlik_kullanici set ${parcalar.join(", ")}, guncelleme = now() where id = $1 and tur = 'personel'`, degerler);
}

/** Tenant yazımı başarısız olursa kimlik kaydını geri alır (CASCADE: hesap + oturum). */
export async function kimlikHesabiSil(kullaniciId: string): Promise<void> {
  await kimlikHavuzu().query(`delete from kimlik_kullanici where id = $1`, [kullaniciId]);
}
