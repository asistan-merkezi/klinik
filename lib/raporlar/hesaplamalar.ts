import type { createClient } from "@/lib/supabase/server";
import { hakedisHesapla } from "@/lib/personel/hakedis";
import { donemMaasi, maasGecmisiGetir, type MaasGecmisiSatiri } from "@/lib/personel/donem-maasi";
import { seansSayilariniGetir } from "@/lib/personel/seans-sayisi";
import { donemAylari, personelMaliyetiniTopla, type DefterSatiri, type DonemTahmini } from "@/lib/raporlar/personel-maliyeti";
import { ayAraligi } from "@/lib/utils";
import type { MaasHesaplamaModeli } from "@/types/personel";
import type {
  GelirOzeti,
  GunlukOzet,
  RandevuDurumOzeti,
  SabitPersonelMaliyeti,
  YillikAy,
} from "@/types/raporlar";
import type { RaporDonemi } from "@/lib/raporlar/donem";
import { raporYilDonemi, yilinAylari } from "@/lib/raporlar/donem";
import { bugunIstanbulTarihi, formatDateForInput, formatTime } from "@/lib/datetime";
import { HARCAMA_KATEGORI_ETIKET, type HarcamaKategori } from "@/types/klinik-harcama";
import { ODEME_TIPI_ETIKET, type OdemeTipi } from "@/types/kamusal-odeme";
import { BELGE_TURU_ETIKETLERI, YONTEM_ETIKETLERI } from "@/types/odeme";
import { tumSayfalariOku } from "@/lib/supabase/sayfali-okuma";

type SupabaseSunucuClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Personel gideri (Raporlar): kapalı dönemlerde defterdeki gerçek tahakkuk, açık dönemlerde o ayın
 * maaşıyla tahmin, elle girilen prim/yol/yemek/mesai ekstra — kural ve gerekçe
 * lib/raporlar/personel-maliyeti.ts'te. Dönem birden çok ay kapsıyorsa (Yıllık) her ay ayrı
 * değerlendirilir; bugünden sonraki aylar sayılmaz. SGK işveren payı burada YOK (Muhasebe
 * raporu, klinik_harcama 'vergi_sgk').
 */
export async function hesaplaSabitPersonelMaliyeti(
  supabase: SupabaseSunucuClient,
  klinikId: string,
  donem: RaporDonemi
): Promise<SabitPersonelMaliyeti> {
  const aylar = donemAylari(donem.baslangicTarih, donem.bitisTarih, bugunIstanbulTarihi());

  type PersonelSatiri = {
    id: string;
    ad_soyad: string;
    maas: number | null;
    aktif: boolean;
    ise_giris_tarihi: string | null;
    isten_cikis_tarihi: string | null;
  };
  type TerapistSatiri = {
    id: string;
    personel_id: string;
    maas_hesaplama_modeli: MaasHesaplamaModeli;
    prim_sabit_tutar: number | null;
    baraj_seans_sayisi: number | null;
    baraj_bonus_tutari: number | null;
  };

  const yillar = [...new Set(aylar.map((a) => Number(a.slice(0, 4))))];
  const [personeller, terapistler, defter, kapaliDonemler] = await Promise.all([
    tumSayfalariOku<PersonelSatiri>((bas, son) =>
      supabase
        .from("personel")
        .select("id, ad_soyad, maas, aktif, ise_giris_tarihi, isten_cikis_tarihi")
        .eq("klinik_id", klinikId)
        .order("id")
        .range(bas, son)
    ),
    tumSayfalariOku<TerapistSatiri>((bas, son) =>
      supabase
        .from("terapist")
        .select("id, personel_id, maas_hesaplama_modeli, prim_sabit_tutar, baraj_seans_sayisi, baraj_bonus_tutari")
        .eq("klinik_id", klinikId)
        .order("id")
        .range(bas, son)
    ),
    tumSayfalariOku<DefterSatiri & { id: string }>((bas, son) =>
      supabase
        .from("personel_hesap_hareket")
        .select("id, personel_id, tur, tutar, kaynak_id")
        .eq("klinik_id", klinikId)
        .in("tur", ["hakedis", "prim", "yol", "yemek", "mesai"])
        .gte("tarih", donem.baslangicTarih)
        .lt("tarih", donem.bitisTarih)
        .order("id")
        .range(bas, son)
    ),
    yillar.length === 0
      ? Promise.resolve([] as { id: string; personel_id: string; yil: number; ay: number }[])
      : tumSayfalariOku<{ id: string; personel_id: string; yil: number; ay: number }>((bas, son) =>
          supabase
            .from("personel_puantaj_donem")
            .select("id, personel_id, yil, ay")
            .eq("klinik_id", klinikId)
            .eq("durum", "kapali")
            .in("yil", yillar)
            .order("id")
            .range(bas, son)
        ),
  ]);

  const terapistByPersonelId = new Map(terapistler.map((t) => [t.personel_id, t]));
  const kapali = new Set(kapaliDonemler.map((d) => `${d.personel_id}|${d.yil}-${String(d.ay).padStart(2, "0")}`));

  let maasGecmisi = new Map<string, MaasGecmisiSatiri[]>();
  try {
    maasGecmisi = await maasGecmisiGetir(supabase, personeller.map((p) => p.id));
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

    const seansSayilari = await seansSayilariniGetir(
      supabase,
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

type KlinikHarcamaSatir = { id: string; tutar: number };

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
  const data = await tumSayfalariOku<KlinikHarcamaSatir>((bas, son) =>
    supabase
      .from("klinik_harcama")
      .select("id, tutar")
      .eq("klinik_id", klinikId)
      .neq("kategori", "diger")
      .eq("is_faturali", false)
      .gte("tarih", donem.baslangicTarih)
      .lt("tarih", donem.bitisTarih)
      .order("id")
      .range(bas, son)
  );
  return data.reduce((acc, satir) => acc + satir.tutar, 0);
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
  const data = await tumSayfalariOku<KlinikHarcamaSatir>((bas, son) =>
    supabase
      .from("klinik_harcama")
      .select("id, tutar")
      .eq("klinik_id", klinikId)
      .eq("kategori", "diger")
      .eq("is_faturali", false)
      .gte("tarih", donem.baslangicTarih)
      .lt("tarih", donem.bitisTarih)
      .order("id")
      .range(bas, son)
  );
  return data.reduce((acc, satir) => acc + satir.tutar, 0);
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
  const data = await tumSayfalariOku<KlinikHarcamaSatir>((bas, son) =>
    supabase
      .from("klinik_harcama")
      .select("id, tutar")
      .eq("klinik_id", klinikId)
      .eq("is_faturali", true)
      .gte("tarih", donem.baslangicTarih)
      .lt("tarih", donem.bitisTarih)
      .order("id")
      .range(bas, son)
  );
  return data.reduce((acc, satir) => acc + satir.tutar, 0);
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
  const data = await tumSayfalariOku<KlinikHarcamaSatir>((bas, son) =>
    supabase
      .from("kamusal_odeme")
      .select("id, tutar")
      .eq("klinik_id", klinikId)
      .not("odeme_tarihi", "is", null)
      .gte("odeme_tarihi", donem.baslangicTarih)
      .lt("odeme_tarihi", donem.bitisTarih)
      .order("id")
      .range(bas, son)
  );
  return data.reduce((acc, satir) => acc + satir.tutar, 0);
}

type TahsilatSatiri = {
  id: string;
  created_at: string;
  tur: "odeme" | "iade";
  tutar: number;
  odeme_yontemi: string | null;
};

/**
 * Bir dönemdeki gerçek tahsilat/iade satırları: hasta_bakiye_hareket'te
 * tur IN ('odeme','iade'). Kasa/Banka/Kredi Kartı ile AYNI kaynak — önceden
 * Raporlar `odeme` tablosunu okuyordu ama o tabloya yalnız bir borç
 * "faturalı" işaretlenince satır yazılıyordu (bkz. CLAUDE.md > Raporlar):
 * faturalı-ama-ödenmemiş borç gelir sayılıyor, faturasız nakit tahsilat hiç
 * sayılmıyordu. `select` çağıranın ihtiyacına göre genişletilebilir (ek kolon/embed).
 */
async function tahsilatSatirlariniGetir<T extends TahsilatSatiri>(
  supabase: SupabaseSunucuClient,
  klinikId: string,
  baslangic: string,
  bitis: string,
  select = "id, created_at, tur, tutar, odeme_yontemi"
): Promise<T[]> {
  return tumSayfalariOku<T>((bas, son) =>
    supabase
      .from("hasta_bakiye_hareket")
      .select(select)
      .eq("klinik_id", klinikId)
      .in("tur", ["odeme", "iade"])
      .gte("created_at", baslangic)
      .lt("created_at", bitis)
      .order("created_at")
      .order("id")
      .range(bas, son)
      .returns<T[]>()
  );
}

/** Ödeme tutarını, iade ise negatif olarak döner — net tahsilat toplamları için. */
const netTutar = (s: Pick<TahsilatSatiri, "tur" | "tutar">) => (s.tur === "iade" ? -s.tutar : s.tutar);

/**
 * Gelir = gerçek net tahsilat: giren ödemeler (yönteme göre) − iadeler. İskonto
 * ayrı bir kalem DEĞİL: iskonto zaten borç tutarını düşürür, hastadan daha az
 * para tahsil edilir — tahsilatta kendiliğinden yansır. Faturalı/faturasız ayrımı
 * da bilinçli olarak kalktı (fatura bir belge bilgisi, para hareketi değil;
 * ödemedeki `belge_turu` yalnız 2026-09-28'den beri dolu, geçmişte boş).
 */
export async function hesaplaGelir(
  supabase: SupabaseSunucuClient,
  klinikId: string,
  donem: RaporDonemi
): Promise<GelirOzeti> {
  const satirlar = await tahsilatSatirlariniGetir(supabase, klinikId, donem.baslangic, donem.bitis);

  const ozet: GelirOzeti = { nakit: 0, krediKarti: 0, bankaHavalesi: 0, belirtilmemis: 0, iade: 0, netTahsilat: 0 };

  for (const s of satirlar) {
    if (s.tur === "iade") {
      ozet.iade += s.tutar;
    } else if (s.odeme_yontemi === "nakit") {
      ozet.nakit += s.tutar;
    } else if (s.odeme_yontemi === "kredi_karti") {
      ozet.krediKarti += s.tutar;
    } else if (s.odeme_yontemi === "banka_havalesi") {
      ozet.bankaHavalesi += s.tutar;
    } else {
      ozet.belirtilmemis += s.tutar;
    }
  }

  ozet.netTahsilat = ozet.nakit + ozet.krediKarti + ozet.bankaHavalesi + ozet.belirtilmemis - ozet.iade;
  return ozet;
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
  const satirlar = await tumSayfalariOku<RandevuDurumSatir & { id: string }>((bas, son) =>
    supabase
      .from("randevu")
      .select("id, durum")
      .eq("klinik_id", klinikId)
      .gte("baslangic", donem.baslangic)
      .lt("baslangic", donem.bitis)
      .order("id")
      .range(bas, son)
      .returns<(RandevuDurumSatir & { id: string })[]>()
  );
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
  const aylar = yilinAylari(yil);

  // Önce Postgres'te gruplanmış 12 satır (rapor_yillik_ozet); RPC yoksa aşağıdaki JS yolu.
  const { data: rpcSatirlari, error: rpcHata } = await supabase.rpc("rapor_yillik_ozet", { p_yil: yil });
  if (!rpcHata && rpcSatirlari) {
    const ayMap = new Map(
      (rpcSatirlari as { ay: number; gelir: number | string; gider: number | string; seans_sayisi: number }[]).map((r) => [r.ay, r])
    );
    return aylar.map((ayDonemi, index) => {
      const r = ayMap.get(index + 1);
      return {
        ay: index + 1,
        ayEtiketi: ayDonemi.etiket,
        gelir: Number(r?.gelir ?? 0),
        gider: Number(r?.gider ?? 0),
        seansSayisi: Number(r?.seans_sayisi ?? 0),
      };
    });
  }
  if (rpcHata && !rpcYokMu(rpcHata)) {
    throw new Error(`Yıllık özet alınamadı: ${rpcHata.message}`);
  }

  const yilDonemi = raporYilDonemi(yil);

  const [harcamaSonuc, kamusalOdemeSonuc, tahsilatlar, randevuSonuc] = await Promise.all([
    tumSayfalariOku<{ id: string; tutar: number; tarih: string }>((bas, son) =>
      supabase
        .from("klinik_harcama")
        .select("id, tutar, tarih")
        .eq("klinik_id", klinikId)
        .gte("tarih", yilDonemi.baslangicTarih)
        .lt("tarih", yilDonemi.bitisTarih)
        .order("id")
        .range(bas, son)
    ),
    tumSayfalariOku<{ id: string; tutar: number; odeme_tarihi: string }>((bas, son) =>
      supabase
        .from("kamusal_odeme")
        .select("id, tutar, odeme_tarihi")
        .eq("klinik_id", klinikId)
        .not("odeme_tarihi", "is", null)
        .gte("odeme_tarihi", yilDonemi.baslangicTarih)
        .lt("odeme_tarihi", yilDonemi.bitisTarih)
        .order("id")
        .range(bas, son)
    ),
    tahsilatSatirlariniGetir(supabase, klinikId, yilDonemi.baslangic, yilDonemi.bitis),
    // Yıllık tamamlanan seans binleri bulur — sayfalı okunmazsa grafik 1000'de kesilir.
    tumSayfalariOku<{ id: string; baslangic: string }>((bas, son) =>
      supabase
        .from("randevu")
        .select("id, baslangic")
        .eq("klinik_id", klinikId)
        .in("durum", ["geldi", "gecikmeli_geldi", "tamamlandi"])
        .gte("baslangic", yilDonemi.baslangic)
        .lt("baslangic", yilDonemi.bitis)
        .order("id")
        .range(bas, son)
    ),
  ]);

  const harcamalar = harcamaSonuc;
  const kamusalOdemeler = kamusalOdemeSonuc;
  const randevular = randevuSonuc;

  return aylar.map((ayDonemi, index) => {
    const gider =
      harcamalar
        .filter((h) => h.tarih >= ayDonemi.baslangicTarih && h.tarih < ayDonemi.bitisTarih)
        .reduce((acc, h) => acc + h.tutar, 0) +
      kamusalOdemeler
        .filter((k) => k.odeme_tarihi >= ayDonemi.baslangicTarih && k.odeme_tarihi < ayDonemi.bitisTarih)
        .reduce((acc, k) => acc + k.tutar, 0);

    // Net tahsilat (giren ödeme − iade) — hesaplaGelir ile aynı kaynak/kural.
    const gelir = tahsilatlar
      .filter((o) => o.created_at >= ayDonemi.baslangic && o.created_at < ayDonemi.bitis)
      .reduce((acc, o) => acc + netTutar(o), 0);

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
  paket_satis_id: string | null;
  hasta_bakiye_hareket: { tur: string; odeme_yontemi: string | null }[] | null;
};

type TahsilatGunlukSatir = TahsilatSatiri & {
  belge_turu: string | null;
  hasta_id: string | null;
  hasta: { ad_soyad: string } | null;
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
 * muhasebe) dökümü. Toplamlar aynı kaynaklardan (hasta_bakiye_hareket
 * ödeme/iade, klinik_harcama, kamusal_odeme) hesaplanır —
 * hesaplaGelir/hesaplaIsletmeGideri/vb. ile TUTARLI kalması için ayrı bir
 * mantık icat edilmedi, aynı tablolar günlere bölünerek yeniden gruplanır.
 * Randevu kalemleri kendi başına bir tutar TAŞIMAZ (yon: "notr") — bilgi
 * amaçlı listelenir, gerçek gelir hasta ödemelerinden gelir (bkz. hesaplaGelir).
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
  const [randevuSonuc, tahsilatlar, harcamaSonuc, kamusalSonuc] = await Promise.all([
    tumSayfalariOku<RandevuGunlukSatir>((bas, son) =>
      supabase
        .from("randevu")
        .select("id, baslangic, durum, hasta_id, hasta(ad_soyad), terapist(personel(ad_soyad)), islem_tanimi(ad), paket_satis_id, hasta_bakiye_hareket(tur, odeme_yontemi)")
        .eq("klinik_id", klinikId)
        .gte("baslangic", donem.baslangic)
        .lt("baslangic", donem.bitis)
        .order("baslangic")
        .order("id")
        .range(bas, son)
        .returns<RandevuGunlukSatir[]>()
    ),
    tahsilatSatirlariniGetir<TahsilatGunlukSatir>(
      supabase,
      klinikId,
      donem.baslangic,
      donem.bitis,
      "id, created_at, tur, tutar, odeme_yontemi, belge_turu, hasta_id, hasta(ad_soyad)"
    ),
    tumSayfalariOku<KlinikHarcamaGunlukSatir>((bas, son) =>
      supabase
        .from("klinik_harcama")
        .select("id, tarih, tutar, kategori, aciklama")
        .eq("klinik_id", klinikId)
        .gte("tarih", donem.baslangicTarih)
        .lt("tarih", donem.bitisTarih)
        .order("tarih")
        .order("id")
        .range(bas, son)
        .returns<KlinikHarcamaGunlukSatir[]>()
    ),
    tumSayfalariOku<KamusalOdemeGunlukSatir>((bas, son) =>
      supabase
        .from("kamusal_odeme")
        .select("id, odeme_tarihi, tutar, odeme_tipi")
        .eq("klinik_id", klinikId)
        .not("odeme_tarihi", "is", null)
        .gte("odeme_tarihi", donem.baslangicTarih)
        .lt("odeme_tarihi", donem.bitisTarih)
        .order("odeme_tarihi")
        .order("id")
        .range(bas, son)
        .returns<KamusalOdemeGunlukSatir[]>()
    ),
  ]);

  // Randevu/gelir kalemlerinin yanında hastanın O GÜNE ait bedelini göstermek
  // için — önceden burada hastanın GÜNCEL toplam cari bakiyesi (v_hasta_cari_ozet)
  // gösteriliyordu, bu sorgu anındaki (o işlem anındaki değil) bir rakamdı ve
  // yanıltıcıydı (kullanıcı kararıyla değiştirildi). Artık yalnız o gün oluşan
  // borç satırlarının (hasta_bakiye_hareket, tur='borc') net toplamı gösteriliyor
  // — paket satışı da borç olarak işlendiği için (bkz. CLAUDE.md) o da dahil.
  const borcSonuc = await tumSayfalariOku<{ id: string; hasta_id: string | null; tutar: number; iskonto_tutari: number; created_at: string }>(
    (bas, son) =>
      supabase
        .from("hasta_bakiye_hareket")
        .select("id, hasta_id, tutar, iskonto_tutari, created_at")
        .eq("klinik_id", klinikId)
        .eq("tur", "borc")
        .gte("created_at", donem.baslangic)
        .lt("created_at", donem.bitis)
        .order("id")
        .range(bas, son)
  );

  const gunlukBedelMap = new Map<string, number>();
  for (const b of borcSonuc) {
    if (!b.hasta_id) continue;
    const anahtar = `${formatDateForInput(b.created_at)}|${b.hasta_id}`;
    const net = b.tutar - b.iskonto_tutari;
    gunlukBedelMap.set(anahtar, (gunlukBedelMap.get(anahtar) ?? 0) + net);
  }
  const gunlukBedel = (tarih: string, hastaId: string | null) =>
    hastaId ? gunlukBedelMap.get(`${tarih}|${hastaId}`) : undefined;

  // Her randevu satırının bedeli NASIL kapandı (Cariye Ekle mi, yoksa Ödeme
  // Ekle ile hangi yöntemle mi tahsil edildi) — randevu_id ile doğrudan
  // bağlı hasta_bakiye_hareket satırlarından (bkz. randevu_seans_bedelini_isle,
  // migration 20260927150000). Tarih filtresi YOK: borç/ödeme randevunun
  // kendi gününden SONRA da işlenmiş olabilir (ör. ertesi gün kapatılan bir
  // seans), o yüzden randevu sorgusuna tarihsiz embed olarak (randevu_id FK)
  // alınıyor — önceden ayrı bir .in("randevu_id", [...]) sorgusuydu; Aylık
  // görünümde yüzlerce id GET URL'sini aşıp etiketleri sessizce düşürüyordu.
  function kapanisSekliEtiketi(r: RandevuGunlukSatir): string | null {
    if (r.paket_satis_id) return "Paketten düşüldü";
    const hareketler = r.hasta_bakiye_hareket ?? [];
    if (hareketler.length === 0) return null;
    const durum = {
      borc: hareketler.some((h) => h.tur === "borc"),
      odemeYontemi: hareketler.findLast((h) => h.tur === "odeme" && h.odeme_yontemi)?.odeme_yontemi ?? null,
    };
    if (durum.odemeYontemi) {
      const yontemEtiketi = YONTEM_ETIKETLERI[durum.odemeYontemi as keyof typeof YONTEM_ETIKETLERI] ?? durum.odemeYontemi;
      return `${yontemEtiketi} ile tahsil edildi`;
    }
    return durum.borc ? "Cariye eklendi (tahsil edilmedi)" : null;
  }

  const gunler = new Map<string, GunlukOzet>();
  function gunuAl(tarih: string): GunlukOzet {
    let gun = gunler.get(tarih);
    if (!gun) {
      gun = { tarih, gelir: 0, gider: 0, seansSayisi: 0, kalemler: [] };
      gunler.set(tarih, gun);
    }
    return gun;
  }

  for (const r of randevuSonuc) {
    const tarih = formatDateForInput(r.baslangic);
    const gun = gunuAl(tarih);
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
      gunlukBedel: gunlukBedel(tarih, r.hasta_id),
      kapanisSekli: kapanisSekliEtiketi(r),
    });
  }

  for (const o of tahsilatlar) {
    const tarih = formatDateForInput(o.created_at);
    const gun = gunuAl(tarih);
    const iade = o.tur === "iade";
    const yontem = o.odeme_yontemi
      ? (YONTEM_ETIKETLERI[o.odeme_yontemi as keyof typeof YONTEM_ETIKETLERI] ?? o.odeme_yontemi)
      : null;
    const belge = o.belge_turu ? (BELGE_TURU_ETIKETLERI[o.belge_turu as keyof typeof BELGE_TURU_ETIKETLERI] ?? null) : null;
    gun.gelir += netTutar(o);
    gun.kalemler.push({
      id: `tahsilat-${o.id}`,
      tur: "gelir",
      saat: formatTime(o.created_at),
      baslik: o.hasta?.ad_soyad ?? "Hasta",
      altBaslik: iade
        ? `${yontem ?? "Yöntem belirtilmemiş"} iadesi`
        : [yontem ?? "Yöntem belirtilmemiş", belge].filter(Boolean).join(" · ") + " tahsilat",
      tutar: o.tutar,
      // İade net gelirden düşer — listede "−" ve kırmızı görünsün (yon: "gider"),
      // ama tur "gelir" kalır: gunun gelir kolonuna netTutar ile zaten yansıdı.
      yon: iade ? "gider" : "gelir",
      gunlukBedel: gunlukBedel(tarih, o.hasta_id),
    });
  }

  for (const h of harcamaSonuc) {
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

  for (const k of kamusalSonuc) {
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

export type DonemOzeti = {
  isletmeGideri: number;
  faturaliGiderler: number;
  muhasebeGideri: number;
  digerGiderler: number;
  gelir: GelirOzeti;
  randevuDurumu: RandevuDurumOzeti;
};

/** RPC henüz canlıya uygulanmamışsa (PostgREST "fonksiyon yok") JS yoluna düşmek için. */
function rpcYokMu(hata: { code?: string } | null): boolean {
  return hata?.code === "PGRST202" || hata?.code === "42883";
}

type DonemOzetiRpc = {
  gelir: { nakit: number; kredi_karti: number; banka_havalesi: number; belirtilmemis: number; iade: number };
  isletme_gideri: number;
  diger_giderler: number;
  faturali_giderler: number;
  muhasebe_gideri: number;
  randevu: { tamamlanan: number; planlanan: number; ertelenen: number; iptal_ve_gelmedi: number; toplam: number };
};

/**
 * Dönemin tüm toplamları (gelir kırılımı, 4 gider kalemi, randevu durumları) TEK
 * Postgres çağrısıyla (`rapor_donem_ozeti`, migration 20261005140000) — satırlar
 * istemciye hiç taşınmaz, veri büyüdükçe sayfa yavaşlamaz. RPC yoksa (migration
 * uygulanmadan deploy) aynı kurallı JS hesaplarına düşer; diğer hatalarda fırlatır.
 */
export async function hesaplaDonemOzeti(
  supabase: SupabaseSunucuClient,
  klinikId: string,
  donem: RaporDonemi
): Promise<DonemOzeti> {
  const { data, error } = await supabase.rpc("rapor_donem_ozeti", {
    p_baslangic: donem.baslangic,
    p_bitis: donem.bitis,
    p_baslangic_tarih: donem.baslangicTarih,
    p_bitis_tarih: donem.bitisTarih,
  });

  if (!error && data) {
    const r = data as DonemOzetiRpc;
    const n = (x: number | string | null | undefined) => Number(x ?? 0);
    const gelir: GelirOzeti = {
      nakit: n(r.gelir.nakit),
      krediKarti: n(r.gelir.kredi_karti),
      bankaHavalesi: n(r.gelir.banka_havalesi),
      belirtilmemis: n(r.gelir.belirtilmemis),
      iade: n(r.gelir.iade),
      netTahsilat: 0,
    };
    gelir.netTahsilat = gelir.nakit + gelir.krediKarti + gelir.bankaHavalesi + gelir.belirtilmemis - gelir.iade;
    return {
      isletmeGideri: n(r.isletme_gideri),
      faturaliGiderler: n(r.faturali_giderler),
      muhasebeGideri: n(r.muhasebe_gideri),
      digerGiderler: n(r.diger_giderler),
      gelir,
      randevuDurumu: {
        tamamlanan: n(r.randevu.tamamlanan),
        planlanan: n(r.randevu.planlanan),
        ertelenen: n(r.randevu.ertelenen),
        iptalVeGelmedi: n(r.randevu.iptal_ve_gelmedi),
        toplam: n(r.randevu.toplam),
      },
    };
  }

  if (error && !rpcYokMu(error)) {
    throw new Error(`Rapor özeti alınamadı: ${error.message}`);
  }

  const [isletmeGideri, faturaliGiderler, muhasebeGideri, digerGiderler, gelir, randevuDurumu] = await Promise.all([
    hesaplaIsletmeGideri(supabase, klinikId, donem),
    hesaplaFaturaliGiderler(supabase, klinikId, donem),
    hesaplaMuhasebeGideri(supabase, klinikId, donem),
    hesaplaDigerGiderler(supabase, klinikId, donem),
    hesaplaGelir(supabase, klinikId, donem),
    hesaplaRandevuDurumOzeti(supabase, klinikId, donem),
  ]);
  return { isletmeGideri, faturaliGiderler, muhasebeGideri, digerGiderler, gelir, randevuDurumu };
}
