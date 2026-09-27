import type { createClient } from "@/lib/supabase/server";
import { maasHesapla } from "@/lib/maas";
import type { MaasHesaplamaModeli } from "@/types/personel";
import type {
  GelirOzeti,
  GunlukOzet,
  RandevuDurumOzeti,
  SabitPersonelMaliyeti,
  TerapistPrimSatiri,
  YillikAy,
} from "@/types/raporlar";
import type { RaporDonemi } from "@/lib/raporlar/donem";
import { raporYilDonemi, yilinAylari } from "@/lib/raporlar/donem";
import { formatDateForInput, formatTime } from "@/lib/datetime";
import { HARCAMA_KATEGORI_ETIKET, type HarcamaKategori } from "@/types/klinik-harcama";
import { ODEME_TIPI_ETIKET, type OdemeTipi } from "@/types/kamusal-odeme";

type SupabaseSunucuClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Sabit personel maliyeti: tüm aktif personelin maaşı + o dönemdeki ekstra
 * hakedişleri (personel_hesap_hareket: prim/yol/yemek/mesai — hakedis/avans/
 * kesinti/odeme hariç), terapistler için lib/maas.ts'teki aynı prim/baraj
 * mantığıyla hesaplanan hakediş dahil. SGK işveren payı
 * bilinçli olarak burada YOK — personel şemasında SGK kolonu yok, kullanıcı
 * kararıyla vergi/SGK maliyeti Muhasebe raporuna (klinik_harcama kategori
 * 'vergi_sgk') taşındı, bkz. hesaplaMuhasebeGideri.
 */
export async function hesaplaSabitPersonelMaliyeti(
  supabase: SupabaseSunucuClient,
  klinikId: string,
  donem: RaporDonemi
): Promise<SabitPersonelMaliyeti> {
  const { data: personelListesi } = await supabase
    .from("personel")
    .select("id, ad_soyad, maas")
    .eq("klinik_id", klinikId)
    .eq("aktif", true)
    .returns<{ id: string; ad_soyad: string; maas: number | null }[]>();

  const personeller = personelListesi ?? [];
  if (personeller.length === 0) {
    return { toplamMaas: 0, sabitToplam: 0, ekstraToplam: 0, terapistPrimleri: [] };
  }

  const personelIdler = personeller.map((p) => p.id);

  const [terapistSonuc, hakedisSonuc] = await Promise.all([
    supabase
      .from("terapist")
      .select("id, personel_id, maas_hesaplama_modeli, prim_sabit_tutar, baraj_seans_sayisi, baraj_bonus_tutari")
      .eq("klinik_id", klinikId)
      .in("personel_id", personelIdler)
      .returns<
        {
          id: string;
          personel_id: string;
          maas_hesaplama_modeli: MaasHesaplamaModeli;
          prim_sabit_tutar: number | null;
          baraj_seans_sayisi: number | null;
          baraj_bonus_tutari: number | null;
        }[]
      >(),
    // hakedis (taban maaş) hariç — o zaten personel.maas üzerinden sabitToplam'a
    // dahil ediliyor, burada tekrar sayılırsa çift sayım olur. avans/kesinti/odeme
    // de dahil edilmiyor — onlar bir maliyet ARTIŞI değil, tahakkuk etmiş
    // hakedişin ödenmesi/kapatılması (bkz. personel_hesap_hareket şeması).
    supabase
      .from("personel_hesap_hareket")
      .select("personel_id, tutar")
      .eq("klinik_id", klinikId)
      .in("tur", ["prim", "yol", "yemek", "mesai"])
      .gte("tarih", donem.baslangicTarih)
      .lt("tarih", donem.bitisTarih)
      .returns<{ personel_id: string; tutar: number }[]>(),
  ]);

  const terapistler = terapistSonuc.data ?? [];
  const terapistIdler = terapistler.map((t) => t.id);

  const { data: randevuSonuc } = terapistIdler.length
    ? await supabase
        .from("randevu")
        .select("terapist_id")
        .eq("klinik_id", klinikId)
        .in("durum", ["geldi", "gecikmeli_geldi", "tamamlandi"])
        .in("terapist_id", terapistIdler)
        .gte("baslangic", donem.baslangic)
        .lt("baslangic", donem.bitis)
        .returns<{ terapist_id: string }[]>()
    : { data: [] as { terapist_id: string }[] };

  const seansSayisiMap = new Map<string, number>();
  for (const r of randevuSonuc ?? []) {
    seansSayisiMap.set(r.terapist_id, (seansSayisiMap.get(r.terapist_id) ?? 0) + 1);
  }

  const hakedisMap = new Map<string, number>();
  for (const h of hakedisSonuc.data ?? []) {
    hakedisMap.set(h.personel_id, (hakedisMap.get(h.personel_id) ?? 0) + h.tutar);
  }

  const terapistByPersonelId = new Map(terapistler.map((t) => [t.personel_id, t]));

  let sabitToplamGenel = 0;
  let ekstraToplamGenel = 0;
  const terapistPrimleri: TerapistPrimSatiri[] = [];

  for (const personel of personeller) {
    const ekstraToplam = hakedisMap.get(personel.id) ?? 0;
    const terapist = terapistByPersonelId.get(personel.id);

    if (terapist) {
      const seansSayisi = seansSayisiMap.get(terapist.id) ?? 0;
      const hesap = maasHesapla(
        {
          maas_hesaplama_modeli: terapist.maas_hesaplama_modeli,
          sabit_maas: personel.maas,
          prim_sabit_tutar: terapist.prim_sabit_tutar,
          baraj_seans_sayisi: terapist.baraj_seans_sayisi,
          baraj_bonus_tutari: terapist.baraj_bonus_tutari,
        },
        seansSayisi,
        ekstraToplam
      );
      sabitToplamGenel += hesap.taban + hesap.prim;
      ekstraToplamGenel += hesap.ekstra_toplam;
      terapistPrimleri.push({
        personelId: personel.id,
        adSoyad: personel.ad_soyad,
        taban: hesap.taban,
        prim: hesap.prim,
        ekstraToplam: hesap.ekstra_toplam,
        toplam: hesap.toplam,
        aciklama: hesap.aciklama,
      });
    } else {
      sabitToplamGenel += personel.maas ?? 0;
      ekstraToplamGenel += ekstraToplam;
    }
  }

  return {
    toplamMaas: sabitToplamGenel + ekstraToplamGenel,
    sabitToplam: sabitToplamGenel,
    ekstraToplam: ekstraToplamGenel,
    terapistPrimleri,
  };
}

type KlinikHarcamaSatir = { tutar: number };

/**
 * İşletme gideri: kira/fatura/malzeme kategorisindeki, faturasız
 * (is_faturali=false) klinik_harcama kayıtları. 'diger' kategorisi kendi
 * ayrı kalemine (hesaplaDigerGiderler) taşındı; aynı tutarın hem burada hem
 * Faturalı Giderler'de çift sayılmaması için is_faturali=false şartı zorunlu.
 */
export async function hesaplaIsletmeGideri(
  supabase: SupabaseSunucuClient,
  klinikId: string,
  donem: RaporDonemi
): Promise<number> {
  const { data } = await supabase
    .from("klinik_harcama")
    .select("tutar")
    .eq("klinik_id", klinikId)
    .neq("kategori", "diger")
    .eq("is_faturali", false)
    .gte("tarih", donem.baslangicTarih)
    .lt("tarih", donem.bitisTarih)
    .returns<KlinikHarcamaSatir[]>();
  return (data ?? []).reduce((acc, satir) => acc + satir.tutar, 0);
}

/**
 * Diğer giderler: kategori='diger', faturasız klinik_harcama kayıtları —
 * daha önce İşletme Gideri'ne dahildi, Raporlar'da ayrı bir kalem olarak
 * gösterilebilmesi için buraya ayrıldı (kullanıcı kararı).
 */
export async function hesaplaDigerGiderler(
  supabase: SupabaseSunucuClient,
  klinikId: string,
  donem: RaporDonemi
): Promise<number> {
  const { data } = await supabase
    .from("klinik_harcama")
    .select("tutar")
    .eq("klinik_id", klinikId)
    .eq("kategori", "diger")
    .eq("is_faturali", false)
    .gte("tarih", donem.baslangicTarih)
    .lt("tarih", donem.bitisTarih)
    .returns<KlinikHarcamaSatir[]>();
  return (data ?? []).reduce((acc, satir) => acc + satir.tutar, 0);
}

/**
 * Faturalı giderler: kira/fatura/malzeme/diğer kategorisinde ama is_faturali=true
 * işaretlenmiş klinik_harcama kayıtları. Gerçek Paraşüt gider-faturası
 * senkronizasyonu henüz yok (hesap/API kimlik bilgisi kurulmadı), bu yüzden
 * bu bucket şimdilik elle "faturalı" işaretlenen kayıtlardan besleniyor.
 */
export async function hesaplaFaturaliGiderler(
  supabase: SupabaseSunucuClient,
  klinikId: string,
  donem: RaporDonemi
): Promise<number> {
  const { data } = await supabase
    .from("klinik_harcama")
    .select("tutar")
    .eq("klinik_id", klinikId)
    .eq("is_faturali", true)
    .gte("tarih", donem.baslangicTarih)
    .lt("tarih", donem.bitisTarih)
    .returns<KlinikHarcamaSatir[]>();
  return (data ?? []).reduce((acc, satir) => acc + satir.tutar, 0);
}

/**
 * Muhasebe (vergi/SGK) gideri: kamusal_odeme'de fiilen ÖDENMİŞ (odeme_tarihi
 * dolu) kayıtların, ödeme tarihi bu dönemin içine düşenlerin toplamı — nakit
 * bazlı raporlama (henüz ödenmemiş/vadesi gelmemiş tutarlar gerçekleşmiş bir
 * gider sayılmaz, Kamusal Giderler ekranındaki "Bekleyen" tutarına dahildir).
 * Personel SGK işveren payı da (kullanıcı kararıyla) burada elle girilir,
 * personel şemasında ayrı bir SGK kolonu yok. Önceki turda klinik_harcama
 * (kategori='vergi_sgk') kullanılıyordu, bkz. migration 20260809120000.
 */
export async function hesaplaMuhasebeGideri(
  supabase: SupabaseSunucuClient,
  klinikId: string,
  donem: RaporDonemi
): Promise<number> {
  const { data } = await supabase
    .from("kamusal_odeme")
    .select("tutar")
    .eq("klinik_id", klinikId)
    .not("odeme_tarihi", "is", null)
    .gte("odeme_tarihi", donem.baslangicTarih)
    .lt("odeme_tarihi", donem.bitisTarih)
    .returns<KlinikHarcamaSatir[]>();
  return (data ?? []).reduce((acc, satir) => acc + satir.tutar, 0);
}

type OdemeGelirSatiri = {
  faturali: boolean;
  iskonto_tutari: number;
  odeme_kalemi: { miktar: number; birim_fiyat: number }[];
};

/**
 * Gelir: KDV'li (brüt)/KDV'siz (net) ayrımı artık KDV oranından değil,
 * ödemenin faturalı olup olmadığından geliyor (kullanıcı kararı) — faturalı
 * satışlar KDV'li (brüt) tutarında, faturasız satışlar KDV'siz (net)
 * tutarında toplanıyor. Gerçek KDV tutarı zaten Muhasebe (Vergi, SGK)
 * bölümünde ayrıca raporlandığı için burada tekrar hesaplanmıyor. İskonto
 * tek kalemde (iskontoToplam) ayrıca raporlanır; faturalı ödemelerin
 * `fatura` tablosundaki karşılığı burada tekrar sayılmaz (ayrı bir
 * gelir/gider kalemi değil, aynı gelirin belgesi).
 */
export async function hesaplaGelir(
  supabase: SupabaseSunucuClient,
  klinikId: string,
  donem: RaporDonemi
): Promise<GelirOzeti> {
  const { data } = await supabase
    .from("odeme")
    .select("faturali, iskonto_tutari, odeme_kalemi(miktar, birim_fiyat)")
    .eq("klinik_id", klinikId)
    .gte("created_at", donem.baslangic)
    .lt("created_at", donem.bitis)
    .returns<OdemeGelirSatiri[]>();

  let kdvli = 0;
  let kdvsiz = 0;
  let iskontoToplam = 0;

  for (const odeme of data ?? []) {
    iskontoToplam += odeme.iskonto_tutari;
    const brutToplam = odeme.odeme_kalemi.reduce((acc, kalem) => acc + kalem.miktar * kalem.birim_fiyat, 0);
    if (odeme.faturali) {
      kdvli += brutToplam;
    } else {
      kdvsiz += brutToplam;
    }
  }

  return {
    kdvli,
    kdvsiz,
    iskontoToplam,
    netTahsilat: kdvli + kdvsiz - iskontoToplam,
  };
}

type RandevuDurumSatir = {
  durum: "planlandi" | "geldi" | "gecikmeli_geldi" | "gelmedi" | "ertelendi" | "iptal" | "tamamlandi";
};

/**
 * Randevu durum özeti: dönem içinde başlayan randevuların durumu 4 kovaya
 * indirgenir — tamamlanan (geldi/gecikmeli_geldi/tamamlandi), planlanan
 * (henüz olacak), ertelenen, iptal+gelmedi (birlikte, ikisi de seansın
 * gerçekleşmediği anlamına geldiği için tek kovada).
 */
export async function hesaplaRandevuDurumOzeti(
  supabase: SupabaseSunucuClient,
  klinikId: string,
  donem: RaporDonemi
): Promise<RandevuDurumOzeti> {
  const { data } = await supabase
    .from("randevu")
    .select("durum")
    .eq("klinik_id", klinikId)
    .gte("baslangic", donem.baslangic)
    .lt("baslangic", donem.bitis)
    .returns<RandevuDurumSatir[]>();

  const satirlar = data ?? [];
  let tamamlanan = 0;
  let planlanan = 0;
  let ertelenen = 0;
  let iptalVeGelmedi = 0;

  for (const satir of satirlar) {
    if (satir.durum === "geldi" || satir.durum === "gecikmeli_geldi" || satir.durum === "tamamlandi") {
      tamamlanan += 1;
    } else if (satir.durum === "planlandi") {
      planlanan += 1;
    } else if (satir.durum === "ertelendi") {
      ertelenen += 1;
    } else if (satir.durum === "iptal" || satir.durum === "gelmedi") {
      iptalVeGelmedi += 1;
    }
  }

  return { tamamlanan, planlanan, ertelenen, iptalVeGelmedi, toplam: satirlar.length };
}

/**
 * Yıllık özet: grafik için tek geçişte hesaplanır (12 ay için ayrı ayrı sorgu
 * atmak yerine yılın tamamı tek seferde çekilip JS tarafında aya göre
 * gruplanır) — klinik ölçeğinde bir yıllık veri için yeterli, ileride veri
 * hacmi büyürse tarih bazlı gruplu SQL sorgusuna geçilebilir.
 */
export async function hesaplaYillikOzet(
  supabase: SupabaseSunucuClient,
  klinikId: string,
  yil: number
): Promise<YillikAy[]> {
  const yilDonemi = raporYilDonemi(yil);
  const aylar = yilinAylari(yil);

  const [harcamaSonuc, kamusalOdemeSonuc, odemeSonuc, randevuSonuc] = await Promise.all([
    supabase
      .from("klinik_harcama")
      .select("tutar, tarih")
      .eq("klinik_id", klinikId)
      .gte("tarih", yilDonemi.baslangicTarih)
      .lt("tarih", yilDonemi.bitisTarih)
      .returns<{ tutar: number; tarih: string }[]>(),
    supabase
      .from("kamusal_odeme")
      .select("tutar, odeme_tarihi")
      .eq("klinik_id", klinikId)
      .not("odeme_tarihi", "is", null)
      .gte("odeme_tarihi", yilDonemi.baslangicTarih)
      .lt("odeme_tarihi", yilDonemi.bitisTarih)
      .returns<{ tutar: number; odeme_tarihi: string }[]>(),
    supabase
      .from("odeme")
      .select("created_at, odeme_kalemi(miktar, birim_fiyat)")
      .eq("klinik_id", klinikId)
      .gte("created_at", yilDonemi.baslangic)
      .lt("created_at", yilDonemi.bitis)
      .returns<{ created_at: string; odeme_kalemi: { miktar: number; birim_fiyat: number }[] }[]>(),
    supabase
      .from("randevu")
      .select("baslangic")
      .eq("klinik_id", klinikId)
      .in("durum", ["geldi", "gecikmeli_geldi", "tamamlandi"])
      .gte("baslangic", yilDonemi.baslangic)
      .lt("baslangic", yilDonemi.bitis)
      .returns<{ baslangic: string }[]>(),
  ]);

  const harcamalar = harcamaSonuc.data ?? [];
  const kamusalOdemeler = kamusalOdemeSonuc.data ?? [];
  const odemeler = odemeSonuc.data ?? [];
  const randevular = randevuSonuc.data ?? [];

  return aylar.map((ayDonemi, index) => {
    const gider =
      harcamalar
        .filter((h) => h.tarih >= ayDonemi.baslangicTarih && h.tarih < ayDonemi.bitisTarih)
        .reduce((acc, h) => acc + h.tutar, 0) +
      kamusalOdemeler
        .filter((k) => k.odeme_tarihi >= ayDonemi.baslangicTarih && k.odeme_tarihi < ayDonemi.bitisTarih)
        .reduce((acc, k) => acc + k.tutar, 0);

    const gelir = odemeler
      .filter((o) => o.created_at >= ayDonemi.baslangic && o.created_at < ayDonemi.bitis)
      .reduce(
        (acc, o) => acc + o.odeme_kalemi.reduce((kAcc, k) => kAcc + k.miktar * k.birim_fiyat, 0),
        0
      );

    const seansSayisi = randevular.filter(
      (r) => r.baslangic >= ayDonemi.baslangic && r.baslangic < ayDonemi.bitis
    ).length;

    return { ay: index + 1, ayEtiketi: ayDonemi.etiket, gelir, gider, seansSayisi };
  });
}

type RandevuGunlukSatir = {
  id: string;
  baslangic: string;
  durum: string;
  hasta_id: string | null;
  hasta: { ad_soyad: string } | null;
  terapist: { personel: { ad_soyad: string } | null } | null;
  islem_tanimi: { ad: string } | null;
};

type OdemeGunlukSatir = {
  id: string;
  created_at: string;
  faturali: boolean;
  iskonto_tutari: number;
  hasta_id: string | null;
  hasta: { ad_soyad: string } | null;
  odeme_kalemi: { miktar: number; birim_fiyat: number }[];
};

type KlinikHarcamaGunlukSatir = {
  id: string;
  tarih: string;
  tutar: number;
  kategori: HarcamaKategori;
  aciklama: string | null;
};

type KamusalOdemeGunlukSatir = {
  id: string;
  odeme_tarihi: string | null;
  tutar: number;
  odeme_tipi: OdemeTipi;
};

const TAMAMLANAN_RANDEVU_DURUMLARI = new Set(["geldi", "gecikmeli_geldi", "tamamlandi"]);

/**
 * Aylık görünümdeki "Günlük Döküm" listesi için: dönem içindeki her günün
 * gelir/gider toplamı + o güne ait tüm kalemlerin (randevu/gelir/gider/
 * muhasebe) dökümü. Toplamlar aynı kaynaklardan (odeme, klinik_harcama,
 * kamusal_odeme) hesaplanır — hesaplaGelir/hesaplaIsletmeGideri/vb. ile
 * TUTARLI kalması için ayrı bir mantık icat edilmedi, aynı tablolar günlere
 * bölünerek yeniden gruplanır. Randevu kalemleri kendi başına bir tutar
 * TAŞIMAZ (yon: "notr") — bilgi amaçlı listelenir, gerçek gelir `odeme`
 * tablosundan gelir (bkz. hesaplaGelir'deki not: cari borç/ödeme modeli
 * seans tamamlanmasıyla otomatik gelir yazmıyor).
 *
 * BİLİNÇLİ KAPSAM DIŞI: sabit personel maliyeti (maaş) güne dağıtılmaz —
 * aylık/tek bir tahakkuk, belirli bir güne ait değil (hesaplaYillikOzet'teki
 * aylık kırılımda da aynı sebeple yok). Bu yüzden bu listedeki günlerin
 * gider toplamı, üstteki "Toplam Gider" kartından sabitPersonel.toplamMaas
 * kadar düşük kalır — bilinçli, UI'da ayrıca not düşülür.
 */
export async function hesaplaGunlukDokum(
  supabase: SupabaseSunucuClient,
  klinikId: string,
  donem: RaporDonemi
): Promise<GunlukOzet[]> {
  const [randevuSonuc, odemeSonuc, harcamaSonuc, kamusalSonuc] = await Promise.all([
    supabase
      .from("randevu")
      .select("id, baslangic, durum, hasta_id, hasta(ad_soyad), terapist(personel(ad_soyad)), islem_tanimi(ad)")
      .eq("klinik_id", klinikId)
      .gte("baslangic", donem.baslangic)
      .lt("baslangic", donem.bitis)
      .order("baslangic")
      .returns<RandevuGunlukSatir[]>(),
    supabase
      .from("odeme")
      .select("id, created_at, faturali, iskonto_tutari, hasta_id, hasta(ad_soyad), odeme_kalemi(miktar, birim_fiyat)")
      .eq("klinik_id", klinikId)
      .gte("created_at", donem.baslangic)
      .lt("created_at", donem.bitis)
      .order("created_at")
      .returns<OdemeGunlukSatir[]>(),
    supabase
      .from("klinik_harcama")
      .select("id, tarih, tutar, kategori, aciklama")
      .eq("klinik_id", klinikId)
      .gte("tarih", donem.baslangicTarih)
      .lt("tarih", donem.bitisTarih)
      .order("tarih")
      .returns<KlinikHarcamaGunlukSatir[]>(),
    supabase
      .from("kamusal_odeme")
      .select("id, odeme_tarihi, tutar, odeme_tipi")
      .eq("klinik_id", klinikId)
      .not("odeme_tarihi", "is", null)
      .gte("odeme_tarihi", donem.baslangicTarih)
      .lt("odeme_tarihi", donem.bitisTarih)
      .order("odeme_tarihi")
      .returns<KamusalOdemeGunlukSatir[]>(),
  ]);

  // Randevu/gelir kalemlerinin yanında hastanın GÜNCEL toplam cari bakiyesini
  // (v_hasta_cari_ozet.kalan_bakiye) göstermek için — bu VIEW olduğundan
  // (PostgREST embed tuzağı, bkz. CLAUDE.md) hasta(...) ile birlikte
  // EMBED EDİLEMEZ, ayrı çekilip hasta_id ile Map'lenir. View, bakiyesi
  // sıfır/negatif olan hastaları hiç döndürmez (bkz. migration) — bu yüzden
  // haritada bulunamayan hasta_id 0 (borcu yok) sayılır.
  const hastaIdSeti = new Set<string>();
  for (const r of randevuSonuc.data ?? []) if (r.hasta_id) hastaIdSeti.add(r.hasta_id);
  for (const o of odemeSonuc.data ?? []) if (o.hasta_id) hastaIdSeti.add(o.hasta_id);

  const { data: cariData } = hastaIdSeti.size
    ? await supabase
        .from("v_hasta_cari_ozet")
        .select("hasta_id, kalan_bakiye")
        .eq("klinik_id", klinikId)
        .in("hasta_id", Array.from(hastaIdSeti))
        .returns<{ hasta_id: string; kalan_bakiye: number }[]>()
    : { data: [] as { hasta_id: string; kalan_bakiye: number }[] };
  const bakiyeMap = new Map((cariData ?? []).map((c) => [c.hasta_id, c.kalan_bakiye]));
  const hastaBakiyesi = (hastaId: string | null) => (hastaId ? (bakiyeMap.get(hastaId) ?? 0) : undefined);

  const gunler = new Map<string, GunlukOzet>();
  function gunuAl(tarih: string): GunlukOzet {
    let gun = gunler.get(tarih);
    if (!gun) {
      gun = { tarih, gelir: 0, gider: 0, seansSayisi: 0, kalemler: [] };
      gunler.set(tarih, gun);
    }
    return gun;
  }

  for (const r of randevuSonuc.data ?? []) {
    const gun = gunuAl(formatDateForInput(r.baslangic));
    if (TAMAMLANAN_RANDEVU_DURUMLARI.has(r.durum)) gun.seansSayisi += 1;
    gun.kalemler.push({
      id: `randevu-${r.id}`,
      tur: "randevu",
      saat: formatTime(r.baslangic),
      baslik: r.hasta?.ad_soyad ?? "Hasta",
      altBaslik: [r.terapist?.personel?.ad_soyad, r.islem_tanimi?.ad].filter(Boolean).join(" · ") || null,
      tutar: 0,
      yon: "notr",
      durum: r.durum,
      bakiye: hastaBakiyesi(r.hasta_id),
    });
  }

  for (const o of odemeSonuc.data ?? []) {
    const gun = gunuAl(formatDateForInput(o.created_at));
    const brutToplam = o.odeme_kalemi.reduce((acc, kalem) => acc + kalem.miktar * kalem.birim_fiyat, 0);
    const net = brutToplam - o.iskonto_tutari;
    gun.gelir += net;
    gun.kalemler.push({
      id: `odeme-${o.id}`,
      tur: "gelir",
      saat: formatTime(o.created_at),
      baslik: o.hasta?.ad_soyad ?? "Hasta",
      altBaslik: o.faturali ? "Faturalı tahsilat" : "Faturasız tahsilat",
      tutar: net,
      yon: "gelir",
      bakiye: hastaBakiyesi(o.hasta_id),
    });
  }

  for (const h of harcamaSonuc.data ?? []) {
    const gun = gunuAl(h.tarih);
    gun.gider += h.tutar;
    gun.kalemler.push({
      id: `harcama-${h.id}`,
      tur: "gider",
      saat: null,
      baslik: h.aciklama || HARCAMA_KATEGORI_ETIKET[h.kategori],
      altBaslik: HARCAMA_KATEGORI_ETIKET[h.kategori],
      tutar: h.tutar,
      yon: "gider",
    });
  }

  for (const k of kamusalSonuc.data ?? []) {
    if (!k.odeme_tarihi) continue;
    const gun = gunuAl(k.odeme_tarihi);
    gun.gider += k.tutar;
    gun.kalemler.push({
      id: `kamusal-${k.id}`,
      tur: "muhasebe",
      saat: null,
      baslik: ODEME_TIPI_ETIKET[k.odeme_tipi] ?? k.odeme_tipi,
      altBaslik: "Muhasebe (Vergi, SGK)",
      tutar: k.tutar,
      yon: "gider",
    });
  }

  return Array.from(gunler.values()).sort((a, b) => (a.tarih < b.tarih ? 1 : -1));
}
