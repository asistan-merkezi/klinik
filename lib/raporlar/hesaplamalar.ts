// Raporlar hesapları. TEK DOĞRULUK KAYNAĞI SQL'dir (Modül 4 kararı):
//   • Dönem toplamları (gelir kırılımı, 4 gider kalemi, randevu durumları) → `rapor_donem_ozeti`
//   • Yıllık ay ay özet                                                      → `rapor_yillik_ozet`
// Eskiden aynı kurallar JS'te de (RPC yoksa devreye giren yedek hesap) tekrarlanıyordu; yedek yol kaldırıldı — RPC hatası artık fırlatır, eksik veriyle devam edilmez.
// Burada kalan JS hesapları SQL'in yapamadığı şeyler: kalem kalem "Günlük Döküm" (liste) ve personel maliyeti (hakediş kuralı Modül 5'te, lib/personel/hakedis.ts).
// Günlük Döküm'ün gün toplamları SQL toplamlarıyla aynı kuralı izler ve testle (tests/db/modul-finans.test.ts) mutabakatı doğrulanır.
// Para aritmetiği lib/para.ts'tedir (kuruş tamsayı); bu dosyada float toplama YOK.
import { and, asc, eq, gte, inArray, isNotNull, lt } from "drizzle-orm";
import { rpc, sema, type Tx } from "@/lib/db";
import { hakedisHesapla } from "@/lib/personel/hakedis";
import { donemMaasi, maasGecmisiGetirTx, type MaasGecmisiSatiri } from "@/lib/personel/donem-maasi";
import { seansSayilariniGetirTx } from "@/lib/personel/seans-sayisi";
import { donemAylari, personelMaliyetiniTopla, type DefterSatiri, type DonemTahmini } from "@/lib/raporlar/personel-maliyeti";
import { ayAraligi } from "@/lib/utils";
import { kurus, tl, topla } from "@/lib/para";
import type { MaasHesaplamaModeli } from "@/types/personel";
import type { GelirOzeti, GunlukOzet, RandevuDurumOzeti, SabitPersonelMaliyeti, YillikAy } from "@/types/raporlar";
import type { RaporDonemi } from "@/lib/raporlar/donem";
import { yilinAylari } from "@/lib/raporlar/donem";
import { bugunIstanbulTarihi, formatDateForInput, formatTime } from "@/lib/datetime";
import { HARCAMA_KATEGORI_ETIKET, type HarcamaKategori } from "@/types/klinik-harcama";
import { ODEME_TIPI_ETIKET, type OdemeTipi } from "@/types/kamusal-odeme";
import { BELGE_TURU_ETIKETLERI, YONTEM_ETIKETLERI } from "@/types/odeme";

/**
 * Personel gideri (Raporlar): kapalı dönemlerde defterdeki gerçek tahakkuk, açık dönemlerde o ayın
 * maaşıyla tahmin, elle girilen prim/yol/yemek/mesai ekstra — kural ve gerekçe
 * lib/raporlar/personel-maliyeti.ts'te. Dönem birden çok ay kapsıyorsa (Yıllık) her ay ayrı
 * değerlendirilir; bugünden sonraki aylar sayılmaz. SGK işveren payı burada YOK (Muhasebe
 * raporu, klinik_harcama 'vergi_sgk').
 */
export async function hesaplaSabitPersonelMaliyeti(tx: Tx, donem: RaporDonemi): Promise<SabitPersonelMaliyeti> {
  const aylar = donemAylari(donem.baslangicTarih, donem.bitisTarih, bugunIstanbulTarihi());
  const yillar = [...new Set(aylar.map((a) => Number(a.slice(0, 4))))];

  const P = sema.personel;
  const T = sema.terapist;
  const H = sema.personelHesapHareket;
  const D = sema.personelPuantajDonem;

  const personeller = (
    await tx.select({ id: P.id, ad_soyad: P.adSoyad, maas: P.maas, aktif: P.aktif, ise_giris_tarihi: P.iseGirisTarihi, isten_cikis_tarihi: P.istenCikisTarihi }).from(P).orderBy(asc(P.id))
  ).map((p) => ({ ...p, maas: p.maas === null ? null : Number(p.maas) }));
  const terapistler = (
    await tx
      .select({ id: T.id, personel_id: T.personelId, maas_hesaplama_modeli: T.maasHesaplamaModeli, prim_sabit_tutar: T.primSabitTutar, baraj_seans_sayisi: T.barajSeansSayisi, baraj_bonus_tutari: T.barajBonusTutari })
      .from(T)
      .orderBy(asc(T.id))
  ).map((t) => ({
    ...t,
    maas_hesaplama_modeli: t.maas_hesaplama_modeli as MaasHesaplamaModeli,
    prim_sabit_tutar: t.prim_sabit_tutar === null ? null : Number(t.prim_sabit_tutar),
    baraj_bonus_tutari: t.baraj_bonus_tutari === null ? null : Number(t.baraj_bonus_tutari),
  }));
  const defter: (DefterSatiri & { id: string })[] = (
    await tx
      .select({ id: H.id, personel_id: H.personelId, tur: H.tur, tutar: H.tutar, kaynak_id: H.kaynakId })
      .from(H)
      .where(and(inArray(H.tur, ["hakedis", "prim", "yol", "yemek", "mesai"]), gte(H.tarih, donem.baslangicTarih), lt(H.tarih, donem.bitisTarih)))
      .orderBy(asc(H.id))
  ).map((s) => ({ ...s, tutar: tl(s.tutar) }));
  const kapaliDonemler =
    yillar.length === 0
      ? []
      : await tx.select({ id: D.id, personel_id: D.personelId, yil: D.yil, ay: D.ay }).from(D).where(and(eq(D.durum, "kapali"), inArray(D.yil, yillar))).orderBy(asc(D.id));

  const terapistByPersonelId = new Map(terapistler.map((t) => [t.personel_id, t]));
  const kapali = new Set(kapaliDonemler.map((d) => `${d.personel_id}|${d.yil}-${String(d.ay).padStart(2, "0")}`));

  let maasGecmisi = new Map<string, MaasGecmisiSatiri[]>();
  try {
    maasGecmisi = await maasGecmisiGetirTx(tx, personeller.map((p) => p.id));
  } catch (hata) {
    console.error("Raporlar: maaş geçmişi okunamadı, güncel maaş kullanılıyor:", hata);
  }

  // Açık ay-personel çiftleri için tahmin. Yalnız aktif personel (pasife alınmış birinin açık
  // dönemi sonsuza dek tahmin edilmesin); ayrılan personelin geçmişi kapalı dönem defterinden gelir.
  const tahminler: DonemTahmini[] = [];
  for (const ayParam of aylar) {
    const ay = ayAraligi(ayParam);
    const acikPersonel = personeller.filter(
      (p) =>
        p.aktif &&
        !kapali.has(`${p.id}|${ayParam}`) &&
        (!p.ise_giris_tarihi || p.ise_giris_tarihi < ay.bitisTarih) &&
        (!p.isten_cikis_tarihi || p.isten_cikis_tarihi >= ay.baslangicTarih)
    );
    if (acikPersonel.length === 0) continue;

    const seansSayilari = await seansSayilariniGetirTx(
      tx,
      acikPersonel
        .filter((p) => terapistByPersonelId.has(p.id))
        .map((p) => ({ terapistId: terapistByPersonelId.get(p.id)!.id, personelId: p.id, istenCikisTarihi: p.isten_cikis_tarihi })),
      ayParam
    );

    for (const p of acikPersonel) {
      const terapist = terapistByPersonelId.get(p.id);
      const seans = seansSayilari.get(p.id) ?? 0;
      const hesap = hakedisHesapla({
        personelMaasi: donemMaasi(maasGecmisi.get(p.id), p.maas, ay.bitisTarih),
        fmSaatlikUcret: null,
        terapistAyarlari: terapist
          ? {
              maas_hesaplama_modeli: terapist.maas_hesaplama_modeli,
              prim_sabit_tutar: terapist.prim_sabit_tutar,
              baraj_seans_sayisi: terapist.baraj_seans_sayisi,
              baraj_bonus_tutari: terapist.baraj_bonus_tutari,
            }
          : null,
        tamamlananSeansSayisi: seans,
        onayliFmSaat: 0,
        ayBaslangicTarih: ay.baslangicTarih,
        ayBitisTarihExclusive: ay.bitisTarih,
        iseGirisTarihi: p.ise_giris_tarihi,
        istenCikisTarihi: p.isten_cikis_tarihi,
      });
      tahminler.push({ personelId: p.id, taban: hesap.taban, prim: hesap.prim, seans });
    }
  }

  return personelMaliyetiniTopla(
    personeller.map((p) => ({ id: p.id, ad_soyad: p.ad_soyad, terapistMi: terapistByPersonelId.has(p.id) })),
    defter,
    tahminler
  );
}

type TahsilatSatiri = {
  id: string;
  created_at: string;
  tur: "odeme" | "iade";
  tutar: string;
  odeme_yontemi: string | null;
  belge_turu: string | null;
  hasta_id: string | null;
  hasta_ad: string | null;
};

/**
 * Bir dönemdeki gerçek tahsilat/iade satırları: hasta_bakiye_hareket'te tur IN ('odeme','iade') — Kasa/Banka/Kredi Kartı ile AYNI kaynak.
 * (Yalnız Günlük Döküm kalemleri için; toplamlar rapor_donem_ozeti'nden gelir.)
 */
async function tahsilatSatirlariniGetir(tx: Tx, baslangic: string, bitis: string): Promise<TahsilatSatiri[]> {
  const B = sema.hastaBakiyeHareket;
  const r = await tx
    .select({ id: B.id, created_at: B.createdAt, tur: B.tur, tutar: B.tutar, odeme_yontemi: B.odemeYontemi, belge_turu: B.belgeTuru, hasta_id: B.hastaId, hasta_ad: sema.hasta.adSoyad })
    .from(B)
    .leftJoin(sema.hasta, eq(sema.hasta.id, B.hastaId))
    .where(and(inArray(B.tur, ["odeme", "iade"]), gte(B.createdAt, baslangic), lt(B.createdAt, bitis)))
    .orderBy(asc(B.createdAt), asc(B.id));
  return r as TahsilatSatiri[];
}

/** Ödeme +tutar, iade −tutar (kuruş). */
const isaretliKurus = (s: Pick<TahsilatSatiri, "tur" | "tutar">) => (s.tur === "iade" ? -1 : 1) * (kurus(s.tutar) ?? 0);

const TAMAMLANAN_RANDEVU_DURUMLARI = new Set(["geldi", "gecikmeli_geldi", "tamamlandi"]);

/**
 * Aylık görünümdeki "Günlük Döküm" listesi için: dönem içindeki her günün gelir/gider toplamı + o güne ait tüm kalemlerin (randevu/gelir/gider/
 * muhasebe) dökümü. Gelir = hasta_bakiye_hareket ödeme − iade (SQL'deki rapor_donem_ozeti ile AYNI kural), gider = klinik_harcama + ödenmiş kamusal_odeme.
 * Randevu kalemleri kendi başına bir tutar TAŞIMAZ (yon: "notr") — bilgi amaçlı listelenir, gerçek gelir hasta ödemelerinden gelir.
 *
 * BİLİNÇLİ KAPSAM DIŞI: sabit personel maliyeti (maaş) güne dağıtılmaz — aylık/tek bir tahakkuk, belirli bir güne ait değil.
 */
export async function hesaplaGunlukDokum(tx: Tx, donem: RaporDonemi): Promise<GunlukOzet[]> {
  const R = sema.randevu;
  const B = sema.hastaBakiyeHareket;
  const randevuSatirlari = await tx
    .select({
      id: R.id,
      baslangic: R.baslangic,
      durum: R.durum,
      hasta_id: R.hastaId,
      paket_satis_id: R.paketSatisId,
      hasta_ad: sema.hasta.adSoyad,
      terapist_ad: sema.personel.adSoyad,
      islem_ad: sema.islemTanimi.ad,
      hareket_tur: B.tur,
      hareket_yontem: B.odemeYontemi,
    })
    .from(R)
    .leftJoin(sema.hasta, eq(sema.hasta.id, R.hastaId))
    .leftJoin(sema.terapist, eq(sema.terapist.id, R.terapistId))
    .leftJoin(sema.personel, eq(sema.personel.id, sema.terapist.personelId))
    .leftJoin(sema.islemTanimi, eq(sema.islemTanimi.id, R.islemTanimiId))
    .leftJoin(B, eq(B.randevuId, R.id))
    .where(and(gte(R.baslangic, donem.baslangic), lt(R.baslangic, donem.bitis)))
    .orderBy(asc(R.baslangic), asc(R.id), asc(B.createdAt));

  const tahsilatlar = await tahsilatSatirlariniGetir(tx, donem.baslangic, donem.bitis);
  const harcamalar = (
    await tx
      .select({ id: sema.klinikHarcama.id, tarih: sema.klinikHarcama.tarih, tutar: sema.klinikHarcama.tutar, kategori: sema.klinikHarcama.kategori, aciklama: sema.klinikHarcama.aciklama })
      .from(sema.klinikHarcama)
      .where(and(gte(sema.klinikHarcama.tarih, donem.baslangicTarih), lt(sema.klinikHarcama.tarih, donem.bitisTarih)))
      .orderBy(asc(sema.klinikHarcama.tarih), asc(sema.klinikHarcama.id))
  ).map((h) => ({ ...h, kategori: h.kategori as HarcamaKategori }));
  const kamusallar = await tx
    .select({ id: sema.kamusalOdeme.id, odeme_tarihi: sema.kamusalOdeme.odemeTarihi, tutar: sema.kamusalOdeme.tutar, odeme_tipi: sema.kamusalOdeme.odemeTipi })
    .from(sema.kamusalOdeme)
    .where(and(isNotNull(sema.kamusalOdeme.odemeTarihi), gte(sema.kamusalOdeme.odemeTarihi, donem.baslangicTarih), lt(sema.kamusalOdeme.odemeTarihi, donem.bitisTarih)))
    .orderBy(asc(sema.kamusalOdeme.odemeTarihi), asc(sema.kamusalOdeme.id));

  // O GÜNE ait hastanın bedeli: o gün oluşan borç satırlarının net (tutar − iskonto) toplamı — hastanın genel cari bakiyesi DEĞİL.
  const borclar = await tx
    .select({ hasta_id: B.hastaId, tutar: B.tutar, iskonto_tutari: B.iskontoTutari, created_at: B.createdAt })
    .from(B)
    .where(and(eq(B.tur, "borc"), gte(B.createdAt, donem.baslangic), lt(B.createdAt, donem.bitis)))
    .orderBy(asc(B.id));
  const gunlukBedelKurus = new Map<string, number>();
  for (const b of borclar) {
    const anahtar = `${formatDateForInput(b.created_at)}|${b.hasta_id}`;
    gunlukBedelKurus.set(anahtar, (gunlukBedelKurus.get(anahtar) ?? 0) + (kurus(b.tutar) ?? 0) - (kurus(b.iskonto_tutari) ?? 0));
  }
  const gunlukBedel = (tarih: string, hastaId: string | null) => {
    const k = hastaId ? gunlukBedelKurus.get(`${tarih}|${hastaId}`) : undefined;
    return k === undefined ? undefined : k / 100;
  };

  const gunler = new Map<string, GunlukOzet>();
  const gunKurus = new Map<string, { gelir: number[]; gider: number[] }>();
  function gunuAl(tarih: string): GunlukOzet {
    let gun = gunler.get(tarih);
    if (!gun) {
      gun = { tarih, gelir: 0, gider: 0, seansSayisi: 0, kalemler: [] };
      gunler.set(tarih, gun);
      gunKurus.set(tarih, { gelir: [], gider: [] });
    }
    return gun;
  }

  // Randevu başına bedelin KAPANIŞ ŞEKLİ (Cariye Ekle mi, hangi yöntemle tahsil mi): randevu_id'ye bağlı satırlardan türer; tarih filtresi YOK (ertesi gün kapatılmış olabilir).
  const randevular = new Map<string, { satir: (typeof randevuSatirlari)[number]; hareketler: { tur: string; yontem: string | null }[] }>();
  for (const r of randevuSatirlari) {
    let e = randevular.get(r.id);
    if (!e) {
      e = { satir: r, hareketler: [] };
      randevular.set(r.id, e);
    }
    if (r.hareket_tur) e.hareketler.push({ tur: r.hareket_tur, yontem: r.hareket_yontem });
  }
  function kapanisSekliEtiketi(paketSatisId: string | null, hareketler: { tur: string; yontem: string | null }[]): string | null {
    if (paketSatisId) return "Paketten düşüldü";
    if (hareketler.length === 0) return null;
    const odemeYontemi = hareketler.findLast((h) => h.tur === "odeme" && h.yontem)?.yontem ?? null;
    if (odemeYontemi) {
      const yontemEtiketi = YONTEM_ETIKETLERI[odemeYontemi as keyof typeof YONTEM_ETIKETLERI] ?? odemeYontemi;
      return `${yontemEtiketi} ile tahsil edildi`;
    }
    return hareketler.some((h) => h.tur === "borc") ? "Cariye eklendi (tahsil edilmedi)" : null;
  }

  for (const { satir: r, hareketler } of randevular.values()) {
    const tarih = formatDateForInput(r.baslangic);
    const gun = gunuAl(tarih);
    if (TAMAMLANAN_RANDEVU_DURUMLARI.has(r.durum)) gun.seansSayisi += 1;
    gun.kalemler.push({
      id: `randevu-${r.id}`,
      tur: "randevu",
      saat: formatTime(r.baslangic),
      baslik: r.hasta_ad ?? "Hasta",
      altBaslik: [r.terapist_ad, r.islem_ad].filter(Boolean).join(" · ") || null,
      tutar: 0,
      yon: "notr",
      durum: r.durum,
      gunlukBedel: gunlukBedel(tarih, r.hasta_id),
      kapanisSekli: kapanisSekliEtiketi(r.paket_satis_id, hareketler),
    });
  }

  for (const o of tahsilatlar) {
    const tarih = formatDateForInput(o.created_at);
    const gun = gunuAl(tarih);
    const iade = o.tur === "iade";
    const yontem = o.odeme_yontemi ? (YONTEM_ETIKETLERI[o.odeme_yontemi as keyof typeof YONTEM_ETIKETLERI] ?? o.odeme_yontemi) : null;
    const belge = o.belge_turu ? (BELGE_TURU_ETIKETLERI[o.belge_turu as keyof typeof BELGE_TURU_ETIKETLERI] ?? null) : null;
    gunKurus.get(tarih)!.gelir.push(isaretliKurus(o));
    gun.kalemler.push({
      id: `tahsilat-${o.id}`,
      tur: "gelir",
      saat: formatTime(o.created_at),
      baslik: o.hasta_ad ?? "Hasta",
      altBaslik: iade ? `${yontem ?? "Yöntem belirtilmemiş"} iadesi` : [yontem ?? "Yöntem belirtilmemiş", belge].filter(Boolean).join(" · ") + " tahsilat",
      tutar: tl(o.tutar),
      // İade net gelirden düşer — listede "−" ve kırmızı görünsün (yon: "gider"), ama tur "gelir" kalır: günün gelir kolonuna işaretli tutarla zaten yansıdı.
      yon: iade ? "gider" : "gelir",
      gunlukBedel: gunlukBedel(tarih, o.hasta_id),
    });
  }

  for (const h of harcamalar) {
    const gun = gunuAl(h.tarih);
    gunKurus.get(h.tarih)!.gider.push(kurus(h.tutar) ?? 0);
    gun.kalemler.push({
      id: `harcama-${h.id}`,
      tur: "gider",
      saat: null,
      baslik: h.aciklama || HARCAMA_KATEGORI_ETIKET[h.kategori],
      altBaslik: HARCAMA_KATEGORI_ETIKET[h.kategori],
      tutar: tl(h.tutar),
      yon: "gider",
    });
  }

  for (const k of kamusallar) {
    if (!k.odeme_tarihi) continue;
    const gun = gunuAl(k.odeme_tarihi);
    gunKurus.get(k.odeme_tarihi)!.gider.push(kurus(k.tutar) ?? 0);
    gun.kalemler.push({
      id: `kamusal-${k.id}`,
      tur: "muhasebe",
      saat: null,
      baslik: ODEME_TIPI_ETIKET[k.odeme_tipi as OdemeTipi] ?? k.odeme_tipi,
      altBaslik: "Muhasebe (Vergi, SGK)",
      tutar: tl(k.tutar),
      yon: "gider",
    });
  }

  for (const [tarih, gun] of gunler) {
    const k = gunKurus.get(tarih)!;
    gun.gelir = topla(k.gelir) / 100;
    gun.gider = topla(k.gider) / 100;
  }

  return Array.from(gunler.values()).sort((a, b) => (a.tarih < b.tarih ? 1 : -1));
}

export type DonemOzeti = {
  isletmeGideri: number;
  faturaliGiderler: number;
  muhasebeGideri: number;
  digerGiderler: number;
  gelir: GelirOzeti;
  randevuDurumu: RandevuDurumOzeti;
};

type DonemOzetiRpc = {
  gelir: { nakit: number | string; kredi_karti: number | string; banka_havalesi: number | string; belirtilmemis: number | string; iade: number | string };
  isletme_gideri: number | string;
  diger_giderler: number | string;
  faturali_giderler: number | string;
  muhasebe_gideri: number | string;
  randevu: { tamamlanan: number; planlanan: number; ertelenen: number; iptal_ve_gelmedi: number; toplam: number };
};

/**
 * Dönemin tüm toplamları TEK Postgres çağrısıyla (`rapor_donem_ozeti`): satırlar istemciye taşınmaz. RPC hatasında fırlatır.
 * jsonb içindeki sayılar JSON number olarak gelir (Postgres numeric → JSON'da tam gösterim); kuruşa `tl()` ile normalize edilir.
 */
export async function hesaplaDonemOzeti(tx: Tx, donem: RaporDonemi): Promise<DonemOzeti> {
  const satir = await rpc<{ rapor_donem_ozeti: DonemOzetiRpc }>(tx, "rapor_donem_ozeti", {
    p_baslangic: donem.baslangic,
    p_bitis: donem.bitis,
    p_baslangic_tarih: donem.baslangicTarih,
    p_bitis_tarih: donem.bitisTarih,
  });
  const r = satir[0]?.rapor_donem_ozeti;
  if (!r) throw new Error("Rapor özeti alınamadı.");
  const n = (x: number | string | null | undefined) => tl(x);
  const gelir: GelirOzeti = {
    nakit: n(r.gelir.nakit),
    krediKarti: n(r.gelir.kredi_karti),
    bankaHavalesi: n(r.gelir.banka_havalesi),
    belirtilmemis: n(r.gelir.belirtilmemis),
    iade: n(r.gelir.iade),
    netTahsilat: 0,
  };
  gelir.netTahsilat = (topla([gelir.nakit, gelir.krediKarti, gelir.bankaHavalesi, gelir.belirtilmemis].map((x) => kurus(x) ?? 0)) - (kurus(gelir.iade) ?? 0)) / 100;
  return {
    isletmeGideri: n(r.isletme_gideri),
    faturaliGiderler: n(r.faturali_giderler),
    muhasebeGideri: n(r.muhasebe_gideri),
    digerGiderler: n(r.diger_giderler),
    gelir,
    randevuDurumu: {
      tamamlanan: Number(r.randevu.tamamlanan),
      planlanan: Number(r.randevu.planlanan),
      ertelenen: Number(r.randevu.ertelenen),
      iptalVeGelmedi: Number(r.randevu.iptal_ve_gelmedi),
      toplam: Number(r.randevu.toplam),
    },
  };
}

/** Yıllık özet (grafik): Postgres'te gruplanmış 12 satır (`rapor_yillik_ozet`). */
export async function hesaplaYillikOzet(tx: Tx, yil: number): Promise<YillikAy[]> {
  const aylar = yilinAylari(yil);
  const satirlar = await rpc<{ ay: number; gelir: string; gider: string; seans_sayisi: number }>(tx, "rapor_yillik_ozet", { p_yil: yil });
  const ayMap = new Map(satirlar.map((r) => [Number(r.ay), r]));
  return aylar.map((ayDonemi, index) => {
    const r = ayMap.get(index + 1);
    return { ay: index + 1, ayEtiketi: ayDonemi.etiket, gelir: tl(r?.gelir), gider: tl(r?.gider), seansSayisi: Number(r?.seans_sayisi ?? 0) };
  });
}
