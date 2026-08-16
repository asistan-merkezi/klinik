import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { ayAraligi } from "@/lib/utils";
import { ayinGunleri } from "@/lib/puantaj";
import { hakedisHesapla, hakedisKapaliDonemToplami } from "@/lib/personel/hakedis";
import { puantajSatirToplamiHesapla } from "@/lib/personel/puantaj-cetveli";
import type { PersonelPuantajSatir } from "@/types/puantaj";
import { PuantajCetveliIstemci, type PuantajCetveliSatir } from "./puantaj-cetveli-istemci";

const PUANTAJ_KOLONLARI =
  "id, personel_id, tarih, planlanan_baslangic, planlanan_bitis, giris_saat, cikis_saat, mola_dakika, net_calisma_dakika, sapma_dakika, fazla_mesai_dakika, eksik_calisma_dakika, fm_onay_durumu, durum, kaynak, not_metni";

export default async function PuantajCetveliSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ ay?: string }>;
}) {
  const { ay: ayParam } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("klinik_id, rol").eq("id", user.id).single();
  if (!kullanici?.klinik_id) {
    redirect("/giris");
  }
  const yonetici = kullanici.rol === "klinik_admin";

  const ay = ayAraligi(ayParam);
  const [yilStr, ayStr] = ay.param.split("-");
  const yil = Number(yilStr);
  const ayNum = Number(ayStr);
  const gunler = ayinGunleri(yil, ayNum);

  const [
    { data: klinik },
    { data: personelSonucu },
    { data: puantajSonucu },
    { data: donemSonucu },
    { data: resmiTatilSonucu },
    { data: hesapHareketSonucu },
  ] = await Promise.all([
    supabase.from("klinik").select("cumartesi_baslangic, pazar_baslangic").eq("id", kullanici.klinik_id).single(),
    supabase
      .from("personel")
      .select("id, ad_soyad, maas, fm_saatlik_ucret, pozisyon:pozisyon_id(ad, puantaj_modu)")
      .eq("aktif", true)
      .order("ad_soyad"),
    supabase
      .from("personel_puantaj")
      .select(PUANTAJ_KOLONLARI)
      .gte("tarih", ay.baslangicTarih)
      .lt("tarih", ay.bitisTarih)
      .returns<(PersonelPuantajSatir & { personel_id: string })[]>(),
    supabase.from("personel_puantaj_donem").select("personel_id, durum").eq("yil", yil).eq("ay", ayNum),
    supabase.from("resmi_tatil").select("tarih").gte("tarih", ay.baslangicTarih).lt("tarih", ay.bitisTarih),
    supabase
      .from("personel_hesap_hareket")
      .select("personel_id, tur, tutar")
      .in("tur", ["hakedis", "prim", "mesai"])
      .gte("tarih", ay.baslangicTarih)
      .lt("tarih", ay.bitisTarih),
  ]);

  const gunlukPersonel = (personelSonucu ?? []).filter(
    (p) => (p.pozisyon as { puantaj_modu?: string } | null)?.puantaj_modu !== "takipsiz"
  );

  const terapistIdleri = gunlukPersonel.map((p) => p.id);
  const { data: terapistSonucu } = await supabase
    .from("terapist")
    .select("id, personel_id, maas_hesaplama_modeli, prim_sabit_tutar, baraj_seans_sayisi, baraj_bonus_tutari")
    .in("personel_id", terapistIdleri.length > 0 ? terapistIdleri : ["00000000-0000-0000-0000-000000000000"]);

  const terapistMap = new Map((terapistSonucu ?? []).map((t) => [t.personel_id, t]));
  const donemMap = new Map((donemSonucu ?? []).map((d) => [d.personel_id, d.durum]));
  const resmiTatilSet = new Set((resmiTatilSonucu ?? []).map((r) => r.tarih as string));

  const puantajByPersonel = new Map<string, Map<string, PersonelPuantajSatir>>();
  for (const p of puantajSonucu ?? []) {
    const m = puantajByPersonel.get(p.personel_id) ?? new Map();
    m.set(p.tarih, p);
    puantajByPersonel.set(p.personel_id, m);
  }

  const hareketByPersonel = new Map<string, { tur: string; tutar: number }[]>();
  for (const h of hesapHareketSonucu ?? []) {
    const liste = hareketByPersonel.get(h.personel_id) ?? [];
    liste.push({ tur: h.tur, tutar: h.tutar });
    hareketByPersonel.set(h.personel_id, liste);
  }

  // Terapist olan personel için bu ayki tamamlanan seans sayısı (hakediş
  // tahmini için) — dönem kapalıysa zaten ledger'dan okunacağı için hesaba
  // gerek yok, sadece açık dönemler için sorgulanıyor.
  const seansSayisiMap = new Map<string, number>();
  await Promise.all(
    gunlukPersonel.map(async (p) => {
      const terapist = terapistMap.get(p.id);
      const donemKapali = donemMap.get(p.id) === "kapali";
      if (!terapist || donemKapali) return;
      const { count } = await supabase
        .from("randevu")
        .select("id", { count: "exact", head: true })
        .eq("terapist_id", terapist.id)
        .in("durum", ["geldi", "gecikmeli_geldi", "tamamlandi"])
        .gte("baslangic", new Date(Date.UTC(yil, ayNum - 1, 1)).toISOString())
        .lt("baslangic", new Date(Date.UTC(yil, ayNum, 1)).toISOString());
      seansSayisiMap.set(p.id, count ?? 0);
    })
  );

  const satirlar: PuantajCetveliSatir[] = gunlukPersonel.map((p) => {
    const kayitlarMap = puantajByPersonel.get(p.id) ?? new Map();
    const kayitlarByTarih: Record<string, PersonelPuantajSatir> = {};
    for (const [tarih, kayit] of kayitlarMap) kayitlarByTarih[tarih] = kayit;

    const toplam = puantajSatirToplamiHesapla([...kayitlarMap.values()]);
    const donemKapali = donemMap.get(p.id) === "kapali";
    const terapist = terapistMap.get(p.id);

    const hakedis = donemKapali
      ? hakedisKapaliDonemToplami(hareketByPersonel.get(p.id) ?? [])
      : hakedisHesapla({
          personelMaasi: p.maas,
          fmSaatlikUcret: p.fm_saatlik_ucret,
          terapistAyarlari: terapist
            ? {
                maas_hesaplama_modeli: terapist.maas_hesaplama_modeli,
                prim_sabit_tutar: terapist.prim_sabit_tutar,
                baraj_seans_sayisi: terapist.baraj_seans_sayisi,
                baraj_bonus_tutari: terapist.baraj_bonus_tutari,
              }
            : null,
          tamamlananSeansSayisi: seansSayisiMap.get(p.id) ?? 0,
          onayliFmSaat: toplam.onayliFmSaat,
        });

    return {
      personelId: p.id,
      adSoyad: p.ad_soyad,
      pozisyonAdi: (p.pozisyon as { ad?: string } | null)?.ad ?? "—",
      kayitlarByTarih,
      toplam,
      hakedis,
      donemKapali,
    };
  });

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/panel/personel?tab=puantaj">‹ Puantaj</Link>} />
        </div>

        <header>
          <h1 className="text-xl font-semibold">Puantaj Cetveli</h1>
          <p className="text-sm text-muted-foreground">{ay.etiket} — tüm personelin aylık devam/izin durumu.</p>
        </header>

        <PuantajCetveliIstemci
          ay={ay}
          yil={yil}
          ayNum={ayNum}
          gunler={gunler}
          satirlar={satirlar}
          resmiTatilListesi={[...resmiTatilSet]}
          cumartesiAcikMi={klinik?.cumartesi_baslangic != null}
          pazarAcikMi={klinik?.pazar_baslangic != null}
          yonetici={yonetici}
        />
      </div>
    </div>
  );
}
