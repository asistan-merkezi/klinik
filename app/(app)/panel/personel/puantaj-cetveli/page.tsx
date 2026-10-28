import Link from "next/link";
import { CalendarCheck2, CalendarClock, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { and, asc, count, eq, gte, inArray, lt } from "drizzle-orm";
import { sema, withTenant } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { tl } from "@/lib/para";
import { ayAraligi } from "@/lib/utils";
import { ayinGunleri } from "@/lib/puantaj";
import { hakedisHesapla, hakedisKapaliDonemToplami } from "@/lib/personel/hakedis";
import { puantajSatirToplamiHesapla } from "@/lib/personel/puantaj-cetveli";
import { seansSayilariniGetirTx } from "@/lib/personel/seans-sayisi";
import type { TatilUyarisi } from "@/lib/tatil/durum";
import { tatilUyarilariniGetir } from "@/lib/tatil/uyari-oturum";
import { donemMaasi, maasGecmisiGetirTx } from "@/lib/personel/donem-maasi";
import type { MaasHesaplamaModeli } from "@/types/personel";
import type { PersonelPuantajSatir } from "@/types/puantaj";
import { PuantajCetveliIstemci, type PuantajCetveliSatir } from "./puantaj-cetveli-istemci";

export default async function PuantajCetveliSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ ay?: string }>;
}) {
  const { ay: ayParam } = await searchParams;
  const { ctx, bag } = await panelBaglami();
  const yonetici = ctx.rol === "klinik_admin";

  let bekleyenIzinSayisi = 0;
  let tatilUyarilari: TatilUyarisi[] = [];
  if (yonetici) {
    const [sayim, uyarilar] = await Promise.all([
      withTenant(bag, (tx) => tx.select({ n: count() }).from(sema.personelIzinTalebi).where(eq(sema.personelIzinTalebi.durum, "beklemede"))),
      // Bayram tarihi onaylanmamışsa o günler izin/puantajda iş günü sayılır — yöneticiye hatırlat.
      tatilUyarilariniGetir().catch(() => []),
    ]);
    bekleyenIzinSayisi = sayim[0]?.n ?? 0;
    tatilUyarilari = uyarilar;
  }

  const ay = ayAraligi(ayParam);
  const [yilStr, ayStr] = ay.param.split("-");
  const yil = Number(yilStr);
  const ayNum = Number(ayStr);
  const gunler = ayinGunleri(yil, ayNum);

  const P = sema.personelPuantaj;
  const v = await withTenant(bag, async (tx) => {
    const klinik = (await tx.select({ cumartesi: sema.klinik.cumartesiBaslangic, pazar: sema.klinik.pazarBaslangic }).from(sema.klinik).where(eq(sema.klinik.id, bag.tenantId)).limit(1))[0];
    const personel = await tx
      .select({
        id: sema.personel.id, ad_soyad: sema.personel.adSoyad, aktif: sema.personel.aktif, maas: sema.personel.maas, fm_saatlik_ucret: sema.personel.fmSaatlikUcret,
        ise_giris_tarihi: sema.personel.iseGirisTarihi, isten_cikis_tarihi: sema.personel.istenCikisTarihi, poz_ad: sema.pozisyonlar.ad, puantaj_modu: sema.pozisyonlar.puantajModu,
      })
      .from(sema.personel)
      .leftJoin(sema.pozisyonlar, eq(sema.pozisyonlar.id, sema.personel.pozisyonId))
      .orderBy(asc(sema.personel.adSoyad));
    const puantaj = await tx
      .select({
        id: P.id, personel_id: P.personelId, tarih: P.tarih, planlanan_baslangic: P.planlananBaslangic, planlanan_bitis: P.planlananBitis, giris_saat: P.girisSaat, cikis_saat: P.cikisSaat,
        mola_dakika: P.molaDakika, net_calisma_dakika: P.netCalismaDakika, sapma_dakika: P.sapmaDakika, fazla_mesai_dakika: P.fazlaMesaiDakika, eksik_calisma_dakika: P.eksikCalismaDakika,
        fm_onay_durumu: P.fmOnayDurumu, durum: P.durum, kaynak: P.kaynak, not_metni: P.notMetni,
      })
      .from(P)
      .where(and(gte(P.tarih, ay.baslangicTarih), lt(P.tarih, ay.bitisTarih)))
      .orderBy(asc(P.tarih), asc(P.id));
    const donem = await tx.select({ personel_id: sema.personelPuantajDonem.personelId, durum: sema.personelPuantajDonem.durum }).from(sema.personelPuantajDonem).where(and(eq(sema.personelPuantajDonem.yil, yil), eq(sema.personelPuantajDonem.ay, ayNum)));
    const resmi = await tx.select({ tarih: sema.resmiTatil.tarih }).from(sema.resmiTatil).where(and(gte(sema.resmiTatil.tarih, ay.baslangicTarih), lt(sema.resmiTatil.tarih, ay.bitisTarih)));
    const hareket = await tx
      .select({ personel_id: sema.personelHesapHareket.personelId, tur: sema.personelHesapHareket.tur, tutar: sema.personelHesapHareket.tutar })
      .from(sema.personelHesapHareket)
      .where(and(inArray(sema.personelHesapHareket.tur, ["hakedis", "prim", "mesai"]), gte(sema.personelHesapHareket.tarih, ay.baslangicTarih), lt(sema.personelHesapHareket.tarih, ay.bitisTarih)));
    return { klinik, personel, puantaj, donem, resmi, hareket };
  });
  const klinik = v.klinik ? { cumartesi_baslangic: v.klinik.cumartesi, pazar_baslangic: v.klinik.pazar } : null;
  const puantajSonucu = v.puantaj as unknown as (PersonelPuantajSatir & { personel_id: string })[];
  const personelSonucu = v.personel.map((p) => ({ ...p, maas: p.maas === null ? null : Number(p.maas), fm_saatlik_ucret: p.fm_saatlik_ucret === null ? null : Number(p.fm_saatlik_ucret) }));
  const donemSonucu = v.donem;
  const resmiTatilSonucu = v.resmi;
  const hesapHareketSonucu = v.hareket.map((h) => ({ ...h, tutar: tl(h.tutar) }));

  // Pasife alınmış personel de, görüntülenen ayda gerçekten çalıştığına dair iz varsa listelenir: o ay içinde
  // çıkış tarihi olan ya da o ay puantaj kaydı bulunan. Bugünün (içinde bulunulan ayın) pasif ve izsiz personeli yine gizli.
  const puantajliPersonel = new Set(puantajSonucu.map((r) => r.personel_id));
  const gunlukPersonel = personelSonucu.filter(
    (p) =>
      (p.aktif || !!p.isten_cikis_tarihi || puantajliPersonel.has(p.id)) &&
      p.puantaj_modu !== "takipsiz" &&
      (!p.ise_giris_tarihi || p.ise_giris_tarihi < ay.bitisTarih) &&
      // İşten çıkış tarihi bu ayın BAŞLANGICINDAN önceyse (tamamen geçmiş bir ay) satır hiç gösterilmiyor — çıkış tarihi bu ayın
      // İÇİNDEYSE hâlâ görünür, o ayın dönemi kapatılabilsin.
      (!p.isten_cikis_tarihi || p.isten_cikis_tarihi >= ay.baslangicTarih)
  );

  const terapistIdleri = gunlukPersonel.map((p) => p.id);
  const terapistSonucu = terapistIdleri.length === 0
    ? []
    : await withTenant(bag, (tx) =>
        tx
          .select({ id: sema.terapist.id, personel_id: sema.terapist.personelId, maas_hesaplama_modeli: sema.terapist.maasHesaplamaModeli, prim_sabit_tutar: sema.terapist.primSabitTutar, baraj_seans_sayisi: sema.terapist.barajSeansSayisi, baraj_bonus_tutari: sema.terapist.barajBonusTutari })
          .from(sema.terapist)
          .where(inArray(sema.terapist.personelId, terapistIdleri))
      );

  const terapistMap = new Map(terapistSonucu.map((t) => [t.personel_id, { ...t, maas_hesaplama_modeli: t.maas_hesaplama_modeli as MaasHesaplamaModeli, prim_sabit_tutar: t.prim_sabit_tutar === null ? null : Number(t.prim_sabit_tutar), baraj_bonus_tutari: t.baraj_bonus_tutari === null ? null : Number(t.baraj_bonus_tutari) }]));
  const donemMap = new Map(donemSonucu.map((d) => [d.personel_id, d.durum]));
  const resmiTatilSet = new Set(resmiTatilSonucu.map((r) => r.tarih as string));

  const puantajByPersonel = new Map<string, Map<string, PersonelPuantajSatir>>();
  for (const p of puantajSonucu) {
    const m = puantajByPersonel.get(p.personel_id) ?? new Map();
    m.set(p.tarih, p);
    puantajByPersonel.set(p.personel_id, m);
  }

  const hareketByPersonel = new Map<string, { tur: string; tutar: number }[]>();
  for (const h of hesapHareketSonucu) {
    const liste = hareketByPersonel.get(h.personel_id) ?? [];
    liste.push({ tur: h.tur, tutar: h.tutar });
    hareketByPersonel.set(h.personel_id, liste);
  }

  // Terapist olan personel için bu ayki prime sayılan seans sayısı (hakediş tahmini) — kapalı dönem zaten ledger'dan okunur.
  // Sayım kuralı dönem kapatma ve cron ile ORTAK (lib/personel/seans-sayisi.ts). Açık dönem tahmini o ayın maaşıyla (geçmiş okunamazsa personel.maas).
  const { seansSayisiMap, maasGecmisi } = await withTenant(bag, async (tx) => {
    const sayim = await seansSayilariniGetirTx(
      tx,
      gunlukPersonel
        .filter((p) => donemMap.get(p.id) !== "kapali" && terapistMap.has(p.id))
        .map((p) => ({ terapistId: terapistMap.get(p.id)!.id, personelId: p.id, istenCikisTarihi: p.isten_cikis_tarihi })),
      ay.param
    );
    let gecmis = new Map<string, Awaited<ReturnType<typeof maasGecmisiGetirTx>> extends Map<string, infer V> ? V : never>();
    try {
      gecmis = await maasGecmisiGetirTx(tx, gunlukPersonel.map((p) => p.id));
    } catch (hata) {
      console.error("Puantaj Cetveli: maaş geçmişi okunamadı:", hata);
    }
    return { seansSayisiMap: sayim, maasGecmisi: gecmis };
  });

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
          personelMaasi: donemMaasi(maasGecmisi.get(p.id), p.maas, ay.bitisTarih),
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
          ayBaslangicTarih: ay.baslangicTarih,
          ayBitisTarihExclusive: ay.bitisTarih,
          iseGirisTarihi: p.ise_giris_tarihi,
          istenCikisTarihi: p.isten_cikis_tarihi,
        });

    return {
      personelId: p.id,
      adSoyad: p.ad_soyad,
      pozisyonAdi: p.poz_ad ?? "—",
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
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/panel/personel">‹ Personel</Link>} />
        </div>

        <PageHeader
          title="Puantaj Cetveli"
          description={`${ay.etiket} — tüm personelin aylık devam/izin durumu.`}
          icon={Table2}
          actions={
            <>
              <Button
                nativeButton={false}
                render={
                  <Link href="/panel/personel/izinlerim">
                    <CalendarClock /> İzin Talebi
                  </Link>
                }
              />

              {yonetici && (
                <Button
                  nativeButton={false}
                  className="bg-emerald-500 text-white hover:bg-emerald-600 dark:hover:bg-emerald-600"
                  render={
                    <Link href="/panel/personel/izinler">
                      <CalendarCheck2 /> İzin / Rapor Takibini Aç
                      {bekleyenIzinSayisi > 0 ? ` (${bekleyenIzinSayisi})` : ""}
                    </Link>
                  }
                />
              )}
            </>
          }
        />

        {tatilUyarilari.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 text-sm">
            <p>
              <span className="font-semibold">Resmi tatil hatırlatması:</span>{" "}
              {tatilUyarilari
                .map((u) => `${u.ad} ${u.yil} (${u.durum === "bekliyor" ? "onay bekliyor" : "tarih girilmemiş"})`)
                .join(", ")}
              . Onaylanana kadar bu günler izin ve puantajda iş günü sayılır.
            </p>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href="/panel/ayarlar/resmi-tatiller">Resmi Tatillere Git</Link>}
            />
          </div>
        )}

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
