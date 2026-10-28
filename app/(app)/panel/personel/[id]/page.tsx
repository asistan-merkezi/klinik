import { notFound } from "next/navigation";
import Link from "next/link";
import { User, CreditCard, CalendarClock } from "lucide-react";
import { and, asc, count, desc, eq, gte, inArray, lt, or } from "drizzle-orm";
import { rpc, sema, withTenant } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { tl, tlTopla } from "@/lib/para";
import { bankaHesaplariniGetir } from "@/lib/finans/okuma";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ModuleCard } from "@/components/panel/module-card";
import {
  CALISMA_TIPI_SECENEKLERI,
  ROL_SECENEKLERI,
  type CalismaTipi,
  type MaasGecmisiSatir,
  type PersonelAcilKisi,
  type PersonelDetay,
  type PersonelEgitim,
  type PersonelHassasMaskeli,
  type PersonelMeslekiBelge,
  type TerapistAyarlari,
} from "@/types/personel";
import { HESAP_HAREKET_TUR_ETIKETLERI, HESAP_HAREKET_YONU, type HesapBakiye, type HesapHareket } from "@/types/hesap-hareket";
import type { Pozisyon } from "@/types/pozisyon";
import { ayAraligi, gunAraligi, haftaAraligi, telefonGoster } from "@/lib/utils";
import { maasHesapla } from "@/lib/maas";
import { bugunTarih, dakikaSaate, saatEtiket } from "@/lib/puantaj";
import { MaasFormu } from "./maas-formu";
import { OdemeEkleButonu } from "./odeme-ekle-butonu";
import { DuzenlePersonelDialog } from "./duzenle-personel-dialog";

type Sekme = "kisisel" | "odemeler" | undefined;

export default async function PersonelDetaySayfasi({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ay?: string; tab?: string; odemeEkle?: string }>;
}) {
  const { id } = await params;
  const { ay: ayParam, tab, odemeEkle } = await searchParams;
  const sekme: Sekme = tab === "kisisel" || tab === "odemeler" ? tab : undefined;
  const { ctx, bag } = await panelBaglami();
  if (!z.string().uuid().safeParse(id).success) {
    notFound();
  }

  const gun = gunAraligi();
  const hafta = haftaAraligi();
  const ay = ayAraligi(ayParam);
  const ayCari = ayAraligi();
  const [ayYilStr, ayAyStr] = ayCari.param.split("-");

  const yonetici = ctx.rol === "klinik_admin";
  const rol = ctx.rol;

  const v = await withTenant(bag, async (tx) => {
    const personelSatiri = (
      await tx
        .select({
          id: sema.personel.id, ad_soyad: sema.personel.adSoyad, gorev: sema.personel.gorev, pozisyon_id: sema.personel.pozisyonId, maas: sema.personel.maas,
          fm_saatlik_ucret: sema.personel.fmSaatlikUcret, aktif: sema.personel.aktif, kullanici_id: sema.personel.kullaniciId, il: sema.personel.il, ilce: sema.personel.ilce,
          mahalle: sema.personel.mahalle, adres: sema.personel.adres, dogum_tarihi: sema.personel.dogumTarihi, dogum_yeri: sema.personel.dogumYeri, cinsiyet: sema.personel.cinsiyet,
          eposta: sema.personel.eposta, departman: sema.personel.departman, calisma_tipi: sema.personel.calismaTipi, sgk_sicil_no: sema.personel.sgkSicilNo,
          ise_giris_tarihi: sema.personel.iseGirisTarihi, isten_cikis_tarihi: sema.personel.istenCikisTarihi, ise_baslama_notu: sema.personel.iseBaslamaNotu,
          imza_yetkilisi_mi: sema.personel.imzaYetkilisiMi, k_telefon: sema.kullanici.telefon, k_rol: sema.kullanici.rol,
        })
        .from(sema.personel)
        .leftJoin(sema.kullanici, eq(sema.kullanici.id, sema.personel.kullaniciId))
        .where(eq(sema.personel.id, id))
        .limit(1)
    )[0];
    if (!personelSatiri) return null;

    const terapistSatiri = (
      await tx
        .select({ id: sema.terapist.id, maas_hesaplama_modeli: sema.terapist.maasHesaplamaModeli, prim_sabit_tutar: sema.terapist.primSabitTutar, baraj_seans_sayisi: sema.terapist.barajSeansSayisi, baraj_bonus_tutari: sema.terapist.barajBonusTutari })
        .from(sema.terapist)
        .where(eq(sema.terapist.personelId, id))
        .limit(1)
    )[0];

    const H = sema.personelHesapHareket;
    const P = sema.personelPuantaj;
    const randevuSayisi = async (bas: string, bit: string) =>
      terapistSatiri
        ? (
            await tx
              .select({ n: count() })
              .from(sema.randevu)
              .where(and(eq(sema.randevu.terapistId, terapistSatiri.id), inArray(sema.randevu.durum, ["geldi", "gecikmeli_geldi", "tamamlandi"]), gte(sema.randevu.baslangic, bas), lt(sema.randevu.baslangic, bit)))
          )[0].n
        : 0;

    return {
      personel: personelSatiri,
      terapist: terapistSatiri,
      hareketler: await tx
        .select({ id: H.id, personel_id: H.personelId, tur: H.tur, tutar: H.tutar, tarih: H.tarih, aciklama: H.aciklama, kaynak_id: H.kaynakId, created_at: H.createdAt, odeme_tipi: H.odemeTipi, banka_hesap_id: H.bankaHesapId })
        .from(H)
        .where(and(eq(H.personelId, id), gte(H.tarih, ay.baslangicTarih), lt(H.tarih, ay.bitisTarih)))
        .orderBy(desc(H.tarih), desc(H.createdAt)),
      bakiye: (await tx.select().from(sema.vPersonelHesapBakiye).where(eq(sema.vPersonelHesapBakiye.personelId, id)).limit(1))[0] ?? null,
      donem: (
        await tx
          .select({ durum: sema.personelPuantajDonem.durum, net: sema.personelPuantajDonem.snapshotNetSaat, fm: sema.personelPuantajDonem.snapshotOnayliFmSaat })
          .from(sema.personelPuantajDonem)
          .where(and(eq(sema.personelPuantajDonem.personelId, id), eq(sema.personelPuantajDonem.yil, Number(ayYilStr)), eq(sema.personelPuantajDonem.ay, Number(ayAyStr))))
          .limit(1)
      )[0] ?? null,
      puantajAy: await tx
        .select({ net_calisma_dakika: P.netCalismaDakika, fazla_mesai_dakika: P.fazlaMesaiDakika, fm_onay_durumu: P.fmOnayDurumu })
        .from(P)
        .where(and(eq(P.personelId, id), gte(P.tarih, ayCari.baslangicTarih), lt(P.tarih, ayCari.bitisTarih))),
      bugun: (await tx.select({ giris_saat: P.girisSaat, durum: P.durum }).from(P).where(and(eq(P.personelId, id), eq(P.tarih, bugunTarih()))).limit(1))[0] ?? null,
      bankaHesaplari: await bankaHesaplariniGetir(tx),
      acil: yonetici ? ((await tx.select({ id: sema.personelAcilKisi.id, ad_soyad: sema.personelAcilKisi.adSoyad, yakinlik: sema.personelAcilKisi.yakinlik, telefon: sema.personelAcilKisi.telefon }).from(sema.personelAcilKisi).where(eq(sema.personelAcilKisi.personelId, id)).limit(1))[0] ?? null) : null,
      mesleki: yonetici
        ? ((
            await tx
              .select({
                diploma_no: sema.personelMeslekiBelge.diplomaNo, uzmanlik_belge_no: sema.personelMeslekiBelge.uzmanlikBelgeNo, meslek_odasi_sicil_no: sema.personelMeslekiBelge.meslekOdasiSicilNo,
                saglik_bakanligi_tescil_no: sema.personelMeslekiBelge.saglikBakanligiTescilNo, e_imza_sertifika_seri_no: sema.personelMeslekiBelge.eImzaSertifikaSeriNo,
                e_imza_gecerlilik_tarihi: sema.personelMeslekiBelge.eImzaGecerlilikTarihi, kase_gorsel_url: sema.personelMeslekiBelge.kaseGorselUrl,
                mali_sorumluluk_sigorta_police_no: sema.personelMeslekiBelge.maliSorumlulukSigortaPoliceNo, mali_sorumluluk_sigorta_bitis_tarihi: sema.personelMeslekiBelge.maliSorumlulukSigortaBitisTarihi,
              })
              .from(sema.personelMeslekiBelge)
              .where(eq(sema.personelMeslekiBelge.personelId, id))
              .limit(1)
          )[0] ?? null)
        : null,
      egitim: yonetici
        ? await tx.select({ id: sema.personelEgitim.id, derece: sema.personelEgitim.derece, okul: sema.personelEgitim.okul, bolum: sema.personelEgitim.bolum, yil: sema.personelEgitim.yil }).from(sema.personelEgitim).where(eq(sema.personelEgitim.personelId, id)).orderBy(asc(sema.personelEgitim.createdAt))
        : [],
      hassas: yonetici ? ((await rpc<{ personel_hassas_maskeli_getir: PersonelHassasMaskeli | null }>(tx, "personel_hassas_maskeli_getir", { p_personel_id: id }))[0]?.personel_hassas_maskeli_getir ?? null) : null,
      gunSayisi: await randevuSayisi(gun.baslangic, gun.bitis),
      haftaSayisi: await randevuSayisi(hafta.baslangic, hafta.bitis),
      aySayisi: await randevuSayisi(ay.baslangic, ay.bitis),
      maasGecmisi: terapistSatiri
        ? await tx.select({ id: sema.personelUcret.id, maas: sema.personelUcret.maas, gecerlilik_tarihi: sema.personelUcret.gecerlilikTarihi }).from(sema.personelUcret).where(eq(sema.personelUcret.personelId, id)).orderBy(desc(sema.personelUcret.gecerlilikTarihi)).limit(24)
        : [],
      // Düzenle formunun Pozisyon seçimi için — aktif pozisyonlar + (varsa) personelin şu an bağlı olduğu pasif pozisyon (seçim kaybolmasın diye).
      pozisyonlar: yonetici
        ? await tx
            .select({ id: sema.pozisyonlar.id, ad: sema.pozisyonlar.ad, grup: sema.pozisyonlar.grup, sira: sema.pozisyonlar.sira, aktif: sema.pozisyonlar.aktif, sistem_erisimi: sema.pozisyonlar.sistemErisimi, varsayilan_rol: sema.pozisyonlar.varsayilanRol, ucret_tipi: sema.pozisyonlar.ucretTipi, puantaj_modu: sema.pozisyonlar.puantajModu, ozel_mi: sema.pozisyonlar.ozelMi })
            .from(sema.pozisyonlar)
            .where(personelSatiri.pozisyon_id ? or(eq(sema.pozisyonlar.aktif, true), eq(sema.pozisyonlar.id, personelSatiri.pozisyon_id)) : eq(sema.pozisyonlar.aktif, true))
            .orderBy(asc(sema.pozisyonlar.sira))
        : [],
    };
  });

  if (!v) {
    notFound();
  }

  const num = (x: string | null) => (x === null ? null : Number(x));
  const personel: PersonelDetay = {
    ...v.personel,
    maas: v.personel.maas === null ? null : tl(v.personel.maas),
    fm_saatlik_ucret: v.personel.fm_saatlik_ucret === null ? null : tl(v.personel.fm_saatlik_ucret),
    cinsiyet: v.personel.cinsiyet as PersonelDetay["cinsiyet"],
    calisma_tipi: v.personel.calisma_tipi as CalismaTipi | null,
    kullanici: v.personel.k_rol === null ? null : { telefon: v.personel.k_telefon, rol: v.personel.k_rol as PersonelDetay["kullanici"] extends infer K ? (K extends { rol: infer R } ? R : never) : never },
  };
  const terapist: TerapistAyarlari | null = v.terapist
    ? {
        id: v.terapist.id,
        maas_hesaplama_modeli: v.terapist.maas_hesaplama_modeli as TerapistAyarlari["maas_hesaplama_modeli"],
        prim_sabit_tutar: v.terapist.prim_sabit_tutar === null ? null : tl(v.terapist.prim_sabit_tutar),
        baraj_seans_sayisi: v.terapist.baraj_seans_sayisi,
        baraj_bonus_tutari: v.terapist.baraj_bonus_tutari === null ? null : tl(v.terapist.baraj_bonus_tutari),
      }
    : null;

  const kendisi = personel.kullanici_id === ctx.userId;
  // muhasebe: kişisel bilgi/düzenleme yetkisi YOK (aşağıdaki tüm {yonetici && ...} blokları hâlâ klinik_admin'e özel) — sadece sayfaya erişip Cari Hesap'ı
  // görebilmeli, çünkü personel_hesap_hareket RLS'i ve Hesap sekmesi hub'daki per-personel linkler zaten muhasebe'ye açık.
  const muhasebeErisimi = rol === "muhasebe";

  if (!yonetici && !kendisi && !muhasebeErisimi) {
    notFound();
  }

  const acilKisi = v.acil as PersonelAcilKisi | null;
  const mesleki = v.mesleki as PersonelMeslekiBelge | null;
  const egitim = v.egitim as PersonelEgitim[];
  const maasGecmisi: MaasGecmisiSatir[] = v.maasGecmisi.map((m) => ({ id: m.id, maas: tl(m.maas), gecerlilik_tarihi: m.gecerlilik_tarihi })) as MaasGecmisiSatir[];
  const maskeliHassas = v.hassas;
  const pozisyonlar = v.pozisyonlar as unknown as Pozisyon[];
  const bankaHesapListesi = v.bankaHesaplari;

  const gunSayisi = v.gunSayisi;
  const haftaSayisi = v.haftaSayisi;
  const aySayisi = v.aySayisi;

  const hareketler: HesapHareket[] = v.hareketler.map((h) => ({ ...h, tutar: tl(h.tutar) })) as unknown as HesapHareket[];
  const bakiye: HesapBakiye | null = v.bakiye
    ? { personel_id: v.bakiye.personelId as string, klinik_id: v.bakiye.klinikId as string, toplam_hakedis: tl(v.bakiye.toplamHakedis), toplam_odenen: tl(v.bakiye.toplamOdenen), bakiye: tl(v.bakiye.bakiye) }
    : null;
  void num;
  // Bu ayki "ekstra" (taban dışı) pozitif hareketler — hakedis (taban, ayrı
  // satırda gösteriliyor) ve avans/kesinti/odeme (bakiyeyi AZALTAN, "maliyet"
  // değil) hariç.
  const ekstraToplami = tlTopla(hareketler.filter((h) => HESAP_HAREKET_YONU[h.tur] === 1 && h.tur !== "hakedis").map((h) => h.tutar));

  // Görüntülenen ay içinde verilmiş avans toplamı — "+ Ödeme Ekle"de Maaş
  // seçilince tutar önerisinden düşülür (maaş ödemesi net gitsin, avans
  // ayrıca bir daha ödenmesin diye).
  const buAykiAvansToplami = tlTopla(hareketler.filter((h) => h.tur === "avans").map((h) => h.tutar));

  const hesap: ReturnType<typeof maasHesapla> | null = terapist
    ? maasHesapla(
        {
          maas_hesaplama_modeli: terapist.maas_hesaplama_modeli,
          sabit_maas: personel.maas,
          prim_sabit_tutar: terapist.prim_sabit_tutar,
          baraj_seans_sayisi: terapist.baraj_seans_sayisi,
          baraj_bonus_tutari: terapist.baraj_bonus_tutari,
          ayBaslangicTarih: ay.baslangicTarih,
          ayBitisTarihExclusive: ay.bitisTarih,
          iseGirisTarihi: personel.ise_giris_tarihi,
          istenCikisTarihi: personel.isten_cikis_tarihi,
        },
        aySayisi,
        ekstraToplami
      )
    : null;

  const rolEtiketi = personel.kullanici?.rol
    ? ROL_SECENEKLERI.find((r) => r.value === personel.kullanici?.rol)?.label ?? personel.kullanici.rol
    : null;
  const terapistMi = personel.kullanici?.rol === "terapist";

  // Çalışma Çizelgesi kartı: her zaman İÇİNDE BULUNULAN ay (Ödemeler
  // sekmesindeki ay gezinmesinden bağımsız) + bugünün durumu.
  // (donem/puantajAy/bugun sorguları yukarıdaki ana Promise.all'a taşındı.)
  let cizelgeNetSaat = 0;
  let cizelgeFmSaat = 0;
  if (v.donem?.durum === "kapali") {
    cizelgeNetSaat = Number(v.donem.net ?? 0);
    cizelgeFmSaat = Number(v.donem.fm ?? 0);
  } else {
    const satirlar = v.puantajAy;
    cizelgeNetSaat = dakikaSaate(satirlar.reduce((acc, s) => acc + (s.net_calisma_dakika ?? 0), 0));
    cizelgeFmSaat = dakikaSaate(
      satirlar
        .filter((s) => s.fm_onay_durumu === "onaylandi")
        .reduce((acc, s) => acc + (s.fazla_mesai_dakika ?? 0), 0)
    );
  }
  const cizelgeSubtitle = `${ayCari.etiket} · ${saatEtiket(cizelgeNetSaat)} sa · ${saatEtiket(cizelgeFmSaat)} sa FM`;

  const bugunKaydi = v.bugun;
  const cizelgeDot: "emerald" | "sky" | "muted" = bugunKaydi?.giris_saat
    ? "emerald"
    : bugunKaydi?.durum === "izinli" || bugunKaydi?.durum === "raporlu"
      ? "sky"
      : "muted";

  const adresParcalari = [personel.mahalle, personel.ilce, personel.il].filter(Boolean);

  const odemelerKarti = (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Cari Hesap</CardTitle>
        {yonetici && (
          <OdemeEkleButonu
            personelId={id}
            guncelBakiye={bakiye?.bakiye ?? 0}
            sabitMaas={personel.maas}
            buAykiAvansToplami={buAykiAvansToplami}
            bankaHesaplari={bankaHesapListesi}
            otomatikAc={odemeEkle === "1"}
          />
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {bakiye && (
          <div className="flex flex-col gap-0.5 rounded-lg border border-border bg-muted/30 p-3">
            <span className="text-xs text-muted-foreground">Bakiye (alacak)</span>
            <span className={`text-xl font-semibold ${bakiye.bakiye < 0 ? "text-rose-600 dark:text-rose-400" : ""}`}>
              {bakiye.bakiye.toLocaleString("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 })}
            </span>
            <span className="text-xs text-muted-foreground">
              Toplam hakediş: {bakiye.toplam_hakedis.toLocaleString("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 })}
              {" · "}
              Ödenen/kesinti: {bakiye.toplam_odenen.toLocaleString("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 })}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground">Hareketler — {ay.etiket}</h3>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/panel/personel/${id}?tab=odemeler&ay=${ay.oncekiParam}`}>‹</Link>}
            />
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/panel/personel/${id}?tab=odemeler&ay=${ay.sonrakiParam}`}>›</Link>}
            />
          </div>
        </div>

        {hareketler.length === 0 ? (
          <p className="text-sm text-muted-foreground">Bu ay için hareket yok.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {hareketler.map((h) => (
              <li key={h.id} className="flex items-center justify-between py-2 text-sm">
                <div className="flex flex-col">
                  <span className="font-medium">{HESAP_HAREKET_TUR_ETIKETLERI[h.tur]}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(h.tarih).toLocaleDateString("tr-TR")}
                    {h.aciklama && ` · ${h.aciklama}`}
                  </span>
                </div>
                <span className={HESAP_HAREKET_YONU[h.tur] === -1 ? "text-rose-600 dark:text-rose-400" : ""}>
                  {HESAP_HAREKET_YONU[h.tur] === -1 ? "−" : "+"}
                  {h.tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/panel/personel">‹ Personele dön</Link>} />
        </div>

        <Card>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">{personel.ad_soyad}</h1>
              {!personel.aktif && <StatusBadge tone="slate">Pasif</StatusBadge>}
            </div>
            <p className="text-sm text-muted-foreground">
              {personel.kullanici?.telefon ? (
                <a
                  href={`tel:${personel.kullanici.telefon}`}
                  className="underline decoration-dotted underline-offset-2 hover:text-foreground"
                >
                  {telefonGoster(personel.kullanici.telefon)}
                </a>
              ) : (
                "Telefon kaydı yok"
              )}
              {` · ${personel.gorev}`}
            </p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 gap-3">
          <ModuleCard
            icon={User}
            label="Kişisel Bilgiler"
            subtitle={rolEtiketi ?? undefined}
            active={sekme === "kisisel"}
            href={`/panel/personel/${id}?tab=kisisel`}
          />
          <ModuleCard
            icon={CreditCard}
            label="Ödemeler"
            subtitle={terapist ? `${ay.etiket} maaşı` : "Maaş & hakedişler"}
            active={sekme === "odemeler"}
            href={`/panel/personel/${id}?tab=odemeler`}
          />
          <ModuleCard
            icon={CalendarClock}
            label="Çalışma Çizelgesi"
            subtitle={cizelgeSubtitle}
            dot={cizelgeDot}
            href="/panel/personel/puantaj-cetveli"
          />
        </div>

        {sekme === "kisisel" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Kişisel Bilgiler</CardTitle>
              {yonetici && (
                <DuzenlePersonelDialog
                  personelId={id}
                  personel={personel}
                  acilKisi={acilKisi}
                  mesleki={mesleki}
                  egitim={egitim}
                  maskeliHassas={maskeliHassas}
                  pozisyonlar={pozisyonlar}
                />
              )}
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Görev</dt>
                  <dd>{personel.gorev}</dd>
                </div>
                {rolEtiketi && (
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Rol</dt>
                    <dd>{rolEtiketi}</dd>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Telefon</dt>
                  <dd>{telefonGoster(personel.kullanici?.telefon) || "—"}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Durum</dt>
                  <dd>{personel.aktif ? "Aktif" : "Pasif"}</dd>
                </div>
                <div className="flex flex-col gap-1 border-t border-border pt-3">
                  <dt className="text-muted-foreground">Adres</dt>
                  <dd>
                    {adresParcalari.length > 0 ? adresParcalari.join(" / ") : "—"}
                    {personel.adres && <span className="block text-muted-foreground">{personel.adres}</span>}
                  </dd>
                </div>

                {yonetici && (
                  <>
                    <div className="flex items-center justify-between border-t border-border pt-3">
                      <dt className="text-muted-foreground">Doğum Tarihi / Yeri</dt>
                      <dd>
                        {personel.dogum_tarihi ? new Date(personel.dogum_tarihi).toLocaleDateString("tr-TR") : "—"}
                        {personel.dogum_yeri && ` · ${personel.dogum_yeri}`}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-muted-foreground">SGK Sicil No</dt>
                      <dd>{personel.sgk_sicil_no ?? "—"}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-muted-foreground">İşe Giriş Tarihi</dt>
                      <dd>{personel.ise_giris_tarihi ? new Date(personel.ise_giris_tarihi).toLocaleDateString("tr-TR") : "—"}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-muted-foreground">İşten Çıkış Tarihi</dt>
                      <dd>{personel.isten_cikis_tarihi ? new Date(personel.isten_cikis_tarihi).toLocaleDateString("tr-TR") : "—"}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-muted-foreground">Departman</dt>
                      <dd>{personel.departman ?? "—"}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-muted-foreground">Çalışma Tipi</dt>
                      <dd>
                        {personel.calisma_tipi
                          ? CALISMA_TIPI_SECENEKLERI.find((s) => s.value === personel.calisma_tipi)?.label
                          : "—"}
                      </dd>
                    </div>
                    {acilKisi && (
                      <div className="flex items-center justify-between">
                        <dt className="text-muted-foreground">Acil Durum Kişisi</dt>
                        <dd>
                          {acilKisi.ad_soyad} ({acilKisi.yakinlik}) · {telefonGoster(acilKisi.telefon)}
                        </dd>
                      </div>
                    )}
                    <div className="flex items-center justify-between border-t border-border pt-3">
                      <dt className="text-muted-foreground">T.C. Kimlik</dt>
                      <dd>
                        {maskeliHassas?.tc_kimlik_var
                          ? `••••••••${maskeliHassas.tc_kimlik_son2}`
                          : "Kayıtlı değil"}
                      </dd>
                    </div>
                    {terapistMi && (
                      <>
                        <div className="flex flex-col gap-1">
                          <dt className="text-muted-foreground">Eğitim Bilgileri</dt>
                          <dd>
                            {egitim.length > 0
                              ? egitim.map((e) => [e.derece, e.okul, e.bolum, e.yil].filter(Boolean).join(" / ")).join("; ")
                              : "—"}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between">
                          <dt className="text-muted-foreground">İmza Yetkilisi</dt>
                          <dd>{personel.imza_yetkilisi_mi ? "Evet" : "Hayır"}</dd>
                        </div>
                        {mesleki && (
                          <div className="flex flex-col gap-1">
                            <dt className="text-muted-foreground">Mesleki Belgeler</dt>
                            <dd className="text-xs text-muted-foreground">
                              {[
                                mesleki.diploma_no && `Diploma: ${mesleki.diploma_no}`,
                                mesleki.meslek_odasi_sicil_no && `Meslek Odası: ${mesleki.meslek_odasi_sicil_no}`,
                                mesleki.uzmanlik_belge_no && `Uzmanlık Belge: ${mesleki.uzmanlik_belge_no}`,
                                mesleki.saglik_bakanligi_tescil_no && `S.B. Tescil: ${mesleki.saglik_bakanligi_tescil_no}`,
                              ]
                                .filter(Boolean)
                                .join(" · ") || "—"}
                            </dd>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </dl>
            </CardContent>
          </Card>
        )}

        {sekme === "odemeler" && (
          <>
            {!terapist && (
              <>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">
                      Bu personel terapist değil, performans/prim takibi yapılmıyor.
                      {yonetici && personel.maas != null &&
                        ` Sabit maaş: ${personel.maas.toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}`}
                    </p>
                  </CardContent>
                </Card>
                {odemelerKarti}
              </>
            )}

            {terapist && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Performans</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-2xl font-semibold">{gunSayisi}</p>
                        <p className="text-xs text-muted-foreground">Bugün</p>
                      </div>
                      <div>
                        <p className="text-2xl font-semibold">{haftaSayisi}</p>
                        <p className="text-xs text-muted-foreground">Bu hafta</p>
                      </div>
                      <div>
                        <p className="text-2xl font-semibold">{aySayisi}</p>
                        <p className="text-xs text-muted-foreground">{ay.etiket}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {odemelerKarti}

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Maaş Hesabı — {ay.etiket}</CardTitle>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                        render={<Link href={`/panel/personel/${id}?tab=odemeler&ay=${ay.oncekiParam}`}>‹ Önceki</Link>}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                        render={<Link href={`/panel/personel/${id}?tab=odemeler&ay=${ay.sonrakiParam}`}>Sonraki ›</Link>}
                      />
                    </div>
                  </CardHeader>
                  <CardContent>
                    {hesap && (
                      <dl className="flex flex-col gap-2 text-sm">
                        <div className="flex items-center justify-between">
                          <dt className="text-muted-foreground">Taban</dt>
                          <dd>{hesap.taban.toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}</dd>
                        </div>
                        <div className="flex items-center justify-between">
                          <dt className="text-muted-foreground">Prim/Bonus</dt>
                          <dd>{hesap.prim.toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}</dd>
                        </div>
                        <div className="flex items-center justify-between">
                          <dt className="text-muted-foreground">Ödemeler</dt>
                          <dd>
                            {hesap.ekstra_toplam.toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between border-t border-border pt-2 font-semibold">
                          <dt>Toplam</dt>
                          <dd>{hesap.toplam.toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}</dd>
                        </div>
                        <p className="text-xs text-muted-foreground">{hesap.aciklama}</p>
                      </dl>
                    )}
                  </CardContent>
                </Card>

                {yonetici && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Maaş Ayarları</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <MaasFormu
                        key={`${personel.maas}|${terapist.maas_hesaplama_modeli}|${terapist.prim_sabit_tutar}|${terapist.baraj_seans_sayisi}|${terapist.baraj_bonus_tutari}`}
                        personel={personel}
                        terapist={terapist}
                      />
                    </CardContent>
                  </Card>
                )}

                {maasGecmisi.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Maaş Geçmişi</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="flex flex-col divide-y divide-border">
                        {maasGecmisi.map((m) => (
                          <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                            <span className="text-muted-foreground">
                              {new Date(m.gecerlilik_tarihi).toLocaleDateString("tr-TR")} itibarıyla
                            </span>
                            <span className="font-medium">
                              {m.maas.toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
