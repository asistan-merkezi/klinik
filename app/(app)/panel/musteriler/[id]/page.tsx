import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MusteriDetay } from "@/types/musteri";
import type { MusteriHassasSatir } from "@/types/musteri-hassas";
import type { SatilabilirUrun, PaketSatisSatir, OdemeGecmisSatir } from "@/types/odeme";
import { YONTEM_ETIKETLERI } from "@/types/odeme";
import type { PeriyodikRandevuSatir } from "@/types/periyodik-randevu";
import { OdemeFormu } from "./odeme-formu";
import { FaturaDurum } from "./fatura-durum";
import { PortalErisimKarti } from "./portal-erisim-karti";
import { DetayliBilgilerKarti } from "./detayli-bilgiler-karti";
import { MusteriBasligi } from "./musteri-basligi";
import { PeriyodikRandevularKarti } from "./periyodik-randevular-karti";

export default async function MusteriDetaySayfasi({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: musteri } = await supabase
    .from("musteri")
    .select(
      "id, ad_soyad, telefon, dogum_tarihi, kvkk_onay_tarihi, whatsapp_izin_durumu, cinsiyet, eposta, referans_kanali, ozel_nitelikli_veri_onay_tarihi, ticari_ileti_onay_tarihi"
    )
    .eq("id", id)
    .single<MusteriDetay>();

  if (!musteri) {
    notFound();
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("rol")
    .eq("id", user.id)
    .single();

  const duzenlenebilir = kullanici?.rol === "klinik_admin" || kullanici?.rol === "resepsiyon";

  const [musteriKullaniciSonucu, musteriHassasSonucu] = await Promise.all([
    supabase.from("musteri_kullanici").select("aktif").eq("musteri_id", id).maybeSingle(),
    supabase.from("musteri_hassas").select("*").eq("musteri_id", id).maybeSingle<MusteriHassasSatir>(),
  ]);
  const musteriKullanici = musteriKullaniciSonucu.data;
  const musteriHassas = musteriHassasSonucu.data;

  const [paketSatisSonucu, odemeSonucu, islemTanimiSonucu, paketSonucu, periyodikRandevuSonucu] =
    await Promise.all([
      supabase
        .from("paket_satis")
        .select("id, kalan_adet, gecerlilik_bitis_tarihi, durum, paket(ad, seans_sayisi)")
        .eq("musteri_id", id)
        .eq("durum", "aktif")
        .order("gecerlilik_bitis_tarihi")
        .returns<PaketSatisSatir[]>(),
      supabase
        .from("odeme")
        .select(
          "id, created_at, iskonto_tutari, faturali, odeme_kalemi(miktar, birim_fiyat, islem_tanimi(ad), paket_satis(paket(ad))), odeme_satiri(yontem, tutar), fatura(id, durum, e_arsiv_pdf_url, hata_mesaji)"
        )
        .eq("musteri_id", id)
        .order("created_at", { ascending: false })
        .limit(20)
        .returns<OdemeGecmisSatir[]>(),
      supabase.from("islem_tanimi").select("id, ad, fiyat, kdv_orani").eq("aktif", true).order("ad"),
      supabase.from("paket").select("id, ad, fiyat, kdv_orani").eq("aktif", true).order("ad"),
      supabase
        .from("periyodik_randevu")
        .select(
          "id, haftanin_gunu, saat, sure_dakika, durum, bitis_tarihi, otomatik_yenile, terapist(personel(ad_soyad)), oda(ad), islem_tanimi(ad)"
        )
        .eq("musteri_id", id)
        .eq("durum", "aktif")
        .order("haftanin_gunu")
        .returns<PeriyodikRandevuSatir[]>(),
    ]);

  const aktifPaketler = paketSatisSonucu.data ?? [];
  const odemeGecmisi = odemeSonucu.data ?? [];
  const periyodikRandevular = periyodikRandevuSonucu.data ?? [];

  const satilabilirUrunler: SatilabilirUrun[] = [
    ...(islemTanimiSonucu.data ?? []).map((i) => ({
      id: i.id,
      ad: i.ad,
      tur: "islem" as const,
      fiyat: i.fiyat,
      kdv_orani: i.kdv_orani,
    })),
    ...(paketSonucu.data ?? []).map((p) => ({
      id: p.id,
      ad: p.ad,
      tur: "paket" as const,
      fiyat: p.fiyat,
      kdv_orani: p.kdv_orani,
    })),
  ];

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-3">
          <div className="flex justify-end">
            <Button variant="outline" nativeButton={false} render={<Link href="/panel/musteriler">Müşterilere dön</Link>} />
          </div>
          <MusteriBasligi musteri={musteri} duzenlenebilir={duzenlenebilir} />
          {(musteriHassas?.alerji_var ||
            musteriHassas?.kan_sulandirici_kullanimi ||
            musteriHassas?.oncelik_durumu === "acil" ||
            musteriHassas?.oncelik_durumu === "oncelikli") && (
            <div className="flex flex-wrap gap-2">
              {musteriHassas?.alerji_var && (
                <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">
                  ⚠️ ALERJİ VAR
                </span>
              )}
              {musteriHassas?.kan_sulandirici_kullanimi && (
                <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">
                  🩸 KAN SULANDIRICI
                </span>
              )}
              {musteriHassas?.oncelik_durumu === "acil" && (
                <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">
                  🔴 ACİL
                </span>
              )}
              {musteriHassas?.oncelik_durumu === "oncelikli" && (
                <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                  ÖNCELİKLİ
                </span>
              )}
            </div>
          )}
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Aktif Paketler</CardTitle>
          </CardHeader>
          <CardContent>
            {aktifPaketler.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aktif paketi yok.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {aktifPaketler.map((ps) => (
                  <li key={ps.id} className="flex items-center justify-between py-3 text-sm">
                    <span className="font-medium">{ps.paket?.ad ?? "—"}</span>
                    <span className="text-muted-foreground">
                      {ps.kalan_adet}/{ps.paket?.seans_sayisi ?? "?"} hak kaldı · son kullanım{" "}
                      {new Date(ps.gecerlilik_bitis_tarihi).toLocaleDateString("tr-TR")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {duzenlenebilir && (
          <Card>
            <CardHeader>
              <CardTitle>Ödeme Al</CardTitle>
            </CardHeader>
            <CardContent>
              <OdemeFormu musteriId={musteri.id} urunler={satilabilirUrunler} />
            </CardContent>
          </Card>
        )}

        {duzenlenebilir && (
          <Card>
            <CardHeader>
              <CardTitle>Periyodik Randevular</CardTitle>
            </CardHeader>
            <CardContent>
              <PeriyodikRandevularKarti musteriId={musteri.id} periyodikRandevular={periyodikRandevular} />
            </CardContent>
          </Card>
        )}

        {duzenlenebilir && (
          <Card>
            <CardHeader>
              <CardTitle>Müşteri Portalı Erişimi</CardTitle>
            </CardHeader>
            <CardContent>
              <PortalErisimKarti
                musteriId={musteri.id}
                telefon={musteri.telefon}
                durum={{ var: musteriKullanici != null, aktif: musteriKullanici?.aktif ?? false }}
              />
            </CardContent>
          </Card>
        )}

        {duzenlenebilir && (
          <Card>
            <CardHeader>
              <CardTitle>Detaylı Bilgiler & Anamnez</CardTitle>
            </CardHeader>
            <CardContent>
              <DetayliBilgilerKarti musteri={musteri} hassas={musteriHassas} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Ödeme Geçmişi</CardTitle>
          </CardHeader>
          <CardContent>
            {odemeGecmisi.length === 0 ? (
              <p className="text-sm text-muted-foreground">Henüz ödeme yok.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {odemeGecmisi.map((odeme) => {
                  const kalemAdlari = odeme.odeme_kalemi
                    .map((k) => k.islem_tanimi?.ad ?? k.paket_satis?.paket?.ad ?? "—")
                    .join(", ");
                  const toplam = odeme.odeme_satiri.reduce((acc, s) => acc + s.tutar, 0);
                  const yontemler = odeme.odeme_satiri
                    .map((s) => YONTEM_ETIKETLERI[s.yontem] ?? s.yontem)
                    .join(" + ");

                  return (
                    <li key={odeme.id} className="flex flex-col gap-1 py-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{kalemAdlari}</span>
                        <span>
                          {toplam.toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(odeme.created_at).toLocaleString("tr-TR")} · {yontemler || "—"} ·{" "}
                        {odeme.faturali ? "Faturalı" : "Faturasız"}
                        {odeme.iskonto_tutari > 0 &&
                          ` · İskonto ${odeme.iskonto_tutari.toLocaleString("tr-TR", {
                            style: "currency",
                            currency: "TRY",
                          })}`}
                      </span>
                      {odeme.fatura.length > 0 && <FaturaDurum fatura={odeme.fatura[0]} />}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
