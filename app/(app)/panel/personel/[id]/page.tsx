import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { User, CreditCard, CalendarClock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ModuleCard } from "@/components/panel/module-card";
import {
  CALISMA_TIPI_SECENEKLERI,
  ROL_SECENEKLERI,
  type HakedisSatir,
  type MaasGecmisiSatir,
  type PersonelAcilKisi,
  type PersonelDetay,
  type PersonelHassasMaskeli,
  type PersonelMeslekiBelge,
  type TerapistAyarlari,
} from "@/types/personel";
import { ayAraligi, gunAraligi, haftaAraligi, telefonGoster } from "@/lib/utils";
import { maasHesapla } from "@/lib/maas";
import { bugunTarih, dakikaSaate, saatEtiket } from "@/lib/puantaj";
import { MaasFormu } from "./maas-formu";
import { HakedisFormu } from "./hakedis-formu";
import { DuzenlePersonelDialog } from "./duzenle-personel-dialog";

type Sekme = "kisisel" | "odemeler" | undefined;

export default async function PersonelDetaySayfasi({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ay?: string; tab?: string }>;
}) {
  const { id } = await params;
  const { ay: ayParam, tab } = await searchParams;
  const sekme: Sekme = tab === "kisisel" || tab === "odemeler" ? tab : undefined;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const gun = gunAraligi();
  const hafta = haftaAraligi();
  const ay = ayAraligi(ayParam);
  const ayCari = ayAraligi();
  const [ayYilStr, ayAyStr] = ayCari.param.split("-");

  // Bu 7 sorgu birbirinden bağımsız (hepsi sadece `id`/`user.id` ve sabit
  // tarih aralıklarına ihtiyaç duyuyor) — önceden art arda (waterfall)
  // çalıştırılıyordu, sayfa render'ı öncesi ~6 sıralı round-trip'e mal
  // oluyordu. Şimdi tek round-trip'te paralel çalışıyor.
  const [
    kullaniciSonucu,
    personelSonucu,
    terapistSonucu,
    hakedisSonucu,
    donemSonucu,
    puantajAySonucu,
    bugunSonucu,
  ] = await Promise.all([
    supabase.from("kullanici").select("rol").eq("id", user.id).single(),
    supabase
      .from("personel")
      .select(
        "id, ad_soyad, gorev, maas, aktif, kullanici_id, tc_kimlik_no, uzmanlik_tescil_no, il, ilce, mahalle, adres, dogum_tarihi, dogum_yeri, cinsiyet, eposta, departman, calisma_tipi, sgk_sicil_no, ise_giris_tarihi, ise_baslama_notu, kullanici:kullanici_id(telefon, rol)"
      )
      .eq("id", id)
      .single<PersonelDetay>(),
    supabase
      .from("terapist")
      .select("id, maas_hesaplama_modeli, prim_sabit_tutar, baraj_seans_sayisi, baraj_bonus_tutari")
      .eq("personel_id", id)
      .maybeSingle<TerapistAyarlari>(),
    supabase
      .from("personel_ekstra_hakedis")
      .select("id, tur, tutar, tarih, aciklama")
      .eq("personel_id", id)
      .gte("tarih", ay.baslangicTarih)
      .lt("tarih", ay.bitisTarih)
      .order("tarih", { ascending: false })
      .returns<HakedisSatir[]>(),
    supabase
      .from("personel_puantaj_donem")
      .select("durum, snapshot_net_saat, snapshot_onayli_fm_saat")
      .eq("personel_id", id)
      .eq("yil", Number(ayYilStr))
      .eq("ay", Number(ayAyStr))
      .maybeSingle(),
    supabase
      .from("personel_puantaj")
      .select("net_calisma_dakika, fazla_mesai_dakika, fm_onay_durumu")
      .eq("personel_id", id)
      .gte("tarih", ayCari.baslangicTarih)
      .lt("tarih", ayCari.bitisTarih),
    supabase
      .from("personel_puantaj")
      .select("giris_saat, durum")
      .eq("personel_id", id)
      .eq("tarih", bugunTarih())
      .maybeSingle(),
  ]);

  const kullanici = kullaniciSonucu.data;
  const personel = personelSonucu.data;

  if (!personel) {
    notFound();
  }

  const yonetici = kullanici?.rol === "klinik_admin";
  const kendisi = personel.kullanici_id === user.id;

  if (!yonetici && !kendisi) {
    notFound();
  }

  const terapist = terapistSonucu.data;

  const [acilSonucu, meslekiSonucu, hassasSonucu, gunSonucu, haftaSonucu, aySonucu, maasGecmisiSonucu] = await Promise.all([
    yonetici
      ? supabase
          .from("personel_acil_kisi")
          .select("id, ad_soyad, yakinlik, telefon")
          .eq("personel_id", id)
          .maybeSingle<PersonelAcilKisi>()
      : Promise.resolve({ data: null as PersonelAcilKisi | null }),
    yonetici
      ? supabase
          .from("personel_mesleki_belge")
          .select(
            "diploma_no, uzmanlik_belge_no, meslek_odasi_sicil_no, saglik_bakanligi_tescil_no, e_imza_sertifika_seri_no, e_imza_gecerlilik_tarihi, kase_gorsel_url, mali_sorumluluk_sigorta_police_no, mali_sorumluluk_sigorta_bitis_tarihi"
          )
          .eq("personel_id", id)
          .maybeSingle<PersonelMeslekiBelge>()
      : Promise.resolve({ data: null as PersonelMeslekiBelge | null }),
    yonetici
      ? supabase.rpc("personel_hassas_maskeli_getir", { p_personel_id: id })
      : Promise.resolve({ data: null as PersonelHassasMaskeli | null }),
    terapist
      ? supabase
          .from("randevu")
          .select("id", { count: "exact", head: true })
          .eq("terapist_id", terapist.id)
          .in("durum", ["geldi", "gecikmeli_geldi", "tamamlandi"])
          .gte("baslangic", gun.baslangic)
          .lt("baslangic", gun.bitis)
      : Promise.resolve({ count: 0 }),
    terapist
      ? supabase
          .from("randevu")
          .select("id", { count: "exact", head: true })
          .eq("terapist_id", terapist.id)
          .in("durum", ["geldi", "gecikmeli_geldi", "tamamlandi"])
          .gte("baslangic", hafta.baslangic)
          .lt("baslangic", hafta.bitis)
      : Promise.resolve({ count: 0 }),
    terapist
      ? supabase
          .from("randevu")
          .select("id", { count: "exact", head: true })
          .eq("terapist_id", terapist.id)
          .in("durum", ["geldi", "gecikmeli_geldi", "tamamlandi"])
          .gte("baslangic", ay.baslangic)
          .lt("baslangic", ay.bitis)
      : Promise.resolve({ count: 0 }),
    terapist
      ? supabase
          .from("personel_maas_gecmisi")
          .select("id, maas, gecerlilik_tarihi")
          .eq("personel_id", id)
          .order("gecerlilik_tarihi", { ascending: false })
          .limit(24)
          .returns<MaasGecmisiSatir[]>()
      : Promise.resolve({ data: null as MaasGecmisiSatir[] | null }),
  ]);

  const acilKisi = acilSonucu.data;
  const mesleki = meslekiSonucu.data;
  const maasGecmisi = maasGecmisiSonucu.data ?? [];
  const maskeliHassas = (hassasSonucu.data as PersonelHassasMaskeli | null) ?? null;

  const gunSayisi = gunSonucu.count ?? 0;
  const haftaSayisi = haftaSonucu.count ?? 0;
  const aySayisi = aySonucu.count ?? 0;

  const hakedisler = hakedisSonucu.data ?? [];
  const hakedisToplami = hakedisler.reduce((acc, h) => acc + h.tutar, 0);

  const hesap: ReturnType<typeof maasHesapla> | null = terapist
    ? maasHesapla(
        {
          maas_hesaplama_modeli: terapist.maas_hesaplama_modeli,
          sabit_maas: personel.maas,
          prim_sabit_tutar: terapist.prim_sabit_tutar,
          baraj_seans_sayisi: terapist.baraj_seans_sayisi,
          baraj_bonus_tutari: terapist.baraj_bonus_tutari,
        },
        aySayisi,
        hakedisToplami
      )
    : null;

  const TUR_ETIKET: Record<HakedisSatir["tur"], string> = {
    yol: "Yol",
    yemek: "Yemek",
    mesai: "Fazla Mesai",
    avans: "Avans",
    diger: "Diğer",
  };

  const rolEtiketi = personel.kullanici?.rol
    ? ROL_SECENEKLERI.find((r) => r.value === personel.kullanici?.rol)?.label ?? personel.kullanici.rol
    : null;

  // Çalışma Çizelgesi kartı: her zaman İÇİNDE BULUNULAN ay (Ödemeler
  // sekmesindeki ay gezinmesinden bağımsız) + bugünün durumu.
  // (donem/puantajAy/bugun sorguları yukarıdaki ana Promise.all'a taşındı.)
  let cizelgeNetSaat = 0;
  let cizelgeFmSaat = 0;
  if (donemSonucu.data?.durum === "kapali") {
    cizelgeNetSaat = donemSonucu.data.snapshot_net_saat ?? 0;
    cizelgeFmSaat = donemSonucu.data.snapshot_onayli_fm_saat ?? 0;
  } else {
    const satirlar = puantajAySonucu.data ?? [];
    cizelgeNetSaat = dakikaSaate(satirlar.reduce((acc, s) => acc + (s.net_calisma_dakika ?? 0), 0));
    cizelgeFmSaat = dakikaSaate(
      satirlar
        .filter((s) => s.fm_onay_durumu === "onaylandi")
        .reduce((acc, s) => acc + (s.fazla_mesai_dakika ?? 0), 0)
    );
  }
  const cizelgeSubtitle = `${ayCari.etiket} · ${saatEtiket(cizelgeNetSaat)} sa · ${saatEtiket(cizelgeFmSaat)} sa FM`;

  const bugunKaydi = bugunSonucu.data;
  const cizelgeDot: "emerald" | "sky" | "muted" = bugunKaydi?.giris_saat
    ? "emerald"
    : bugunKaydi?.durum === "izinli" || bugunKaydi?.durum === "raporlu"
      ? "sky"
      : "muted";

  const adresParcalari = [personel.mahalle, personel.ilce, personel.il].filter(Boolean);

  const odemelerKarti = (
    <Card>
      <CardHeader>
        <CardTitle>Ödemeler — {ay.etiket}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {yonetici && <HakedisFormu personelId={id} />}
        {hakedisler.length === 0 ? (
          <p className="text-sm text-muted-foreground">Bu ay için ödeme kaydı yok.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {hakedisler.map((h) => (
              <li key={h.id} className="flex items-center justify-between py-2 text-sm">
                <div className="flex flex-col">
                  <span className="font-medium">{TUR_ETIKET[h.tur]}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(h.tarih).toLocaleDateString("tr-TR")}
                    {h.aciklama && ` · ${h.aciklama}`}
                  </span>
                </div>
                <span>{h.tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}</span>
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
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/panel/personel/liste">‹ Personele dön</Link>} />
        </div>

        <Card>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">{personel.ad_soyad}</h1>
              {!personel.aktif && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  Pasif
                </span>
              )}
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
            href={`/panel/personel/${id}/calisma-cizelgesi`}
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
                  maskeliHassas={maskeliHassas}
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
                  <dt className="text-muted-foreground">T.C. Kimlik No</dt>
                  <dd>{personel.tc_kimlik_no ?? "—"}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Uzmanlık / Tescil No</dt>
                  <dd>{personel.uzmanlik_tescil_no ?? "—"}</dd>
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
                    <div className="flex items-center justify-between">
                      <dt className="text-muted-foreground">İşe Giriş Tarihi</dt>
                      <dd>{personel.ise_giris_tarihi ? new Date(personel.ise_giris_tarihi).toLocaleDateString("tr-TR") : "—"}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-muted-foreground">SGK Sicil No</dt>
                      <dd>{personel.sgk_sicil_no ?? "—"}</dd>
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
                      <dt className="text-muted-foreground">T.C. Kimlik (şifreli)</dt>
                      <dd>
                        {!maskeliHassas?.anahtar_kurulu
                          ? "Şifreleme kurulu değil"
                          : maskeliHassas.tc_kimlik_var
                            ? `••••••••${maskeliHassas.tc_kimlik_son2}`
                            : "Kayıtlı değil"}
                      </dd>
                    </div>
                    {mesleki && (
                      <div className="flex flex-col gap-1 border-t border-border pt-3">
                        <dt className="text-muted-foreground">Mesleki Belgeler</dt>
                        <dd className="text-xs text-muted-foreground">
                          {[
                            mesleki.diploma_no && `Diploma: ${mesleki.diploma_no}`,
                            mesleki.uzmanlik_belge_no && `Uzmanlık Belge: ${mesleki.uzmanlik_belge_no}`,
                            mesleki.meslek_odasi_sicil_no && `Meslek Odası: ${mesleki.meslek_odasi_sicil_no}`,
                            mesleki.saglik_bakanligi_tescil_no && `S.B. Tescil: ${mesleki.saglik_bakanligi_tescil_no}`,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </dd>
                      </div>
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
