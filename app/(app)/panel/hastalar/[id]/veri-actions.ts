"use server";

// Hasta Detayı sekmelerinin OKUMA/yazma eylemleri (react-query kancaları bunları çağırır; eskiden tarayıcıdan doğrudan veritabanı istemcisi).
// Hepsi: oturum + rol kapısı (KODDA, RLS'e ek) + withTenant. Tenant ve kullanıcı oturumdan gelir; hastaId/kayıt id'leri doğrulanır (uuid + tenant içinde var mı).
import { uuidZorunlu } from "@/lib/guvenlik/girdi";
import { and, asc, desc, eq, inArray, lt, ne, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { pgHata, sema, withTenant, zamanlariIsoyaCevir, type TenantBaglami } from "@/lib/db";
import { eylemYetkisi, type PersonelRolu } from "@/lib/auth/yetki";
import { hastaDetayOzetGetir } from "@/lib/hasta/ozet-sorgular";
import { hassasSatiriCevir } from "@/lib/hasta/hassas-satir";
import type { HastaHassasSatir } from "@/types/hasta-hassas";
import type {
  HastaAnamnezKaydi,
  HastaDetayOzet,
  HastaIliski,
  HastaOlcum,
  HastaProtokol,
  HastaSeansSatir,
  HastaSigorta,
  IslemKontrendikasyon,
  VucutHaritasiIsareti,
} from "@/types/hasta-detay";
import type { IptalTalebiDurum, PortalRandevuTalebiSatir } from "@/types/portal";
import type { RandevuDurum } from "@/types/randevu";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TUM_PERSONEL: readonly PersonelRolu[] = ["klinik_admin", "resepsiyon", "terapist", "muhasebe"];
const YONETIM: readonly PersonelRolu[] = ["klinik_admin", "resepsiyon"];
const KLINIK: readonly PersonelRolu[] = ["klinik_admin", "resepsiyon", "terapist"];
/** hasta_vucut_haritasi_isareti / hasta_protokol / hasta_olcum yazma politikası: terapist + klinik_admin. */
const TERAPI_YAZMA: readonly PersonelRolu[] = ["klinik_admin", "terapist"];

async function kapi(roller: readonly PersonelRolu[], ...idler: string[]): Promise<{ bag: TenantBaglami; klinikId: string; userId: string }> {
  const y = await eylemYetkisi(roller);
  if (!y.yetkili || !y.bag || !y.klinikId) throw new Error("Bu işlem için yetkiniz yok.");
  for (const id of idler) if (!UUID.test(id)) throw new Error("Geçersiz istek.");
  return { bag: y.bag, klinikId: y.klinikId, userId: y.ctx.userId };
}

const n = (v: string | number | null | undefined) => (v == null ? null : Number(v));

export async function hastaDetayOzetiGetir(hastaId: string): Promise<HastaDetayOzet | null> {
  uuidZorunlu(hastaId, "hastaId");
  const { bag } = await kapi(TUM_PERSONEL, hastaId);
  return withTenant(bag, (tx) => hastaDetayOzetGetir(tx, hastaId));
}

/** Kimlik/adres/acil durum/veli + tıbbi ön geçmiş: idari veridir — yalnız klinik_admin/resepsiyon (Kişisel Bilgiler sekmesi terapiste kapalıdır). */
export async function hastaHassasGetir(hastaId: string): Promise<HastaHassasSatir | null> {
  uuidZorunlu(hastaId, "hastaId");
  const { bag } = await kapi(YONETIM, hastaId);
  const olusturan = alias(sema.kullanici, "olusturan");
  const guncelleyen = alias(sema.kullanici, "guncelleyen");
  const s = (
    await withTenant(bag, (tx) =>
      tx
        .select({ h: sema.hastaHassas, olusturanAd: olusturan.adSoyad, guncelleyenAd: guncelleyen.adSoyad })
        .from(sema.hastaHassas)
        .leftJoin(olusturan, eq(olusturan.id, sema.hastaHassas.olusturanKullaniciId))
        .leftJoin(guncelleyen, eq(guncelleyen.id, sema.hastaHassas.sonGuncelleyenKullaniciId))
        .where(eq(sema.hastaHassas.hastaId, hastaId))
        .limit(1)
    )
  )[0];
  if (!s) return null;
  return hassasSatiriCevir(s.h, s.olusturanAd, s.guncelleyenAd);
}

export async function hastaIliskileriGetir(hastaId: string): Promise<HastaIliski[]> {
  uuidZorunlu(hastaId, "hastaId");
  const { bag } = await kapi(TUM_PERSONEL, hastaId);
  const s = await withTenant(bag, (tx) =>
    tx
      .select({ i: sema.hastaIliski, ad: sema.hasta.adSoyad, telefon: sema.hasta.telefon })
      .from(sema.hastaIliski)
      .leftJoin(sema.hasta, eq(sema.hasta.id, sema.hastaIliski.iliskiliHastaId))
      .where(eq(sema.hastaIliski.hastaId, hastaId))
  );
  return s.map(({ i, ad, telefon }): HastaIliski => ({
    id: i.id,
    hasta_id: i.hastaId,
    iliskili_hasta_id: i.iliskiliHastaId,
    iliski_turu: i.iliskiTuru as HastaIliski["iliski_turu"],
    ortak_odeme: i.ortakOdeme,
    iliskili_hasta: ad == null ? null : { ad_soyad: ad, telefon: telefon ?? "" },
  }));
}

export async function hastaSigortalariGetir(hastaId: string): Promise<HastaSigorta[]> {
  uuidZorunlu(hastaId, "hastaId");
  const { bag } = await kapi(TUM_PERSONEL, hastaId); // RLS: yalnız admin/resepsiyon/muhasebe satır görür
  const s = await withTenant(bag, (tx) => tx.select().from(sema.hastaSigorta).where(eq(sema.hastaSigorta.hastaId, hastaId)).orderBy(desc(sema.hastaSigorta.gecerlilikBaslangic)));
  return s.map((x): HastaSigorta => ({
    id: x.id,
    hasta_id: x.hastaId,
    kurum_adi: x.kurumAdi,
    police_no: x.policeNo,
    katilim_payi_orani: n(x.katilimPayiOrani),
    gecerlilik_baslangic: x.gecerlilikBaslangic,
    gecerlilik_bitis: x.gecerlilikBitis,
    fatura_kurum_adina: x.faturaKurumAdina,
    notlar: x.notlar,
  }));
}

export async function hastaAnamnezKayitlariGetir(hastaId: string): Promise<HastaAnamnezKaydi[]> {
  uuidZorunlu(hastaId, "hastaId");
  const { bag } = await kapi(TUM_PERSONEL, hastaId);
  const s = await withTenant(bag, (tx) =>
    tx
      .select({ a: sema.hastaAnamnez, ad: sema.kullanici.adSoyad })
      .from(sema.hastaAnamnez)
      .leftJoin(sema.kullanici, eq(sema.kullanici.id, sema.hastaAnamnez.sonGuncelleyenKullaniciId))
      .where(eq(sema.hastaAnamnez.hastaId, hastaId))
      .orderBy(desc(sema.hastaAnamnez.createdAt))
  );
  return zamanlariIsoyaCevir(
    s.map(({ a, ad }): HastaAnamnezKaydi => ({
      id: a.id,
      hasta_id: a.hastaId,
      basvuru_sikayeti: a.basvuruSikayeti,
      sikayet_baslangici: a.sikayetBaslangici,
      agri_oykusu: a.agriOykusu,
      ilk_degerlendirme_notu: a.ilkDegerlendirmeNotu,
      durum: a.durum as HastaAnamnezKaydi["durum"],
      son_guncelleyen_tip: a.sonGuncelleyenTip as HastaAnamnezKaydi["son_guncelleyen_tip"],
      son_guncelleyen_kullanici: ad == null ? null : { ad_soyad: ad },
      created_at: a.createdAt,
      updated_at: a.updatedAt,
    }))
  );
}

// ---------------------------------------------------------------- Vücut haritası (terapist + klinik_admin yazar)
const vucutSatiri = (v: typeof sema.hastaVucutHaritasiIsareti.$inferSelect): VucutHaritasiIsareti => ({
  id: v.id,
  hasta_id: v.hastaId,
  randevu_id: v.randevuId,
  yuz: v.yuz as "on" | "arka",
  bolge: v.bolge,
  x: n(v.x),
  y: n(v.y),
  severity: v.severity,
  not_metni: v.notMetni,
  created_at: v.createdAt,
});

export async function vucutHaritasiGetir(hastaId: string, seansId: string | null): Promise<VucutHaritasiIsareti[]> {
  uuidZorunlu(hastaId, "hastaId");
  const { bag } = await kapi(TUM_PERSONEL, hastaId, ...(seansId ? [seansId] : []));
  const kosul = seansId ? and(eq(sema.hastaVucutHaritasiIsareti.hastaId, hastaId), eq(sema.hastaVucutHaritasiIsareti.randevuId, seansId)) : eq(sema.hastaVucutHaritasiIsareti.hastaId, hastaId);
  const s = await withTenant(bag, (tx) => tx.select().from(sema.hastaVucutHaritasiIsareti).where(kosul).orderBy(desc(sema.hastaVucutHaritasiIsareti.createdAt)));
  return zamanlariIsoyaCevir(s.map(vucutSatiri));
}

export type VucutIsaretiGirdisi = { id?: string; bolge: string; yuz: "on" | "arka"; severity: number; not_metni: string; randevu_id: string | null };

/** Mevcut işareti günceller (id varsa) ya da yenisini ekler. Dönüş: işaret id'si. */
export async function vucutIsaretiKaydet(hastaId: string, girdi: VucutIsaretiGirdisi): Promise<string> {
  uuidZorunlu(hastaId, "hastaId");
  const { bag, klinikId, userId } = await kapi(TERAPI_YAZMA, hastaId, ...(girdi.id ? [girdi.id] : []), ...(girdi.randevu_id ? [girdi.randevu_id] : []));
  if (!Number.isInteger(girdi.severity) || girdi.severity < 0 || girdi.severity > 10 || !["on", "arka"].includes(girdi.yuz) || !girdi.bolge || girdi.bolge.length > 64 || girdi.not_metni.length > 2000) {
    throw new Error("Geçersiz istek.");
  }
  return withTenant(bag, async (tx) => {
    if (girdi.id) {
      const g = await tx
        .update(sema.hastaVucutHaritasiIsareti)
        .set({ severity: girdi.severity, notMetni: girdi.not_metni || null })
        .where(and(eq(sema.hastaVucutHaritasiIsareti.id, girdi.id), eq(sema.hastaVucutHaritasiIsareti.hastaId, hastaId)))
        .returning({ id: sema.hastaVucutHaritasiIsareti.id });
      if (g.length === 0) throw new Error("Kayıt bulunamadı.");
      return girdi.id;
    }
    const [yeni] = await tx
      .insert(sema.hastaVucutHaritasiIsareti)
      .values({ klinikId, hastaId, randevuId: girdi.randevu_id, yuz: girdi.yuz, bolge: girdi.bolge, severity: girdi.severity, notMetni: girdi.not_metni || null, olusturanKullaniciId: userId })
      .returning({ id: sema.hastaVucutHaritasiIsareti.id });
    return yeni.id;
  });
}

export async function vucutIsaretiKaldir(hastaId: string, id: string): Promise<void> {
  uuidZorunlu(hastaId, "hastaId");
  const { bag } = await kapi(TERAPI_YAZMA, hastaId, id);
  const g = await withTenant(bag, (tx) =>
    tx.delete(sema.hastaVucutHaritasiIsareti).where(and(eq(sema.hastaVucutHaritasiIsareti.id, id), eq(sema.hastaVucutHaritasiIsareti.hastaId, hastaId))).returning({ id: sema.hastaVucutHaritasiIsareti.id })
  );
  if (g.length === 0) throw new Error("Kayıt bulunamadı.");
}

// ---------------------------------------------------------------- Tedavi / protokol
export async function islemTanimlariGetir(): Promise<{ id: string; ad: string }[]> {
  const { bag } = await kapi(TUM_PERSONEL);
  return withTenant(bag, (tx) => tx.select({ id: sema.islemTanimi.id, ad: sema.islemTanimi.ad }).from(sema.islemTanimi).where(eq(sema.islemTanimi.aktif, true)).orderBy(asc(sema.islemTanimi.ad)));
}

export async function islemKontrendikasyonlariGetir(islemTanimiId: string): Promise<IslemKontrendikasyon[]> {
  uuidZorunlu(islemTanimiId, "islemTanimiId");
  const { bag } = await kapi(TUM_PERSONEL, islemTanimiId);
  const s = await withTenant(bag, (tx) => tx.select().from(sema.islemKontrendikasyon).where(eq(sema.islemKontrendikasyon.islemTanimiId, islemTanimiId)));
  return s.map((k): IslemKontrendikasyon => ({
    id: k.id,
    islem_tanimi_id: k.islemTanimiId,
    risk_tipi: k.riskTipi as IslemKontrendikasyon["risk_tipi"],
    uyari_seviyesi: k.uyariSeviyesi as IslemKontrendikasyon["uyari_seviyesi"],
    mesaj: k.mesaj,
  }));
}

export async function hastaProtokolleriGetir(hastaId: string): Promise<HastaProtokol[]> {
  uuidZorunlu(hastaId, "hastaId");
  const { bag } = await kapi(TUM_PERSONEL, hastaId);
  const s = await withTenant(bag, (tx) =>
    tx
      .select({ p: sema.hastaProtokol, ad: sema.islemTanimi.ad })
      .from(sema.hastaProtokol)
      .leftJoin(sema.islemTanimi, eq(sema.islemTanimi.id, sema.hastaProtokol.islemTanimiId))
      .where(eq(sema.hastaProtokol.hastaId, hastaId))
      .orderBy(desc(sema.hastaProtokol.createdAt))
  );
  return s.map(({ p, ad }): HastaProtokol => ({
    id: p.id,
    hasta_id: p.hastaId,
    islem_tanimi_id: p.islemTanimiId,
    durum: p.durum as HastaProtokol["durum"],
    baslangic_tarihi: p.baslangicTarihi,
    notlar: p.notlar,
    uyari_onaylandi_mi: p.uyariOnaylandiMi,
    islem_tanimi: ad == null ? null : { ad },
  }));
}

/** Protokol ekler. Kontrendikasyon engeli (blok) veritabanı tetikleyicisinde de zorlanır; istemcideki uyarı yalnız kolaylıktır. */
export async function hastaProtokolEkle(hastaId: string, islemTanimiId: string, uyariOnaylandiMi: boolean): Promise<void> {
  uuidZorunlu(hastaId, "hastaId");
  uuidZorunlu(islemTanimiId, "islemTanimiId");
  const { bag, klinikId, userId } = await kapi(TERAPI_YAZMA, hastaId, islemTanimiId);
  await withTenant(bag, async (tx) => {
    const hasta = await tx.select({ id: sema.hasta.id }).from(sema.hasta).where(eq(sema.hasta.id, hastaId)).limit(1);
    const islem = await tx.select({ id: sema.islemTanimi.id }).from(sema.islemTanimi).where(eq(sema.islemTanimi.id, islemTanimiId)).limit(1);
    if (hasta.length === 0 || islem.length === 0) throw new Error("Kayıt bulunamadı.");
    await tx.insert(sema.hastaProtokol).values({ klinikId, hastaId, islemTanimiId, uyariOnaylandiMi: Boolean(uyariOnaylandiMi) });
    void userId;
  }).catch((e) => {
    throw new Error(pgHata(e).mesaj.includes("kontrendikasyon") ? "Bu protokol hastanın risk bayraklarıyla çakışıyor (kontrendikasyon)." : "Protokol eklenemedi.");
  });
}

export async function hastaOlcumleriGetir(hastaId: string): Promise<HastaOlcum[]> {
  uuidZorunlu(hastaId, "hastaId");
  const { bag } = await kapi(TUM_PERSONEL, hastaId);
  const s = await withTenant(bag, (tx) =>
    tx
      .select({ o: sema.hastaOlcum, kod: sema.olcekTanimi.kod, ad: sema.olcekTanimi.ad, min: sema.olcekTanimi.minSkor, max: sema.olcekTanimi.maxSkor, yon: sema.olcekTanimi.yorumYonu, tanimId: sema.olcekTanimi.id })
      .from(sema.hastaOlcum)
      .leftJoin(sema.olcekTanimi, eq(sema.olcekTanimi.id, sema.hastaOlcum.olcekTanimiId))
      .where(eq(sema.hastaOlcum.hastaId, hastaId))
      .orderBy(asc(sema.hastaOlcum.olcumTarihi))
  );
  return zamanlariIsoyaCevir(
    s.map(({ o, ...t }): HastaOlcum => ({
      id: o.id,
      hasta_id: o.hastaId,
      olcek_tanimi_id: o.olcekTanimiId,
      hesaplanan_skor: n(o.hesaplananSkor),
      olcum_tarihi: o.olcumTarihi,
      cevaplar: (o.cevaplar ?? {}) as Record<string, unknown>,
      olcek_tanimi: t.tanimId ? { id: t.tanimId, kod: t.kod!, ad: t.ad!, min_skor: n(t.min), max_skor: n(t.max), yorum_yonu: t.yon as "yuksek_iyi" | "dusuk_iyi" } : null,
    }))
  );
}

// ---------------------------------------------------------------- Seans geçmişi
/** Sağ kolondaki vücut haritasının hangi seansı göstereceğini seçtiren dikey zaman çizelgesi için (son 30). */
export async function hastaSeansGecmisiGetir(hastaId: string): Promise<HastaSeansSatir[]> {
  uuidZorunlu(hastaId, "hastaId");
  const { bag } = await kapi(TUM_PERSONEL, hastaId);
  const terapistPersonel = alias(sema.personel, "terapist_personel");
  const antrenor = alias(sema.personel, "antrenor");
  const tamamlayan = alias(sema.kullanici, "tamamlayan");
  const s = await withTenant(bag, async (tx) => {
    // Sadece baslangic < now() filtresi, resepsiyon randevu saatinden ÖNCE "Geldi" işaretlerse (erken check-in) o seansı bu listeden
    // tamamen düşürürdü; zamanı geçmiş VEYA zaten check-in/sonuçlanmış (planlandı DIŞINDA) her randevu burada görünmeli.
    const satirlar = await tx
      .select({
        r: sema.randevu,
        terapistAd: terapistPersonel.adSoyad,
        islemAd: sema.islemTanimi.ad,
        antrenorAd: antrenor.adSoyad,
        protokolId: sema.tedaviProtokolu.id,
        protokolAd: sema.tedaviProtokolu.ad,
        tamamlayanAd: tamamlayan.adSoyad,
      })
      .from(sema.randevu)
      .leftJoin(sema.terapist, eq(sema.terapist.id, sema.randevu.terapistId))
      .leftJoin(terapistPersonel, eq(terapistPersonel.id, sema.terapist.personelId))
      .leftJoin(sema.islemTanimi, eq(sema.islemTanimi.id, sema.randevu.islemTanimiId))
      .leftJoin(antrenor, eq(antrenor.id, sema.randevu.antrenorId))
      .leftJoin(sema.tedaviProtokolu, eq(sema.tedaviProtokolu.id, sema.randevu.tedaviProtokoluId))
      .leftJoin(tamamlayan, eq(tamamlayan.id, sema.randevu.tamamlayanKullaniciId))
      .where(and(eq(sema.randevu.hastaId, hastaId), or(lt(sema.randevu.baslangic, new Date().toISOString()), ne(sema.randevu.durum, "planlandi"))))
      .orderBy(desc(sema.randevu.baslangic))
      .limit(30);
    const ids = satirlar.map((x) => x.r.id);
    const degerlendirmeler = ids.length
      ? await tx.select({ randevuId: sema.seansDegerlendirme.randevuId, puan: sema.seansDegerlendirme.puan, oneri: sema.seansDegerlendirme.oneriMetni }).from(sema.seansDegerlendirme).where(inArray(sema.seansDegerlendirme.randevuId, ids))
      : [];
    return { satirlar, degerlendirmeler };
  });
  const harita = new Map(s.degerlendirmeler.map((d) => [d.randevuId, { puan: d.puan, oneri_metni: d.oneri }]));
  return zamanlariIsoyaCevir(
    s.satirlar.map(({ r, ...e }): HastaSeansSatir => ({
      id: r.id,
      baslangic: r.baslangic,
      bitis: r.bitis,
      durum: r.durum as HastaSeansSatir["durum"],
      terapist: e.terapistAd == null ? null : { personel: { ad_soyad: e.terapistAd } },
      islem_tanimi: e.islemAd == null ? null : { ad: e.islemAd },
      tani: r.tani,
      antrenor: e.antrenorAd == null ? null : { ad_soyad: e.antrenorAd },
      tedavi_protokolu: e.protokolId ? { id: e.protokolId, ad: e.protokolAd ?? "" } : null,
      tamamlanma_aciklamasi: r.tamamlanmaAciklamasi,
      tamamlayan_kullanici: e.tamamlayanAd == null ? null : { ad_soyad: e.tamamlayanAd },
      tamamlanma_tarihi: r.tamamlanmaTarihi,
      degerlendirme: harita.get(r.id) ?? null,
    }))
  );
}

// ---------------------------------------------------------------- Talep ve Öneriler
export type HastaTalepVeOneriVerisi = {
  randevuTalepleri: PortalRandevuTalebiSatir[];
  iptalTalepleri: { id: string; durum: IptalTalebiDurum; created_at: string; randevuBaslangic: string }[];
};

export async function hastaTalepVeOnerilerGetir(hastaId: string): Promise<HastaTalepVeOneriVerisi> {
  uuidZorunlu(hastaId, "hastaId");
  const { bag } = await kapi(KLINIK, hastaId);
  const v = await withTenant(bag, async (tx) => ({
    talepler: await tx
      .select({ t: sema.randevuTalebi, islemAd: sema.islemTanimi.ad })
      .from(sema.randevuTalebi)
      .leftJoin(sema.islemTanimi, eq(sema.islemTanimi.id, sema.randevuTalebi.islemTanimiId))
      .where(eq(sema.randevuTalebi.hastaId, hastaId))
      .orderBy(desc(sema.randevuTalebi.createdAt)),
    iptaller: await tx
      .select({ id: sema.randevuIptalTalebi.id, durum: sema.randevuIptalTalebi.durum, createdAt: sema.randevuIptalTalebi.createdAt, baslangic: sema.randevu.baslangic })
      .from(sema.randevuIptalTalebi)
      .innerJoin(sema.randevu, eq(sema.randevu.id, sema.randevuIptalTalebi.randevuId))
      .where(eq(sema.randevu.hastaId, hastaId))
      .orderBy(desc(sema.randevu.baslangic))
      .limit(200),
  }));
  return zamanlariIsoyaCevir({
    randevuTalepleri: v.talepler.map(({ t, islemAd }): PortalRandevuTalebiSatir => ({
      id: t.id,
      islem_tanimi: islemAd == null ? null : { ad: islemAd },
      tercih_tarih: t.tercihTarih,
      tercih_saat: t.tercihSaat,
      not_metni: t.notMetni,
      durum: t.durum as PortalRandevuTalebiSatir["durum"],
      created_at: t.createdAt,
    })),
    iptalTalepleri: v.iptaller.map((x) => ({ id: x.id, durum: x.durum as IptalTalebiDurum, created_at: x.createdAt, randevuBaslangic: x.baslangic })),
  });
}

export type TalepIcinRandevuVerisi = {
  id: string;
  baslangic: string;
  durum: RandevuDurum;
  terapist: { id: string; personel: { ad_soyad: string } | null } | null;
  islem_tanimi: { ad: string } | null;
};

/** "Randevu İptali" / "Terapist Yorumu" / "Randevu Hakkında Yorum" alanlarındaki seçim listeleri için (son 200). */
export async function hastaTalepIcinRandevularGetir(hastaId: string): Promise<TalepIcinRandevuVerisi[]> {
  uuidZorunlu(hastaId, "hastaId");
  const { bag } = await kapi(KLINIK, hastaId);
  const s = await withTenant(bag, (tx) =>
    tx
      .select({ id: sema.randevu.id, baslangic: sema.randevu.baslangic, durum: sema.randevu.durum, terapistId: sema.terapist.id, terapistAd: sema.personel.adSoyad, islemAd: sema.islemTanimi.ad })
      .from(sema.randevu)
      .leftJoin(sema.terapist, eq(sema.terapist.id, sema.randevu.terapistId))
      .leftJoin(sema.personel, eq(sema.personel.id, sema.terapist.personelId))
      .leftJoin(sema.islemTanimi, eq(sema.islemTanimi.id, sema.randevu.islemTanimiId))
      .where(eq(sema.randevu.hastaId, hastaId))
      .orderBy(desc(sema.randevu.baslangic))
      .limit(200)
  );
  return zamanlariIsoyaCevir(
    s.map((x): TalepIcinRandevuVerisi => ({
      id: x.id,
      baslangic: x.baslangic,
      durum: x.durum as RandevuDurum,
      terapist: x.terapistId ? { id: x.terapistId, personel: x.terapistAd == null ? null : { ad_soyad: x.terapistAd } } : null,
      islem_tanimi: x.islemAd == null ? null : { ad: x.islemAd },
    }))
  );
}
