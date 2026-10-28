// Personel modülü ortak okuma sorguları (Drizzle, withTenant içinde çağrılır). Şekiller types/personel.ts ve types/pozisyon.ts ile aynı (snake_case).
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { sema, type Tx } from "@/lib/db";
import type { IzinBakiye, IzinTalebi, IzinTalebiAdminSatir } from "@/types/izin";
import type { IsBasvurusu } from "@/types/personel";
import type { Pozisyon } from "@/types/pozisyon";

export async function pozisyonlariGetir(tx: Tx, yalnizAktif = false): Promise<Pozisyon[]> {
  const P = sema.pozisyonlar;
  const r = await tx
    .select({ id: P.id, ad: P.ad, grup: P.grup, sira: P.sira, aktif: P.aktif, sistem_erisimi: P.sistemErisimi, varsayilan_rol: P.varsayilanRol, ucret_tipi: P.ucretTipi, puantaj_modu: P.puantajModu, ozel_mi: P.ozelMi })
    .from(P)
    .where(yalnizAktif ? eq(P.aktif, true) : undefined)
    .orderBy(asc(P.sira));
  return r as Pozisyon[];
}

/** Olumlu olmayan (beklemede/olumsuz) iş başvuruları, en yeni önce. */
export async function acikBasvurulariGetir(tx: Tx, klinikId: string): Promise<IsBasvurusu[]> {
  const B = sema.isBasvurusu;
  const r = await tx
    .select({
      id: B.id, ad_soyad: B.adSoyad, telefon: B.telefon, eposta: B.eposta, dogum_tarihi: B.dogumTarihi, tc_kimlik_no: B.tcKimlikNo, adres: B.adres,
      pozisyon: B.pozisyon, bizi_nereden_duydunuz: B.biziNeredenDuydunuz, calismaya_baslama_tarihi: B.calismayaBaslamaTarihi, calisma_sekli: B.calismaSekli,
      beklenen_ucret: B.beklenenUcret, egitim_okul_bolum: B.egitimOkulBolum, egitim_mezuniyet_yili: B.egitimMezuniyetYili, egitim_sertifikalar: B.egitimSertifikalar,
      is_deneyimi: B.isDeneyimi, referanslar: B.referanslar, durum: B.durum, personel_id: B.personelId, created_at: B.createdAt,
    })
    .from(B)
    .where(and(eq(B.klinikId, klinikId), ne(B.durum, "olumlu")))
    .orderBy(desc(B.createdAt));
  return r as unknown as IsBasvurusu[];
}

// ---- İzin ----

export async function izinBakiyesiGetir(tx: Tx, personelId: string): Promise<IzinBakiye | null> {
  const V = sema.vPersonelIzinBakiye;
  const r = (await tx.select().from(V).where(eq(V.personelId, personelId)).limit(1))[0];
  if (!r) return null;
  const n = (x: string | null) => Number(x ?? 0);
  return { personel_id: r.personelId as string, hak_gun: n(r.hakGun), devir_gun: n(r.devirGun), duzeltme_gun: n(r.duzeltmeGun), onaylanan_gun: n(r.onaylananGun), beklemede_gun: n(r.beklemedeGun), kalan_gun: n(r.kalanGun) };
}

const talepKolonlari = {
  id: sema.personelIzinTalebi.id, personel_id: sema.personelIzinTalebi.personelId, tip: sema.personelIzinTalebi.tip,
  baslangic_tarih: sema.personelIzinTalebi.baslangicTarih, bitis_tarih: sema.personelIzinTalebi.bitisTarih, gun_sayisi: sema.personelIzinTalebi.gunSayisi,
  gerekce: sema.personelIzinTalebi.gerekce, belge_url: sema.personelIzinTalebi.belgeUrl, durum: sema.personelIzinTalebi.durum, red_gerekce: sema.personelIzinTalebi.redGerekce,
  degerlendiren_kullanici_id: sema.personelIzinTalebi.degerlendirenKullaniciId, degerlendirme_tarihi: sema.personelIzinTalebi.degerlendirmeTarihi,
  iptal_eden_kullanici_id: sema.personelIzinTalebi.iptalEdenKullaniciId, iptal_tarihi: sema.personelIzinTalebi.iptalTarihi, created_at: sema.personelIzinTalebi.createdAt,
};

/** Bir personelin talepleri (en yeni önce). */
export async function kendiIzinTalepleriniGetir(tx: Tx, personelId: string): Promise<IzinTalebi[]> {
  const r = await tx.select(talepKolonlari).from(sema.personelIzinTalebi).where(eq(sema.personelIzinTalebi.personelId, personelId)).orderBy(desc(sema.personelIzinTalebi.createdAt));
  return r.map((x) => ({ ...x, gun_sayisi: Number(x.gun_sayisi) })) as unknown as IzinTalebi[];
}

/** Yönetici listesi: tüm klinik, son 200, personel adı + görev ile. */
export async function izinTalepleriniYoneticiGetir(tx: Tx): Promise<IzinTalebiAdminSatir[]> {
  const r = await tx
    .select({ ...talepKolonlari, p_ad: sema.personel.adSoyad, p_gorev: sema.personel.gorev })
    .from(sema.personelIzinTalebi)
    .leftJoin(sema.personel, eq(sema.personel.id, sema.personelIzinTalebi.personelId))
    .orderBy(desc(sema.personelIzinTalebi.createdAt))
    .limit(200);
  return r.map(({ p_ad, p_gorev, ...x }) => ({ ...x, gun_sayisi: Number(x.gun_sayisi), personel: p_ad === null ? null : { ad_soyad: p_ad, gorev: p_gorev } })) as unknown as IzinTalebiAdminSatir[];
}

