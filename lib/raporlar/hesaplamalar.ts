import type { createClient } from "@/lib/supabase/server";
import { maasHesapla } from "@/lib/maas";
import type { MaasHesaplamaModeli } from "@/types/personel";
import type { GelirOzeti, SabitPersonelMaliyeti, TerapistPrimSatiri, YillikAy } from "@/types/raporlar";
import type { RaporDonemi } from "@/lib/raporlar/donem";
import { raporYilDonemi, yilinAylari } from "@/lib/raporlar/donem";

type SupabaseSunucuClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Sabit personel maliyeti: tüm aktif personelin maaşı + o dönemdeki ekstra
 * hakedişleri (yol/yemek/mesai/diğer), terapistler için lib/maas.ts'teki
 * aynı prim/baraj mantığıyla hesaplanan hakediş dahil. SGK işveren payı
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
    return { toplamMaas: 0, terapistPrimleri: [] };
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
    supabase
      .from("personel_ekstra_hakedis")
      .select("personel_id, tutar")
      .eq("klinik_id", klinikId)
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
        .eq("durum", "geldi")
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

  let toplamMaas = 0;
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
      toplamMaas += hesap.toplam;
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
      toplamMaas += (personel.maas ?? 0) + ekstraToplam;
    }
  }

  return { toplamMaas, terapistPrimleri };
}

type KlinikHarcamaSatir = { tutar: number };

/**
 * İşletme gideri: kira/fatura/malzeme/diğer kategorisindeki, faturasız
 * (is_faturali=false) klinik_harcama kayıtları. Aynı tutarın hem burada hem
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
    .neq("kategori", "vergi_sgk")
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
    .neq("kategori", "vergi_sgk")
    .eq("is_faturali", true)
    .gte("tarih", donem.baslangicTarih)
    .lt("tarih", donem.bitisTarih)
    .returns<KlinikHarcamaSatir[]>();
  return (data ?? []).reduce((acc, satir) => acc + satir.tutar, 0);
}

/**
 * Muhasebe (vergi/SGK) gideri: kategori='vergi_sgk' olan klinik_harcama
 * kayıtları — personel SGK işveren payı da (kullanıcı kararıyla) burada
 * elle girilir, personel şemasında ayrı bir SGK kolonu yok.
 */
export async function hesaplaMuhasebeGideri(
  supabase: SupabaseSunucuClient,
  klinikId: string,
  donem: RaporDonemi
): Promise<number> {
  const { data } = await supabase
    .from("klinik_harcama")
    .select("tutar")
    .eq("klinik_id", klinikId)
    .eq("kategori", "vergi_sgk")
    .gte("tarih", donem.baslangicTarih)
    .lt("tarih", donem.bitisTarih)
    .returns<KlinikHarcamaSatir[]>();
  return (data ?? []).reduce((acc, satir) => acc + satir.tutar, 0);
}

type OdemeGelirSatiri = {
  iskonto_tutari: number;
  odeme_kalemi: { miktar: number; birim_fiyat: number; kdv_orani: number }[];
};

/**
 * Gelir: odeme_kalemi'nin o anki fiyat/KDV snapshot'ından (birim_fiyat,
 * kdv_orani) hesaplanır — proje henüz islem_tanimi_fiyat_gecmisi tablosunu
 * hiç oluşturmadı, snapshot doğrudan odeme_kalemi'nde tutuluyor (bkz.
 * odeme_olustur RPC'si). birim_fiyat KDV DAHİL (brüt) fiyat kabul edilir.
 * İskonto KDV oranlarına göre dağıtılmadan tek kalemde (iskontoToplam)
 * ayrıca raporlanır; faturalı ödemelerin `fatura` tablosundaki karşılığı
 * burada tekrar sayılmaz (ayrı bir gelir/gider kalemi değil, aynı gelirin
 * belgesi).
 */
export async function hesaplaGelir(
  supabase: SupabaseSunucuClient,
  klinikId: string,
  donem: RaporDonemi
): Promise<GelirOzeti> {
  const { data } = await supabase
    .from("odeme")
    .select("iskonto_tutari, odeme_kalemi(miktar, birim_fiyat, kdv_orani)")
    .eq("klinik_id", klinikId)
    .gte("created_at", donem.baslangic)
    .lt("created_at", donem.bitis)
    .returns<OdemeGelirSatiri[]>();

  let kdvli = 0;
  let kdvsiz = 0;
  let iskontoToplam = 0;

  for (const odeme of data ?? []) {
    iskontoToplam += odeme.iskonto_tutari;
    for (const kalem of odeme.odeme_kalemi) {
      const brut = kalem.miktar * kalem.birim_fiyat;
      kdvli += brut;
      kdvsiz += brut / (1 + kalem.kdv_orani / 100);
    }
  }

  return {
    kdvli,
    kdvsiz,
    kdvTutari: kdvli - kdvsiz,
    iskontoToplam,
    netTahsilat: kdvli - iskontoToplam,
  };
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

  const [harcamaSonuc, odemeSonuc, randevuSonuc] = await Promise.all([
    supabase
      .from("klinik_harcama")
      .select("tutar, tarih")
      .eq("klinik_id", klinikId)
      .gte("tarih", yilDonemi.baslangicTarih)
      .lt("tarih", yilDonemi.bitisTarih)
      .returns<{ tutar: number; tarih: string }[]>(),
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
      .eq("durum", "geldi")
      .gte("baslangic", yilDonemi.baslangic)
      .lt("baslangic", yilDonemi.bitis)
      .returns<{ baslangic: string }[]>(),
  ]);

  const harcamalar = harcamaSonuc.data ?? [];
  const odemeler = odemeSonuc.data ?? [];
  const randevular = randevuSonuc.data ?? [];

  return aylar.map((ayDonemi, index) => {
    const gider = harcamalar
      .filter((h) => h.tarih >= ayDonemi.baslangicTarih && h.tarih < ayDonemi.bitisTarih)
      .reduce((acc, h) => acc + h.tutar, 0);

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
