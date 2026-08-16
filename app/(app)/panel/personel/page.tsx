import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { Users, Briefcase, CalendarClock, CalendarCheck2, Table2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { PersonelSatir } from "@/types/personel";
import { HESAP_HAREKET_YONU, type HesapHareketTuru } from "@/types/hesap-hareket";
import { ayAraligi } from "@/lib/utils";
import { PersonelListesi } from "./personel-listesi";
import { PersonelSekmeCubugu } from "./sekme-cubugu";
import { HesapOzeti, type HesapOzetSatir } from "./hesap-ozeti";
import { PozisyonlarListesi } from "./pozisyonlar-listesi";
import { OzelPozisyonDialog } from "./ozel-pozisyon-dialog";
import type { Pozisyon } from "@/types/pozisyon";
import { PERSONEL_SEKME_TANIMLARI, personelSekmeErisimVarMi, type PersonelSekme } from "./sekmeler";

export default async function PersonelSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; ay?: string }>;
}) {
  const { tab, ay: ayParam } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("rol").eq("id", user.id).single();
  const rol = kullanici?.rol ?? null;
  const yonetici = rol === "klinik_admin";

  const izinliSekmeler = PERSONEL_SEKME_TANIMLARI.filter((s) => personelSekmeErisimVarMi(s, rol));
  const istenenSekme = PERSONEL_SEKME_TANIMLARI.some((s) => s.key === tab) ? (tab as PersonelSekme) : "liste";
  // İzinli olmayan/geçersiz bir sekme istenirse (elle URL değişikliği), herkese
  // açık olan "liste"ye sessizce düşülür — ayrı bir redirect'e gerek yok, sekme
  // çubuğu zaten sadece izinli sekmeleri linkliyor.
  const aktifSekme: PersonelSekme = izinliSekmeler.some((s) => s.key === istenenSekme) ? istenenSekme : "liste";

  let listeIcerigi: ReactNode = null;
  let hesapIcerigi: ReactNode = null;
  let pozisyonlarIcerigi: ReactNode = null;
  let bekleyenIzinSayisi = 0;

  // Rozet için sekme fark etmeksizin hep çekiliyor (yönetici Liste'deyken bile
  // "onay bekleyen var" görmeli) — tek satır count sorgusu, maliyeti düşük.
  if (yonetici) {
    const { count } = await supabase
      .from("personel_izin_talebi")
      .select("id", { count: "exact", head: true })
      .eq("durum", "beklemede");
    bekleyenIzinSayisi = count ?? 0;
  }

  if (aktifSekme === "liste") {
    const [{ data: personelSonucu, error }, { data: bilgiDurumu }] = await Promise.all([
      supabase
        .from("personel")
        .select("id, ad_soyad, gorev, maas, aktif, kullanici:kullanici_id(telefon)")
        .order("ad_soyad")
        .returns<PersonelSatir[]>(),
      supabase.from("v_personel_bilgi_durumu").select("personel_id, bilgiler_tamam"),
    ]);

    const tamamlikMap = new Map((bilgiDurumu ?? []).map((d) => [d.personel_id, d.bilgiler_tamam]));
    const personelListesi = (personelSonucu ?? []).map((p) => ({
      ...p,
      bilgiler_tamam: tamamlikMap.get(p.id) ?? false,
    }));

    listeIcerigi = (
      <div className="flex flex-col gap-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Personel Listesi</h1>
            <p className="text-sm text-muted-foreground">
              Çalışanlar; terapistler için performans ve maaş hesaplama.
            </p>
          </div>
          {yonetici && (
            <Button
              nativeButton={false}
              className="bg-emerald-500 text-white hover:bg-emerald-600 dark:hover:bg-emerald-600"
              render={
                <Link href="/panel/personel/basvurular">
                  <Briefcase /> İş Başvurusu Ekle
                </Link>
              }
            />
          )}
        </header>

        {error && <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>}
        {!error && personelListesi.length === 0 && (
          <EmptyState icon={Users} title="Henüz personel kaydı yok." />
        )}
        {!error && personelListesi.length > 0 && (
          <PersonelListesi personelListesi={personelListesi} yonetici={yonetici} />
        )}
      </div>
    );
  }

  if (aktifSekme === "hesap") {
    const ay = ayAraligi(ayParam);
    const [{ data: personelListesi }, { data: bakiyeler }, { data: buAyHareketler }] = await Promise.all([
      // aktif=false filtrelenmiyor (eski Personel Takip ekranı da filtrelemiyordu) —
      // işten ayrılmış ama hâlâ alacağı olan personel bakiye özetinden kaybolmamalı.
      supabase.from("personel").select("id, ad_soyad, gorev").order("ad_soyad"),
      supabase.from("v_personel_hesap_bakiye").select("personel_id, bakiye"),
      supabase
        .from("personel_hesap_hareket")
        .select("personel_id, tur, tutar")
        .gte("tarih", ay.baslangicTarih)
        .lt("tarih", ay.bitisTarih)
        .returns<{ personel_id: string; tur: HesapHareketTuru; tutar: number }[]>(),
    ]);

    const bakiyeMap = new Map((bakiyeler ?? []).map((b) => [b.personel_id, b.bakiye]));
    const buAyMap = new Map<string, number>();
    for (const h of buAyHareketler ?? []) {
      const yon = HESAP_HAREKET_YONU[h.tur];
      buAyMap.set(h.personel_id, (buAyMap.get(h.personel_id) ?? 0) + yon * h.tutar);
    }

    const satirlar: HesapOzetSatir[] = (personelListesi ?? []).map((p) => ({
      personelId: p.id,
      adSoyad: p.ad_soyad,
      gorev: p.gorev,
      bakiye: bakiyeMap.get(p.id) ?? 0,
      buAyEklenen: buAyMap.get(p.id) ?? 0,
    }));

    hesapIcerigi = (
      <HesapOzeti satirlar={satirlar} ayEtiketi={ay.etiket} oncekiParam={ay.oncekiParam} sonrakiParam={ay.sonrakiParam} />
    );
  }

  if (aktifSekme === "pozisyonlar") {
    const [{ data: pozisyonSonucu }, { data: personelSayimSonucu }] = await Promise.all([
      supabase.from("pozisyonlar").select("id, ad, grup, sira, aktif, sistem_erisimi, varsayilan_rol, ucret_tipi, puantaj_modu, ozel_mi").returns<Pozisyon[]>(),
      supabase.from("personel").select("pozisyon_id").eq("aktif", true).not("pozisyon_id", "is", null),
    ]);

    const personelSayilari = new Map<string, number>();
    for (const p of personelSayimSonucu ?? []) {
      if (!p.pozisyon_id) continue;
      personelSayilari.set(p.pozisyon_id, (personelSayilari.get(p.pozisyon_id) ?? 0) + 1);
    }

    pozisyonlarIcerigi = (
      <div className="flex flex-col gap-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Pozisyonlar</h1>
            <p className="text-sm text-muted-foreground">
              Personele atanacak pozisyonların sistem erişimi, rol, ücret tipi ve puantaj ayarlarını yönet.
            </p>
          </div>
          <OzelPozisyonDialog />
        </header>

        {(pozisyonSonucu ?? []).length === 0 ? (
          <EmptyState icon={Briefcase} title="Henüz pozisyon tanımlı değil." />
        ) : (
          <PozisyonlarListesi pozisyonlar={pozisyonSonucu ?? []} personelSayilari={personelSayilari} />
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 bg-background">
      <div className="mx-auto flex max-w-md flex-col gap-4 p-4 pb-24 sm:max-w-3xl sm:p-8">
        <PersonelSekmeCubugu
          aktifSekme={aktifSekme}
          izinliSekmeler={izinliSekmeler.map(({ key, label }) => ({ key, label }))}
          rozetler={{ puantaj: bekleyenIzinSayisi }}
        >
          {aktifSekme === "liste" && listeIcerigi}
          {aktifSekme === "pozisyonlar" && pozisyonlarIcerigi}
          {aktifSekme === "hesap" && hesapIcerigi}
          {aktifSekme === "puantaj" && (
            <div className="flex flex-col gap-4">
              <header>
                <h1 className="text-2xl font-semibold tracking-tight">Puantaj</h1>
                <p className="text-sm text-muted-foreground">Devam/izin takibi ve çalışma çizelgesi buradan yönetilir.</p>
              </header>

              <div className="grid gap-3 sm:grid-cols-2">
                <Card>
                  <CardContent className="flex flex-col gap-2">
                    <span className="text-sm font-medium">İznim</span>
                    <span className="text-xs text-muted-foreground">Bakiye, yeni izin talebi ve geçmiş taleplerim.</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-fit"
                      nativeButton={false}
                      render={
                        <Link href="/panel/personel/izinlerim">
                          <CalendarClock /> İznim
                        </Link>
                      }
                    />
                  </CardContent>
                </Card>

                {yonetici && (
                  <Card>
                    <CardContent className="flex flex-col gap-2">
                      <span className="text-sm font-medium">İzin Talepleri</span>
                      <span className="text-xs text-muted-foreground">
                        {bekleyenIzinSayisi > 0 ? `${bekleyenIzinSayisi} talep onay bekliyor.` : "Onay bekleyen talep yok."}
                      </span>
                      <Button
                        size="sm"
                        className="w-fit bg-emerald-500 text-white hover:bg-emerald-600 dark:hover:bg-emerald-600"
                        nativeButton={false}
                        render={
                          <Link href="/panel/personel/izinler">
                            <CalendarCheck2 /> İzin Taleplerini İncele
                          </Link>
                        }
                      />
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardContent className="flex flex-col gap-2">
                    <span className="text-sm font-medium">Puantaj Cetveli</span>
                    <span className="text-xs text-muted-foreground">
                      Tüm personelin aylık devam/izin/fazla mesai çizelgesi, tek tabloda.
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-fit"
                      nativeButton={false}
                      render={
                        <Link href="/panel/personel/puantaj-cetveli">
                          <Table2 /> Cetveli Aç
                        </Link>
                      }
                    />
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </PersonelSekmeCubugu>
      </div>
    </div>
  );
}
