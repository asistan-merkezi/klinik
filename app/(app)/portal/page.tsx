import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { telefonGoster } from "@/lib/utils";
import type { PaketSatisSatir, OdemeGecmisSatir } from "@/types/odeme";
import { YONTEM_ETIKETLERI } from "@/types/odeme";
import type { PortalRandevuSatir, PortalRandevuTalebiSatir } from "@/types/portal";
import { portalCikisYap } from "./actions";
import { IptalTalepButonu } from "./iptal-talep-butonu";

const TALEP_DURUM_ETIKET: Record<PortalRandevuTalebiSatir["durum"], string> = {
  bekliyor: "İnceleniyor",
  onaylandi: "Onaylandı",
  reddedildi: "Reddedildi",
};

const DURUM_ETIKET: Record<PortalRandevuSatir["durum"], string> = {
  planlandi: "Planlandı",
  geldi: "Geldi",
  gecikmeli_geldi: "Gecikmeli Geldi",
  iptal: "İptal",
  gelmedi: "Gelmedi",
  ertelendi: "Ertelendi",
  tamamlandi: "Tamamlandı",
};

export default async function PortalSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/portal/giris");
  }

  const { data: mk } = await supabase
    .from("hasta_kullanici")
    .select("hasta_id, aktif")
    .eq("id", user.id)
    .single();

  if (!mk?.hasta_id || !mk.aktif) {
    redirect("/portal/giris");
  }

  const hastaId = mk.hasta_id;
  const simdi = new Date().toISOString();

  const [hastaSonucu, yaklasanSonucu, gecmisSonucu, paketSonucu, odemeSonucu, randevuTalepleriSonucu] = await Promise.all([
    supabase.from("hasta").select("ad_soyad, telefon").eq("id", hastaId).single(),
    supabase
      .from("randevu")
      .select(
        "id, baslangic, bitis, durum, terapist(personel(ad_soyad)), oda(ad), randevu_iptal_talebi(id, durum)"
      )
      .eq("hasta_id", hastaId)
      .gte("bitis", simdi)
      .order("baslangic")
      .returns<PortalRandevuSatir[]>(),
    supabase
      .from("randevu")
      .select(
        "id, baslangic, bitis, durum, terapist(personel(ad_soyad)), oda(ad), randevu_iptal_talebi(id, durum)"
      )
      .eq("hasta_id", hastaId)
      .lt("bitis", simdi)
      .order("baslangic", { ascending: false })
      .limit(10)
      .returns<PortalRandevuSatir[]>(),
    supabase
      .from("paket_satis")
      .select("id, kalan_adet, gecerlilik_bitis_tarihi, durum, paket(ad, seans_sayisi)")
      .eq("hasta_id", hastaId)
      .eq("durum", "aktif")
      .order("gecerlilik_bitis_tarihi")
      .returns<PaketSatisSatir[]>(),
    supabase
      .from("odeme")
      .select(
        "id, created_at, iskonto_tutari, faturali, odeme_kalemi(miktar, birim_fiyat, islem_tanimi(ad), paket_satis(paket(ad))), odeme_satiri(yontem, tutar), fatura(id, durum, e_arsiv_pdf_url, hata_mesaji)"
      )
      .eq("hasta_id", hastaId)
      .order("created_at", { ascending: false })
      .limit(20)
      .returns<OdemeGecmisSatir[]>(),
    supabase
      .from("randevu_talebi")
      .select("id, islem_tanimi(ad), tercih_tarih, tercih_saat, not_metni, durum, created_at")
      .eq("hasta_id", hastaId)
      .order("created_at", { ascending: false })
      .limit(10)
      .returns<PortalRandevuTalebiSatir[]>(),
  ]);

  const hasta = hastaSonucu.data;
  const yaklasanRandevular = yaklasanSonucu.data ?? [];
  const gecmisRandevular = gecmisSonucu.data ?? [];
  const aktifPaketler = paketSonucu.data ?? [];
  const odemeGecmisi = odemeSonucu.data ?? [];
  const randevuTalepleri = randevuTalepleriSonucu.data ?? [];

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">{hasta?.ad_soyad ?? "Portalım"}</h1>
            <p className="text-sm text-muted-foreground">{telefonGoster(hasta?.telefon)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button nativeButton={false} render={<Link href="/portal/randevu-talep">Randevu Talep Et</Link>} />
            <Button variant="outline" nativeButton={false} render={<Link href="/portal/bilgilerim">Bilgilerim</Link>} />
            <form action={portalCikisYap}>
              <Button type="submit" variant="outline">
                Çıkış yap
              </Button>
            </form>
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Aktif Paketler</CardTitle>
          </CardHeader>
          <CardContent>
            {aktifPaketler.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aktif paketiniz yok.</p>
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

        <Card>
          <CardHeader>
            <CardTitle>Yaklaşan Randevularım</CardTitle>
          </CardHeader>
          <CardContent>
            {yaklasanRandevular.length === 0 ? (
              <p className="text-sm text-muted-foreground">Yaklaşan randevunuz yok.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {yaklasanRandevular.map((r) => {
                  const talep = r.randevu_iptal_talebi;
                  return (
                    <li
                      key={r.id}
                      className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{formatDateTime(r.baslangic)}</span>
                        <span className="text-muted-foreground">
                          {r.terapist?.personel?.ad_soyad ?? "—"} · {r.oda?.ad ?? "—"} ·{" "}
                          {DURUM_ETIKET[r.durum]}
                        </span>
                      </div>
                      {r.durum === "planlandi" &&
                        (talep ? (
                          <p className="text-xs text-muted-foreground">
                            {talep.durum === "bekliyor" && "İptal talebiniz inceleniyor."}
                            {talep.durum === "onaylandi" && "İptal talebiniz onaylandı."}
                            {talep.durum === "reddedildi" && "İptal talebiniz reddedildi."}
                          </p>
                        ) : (
                          <IptalTalepButonu randevuId={r.id} />
                        ))}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {randevuTalepleri.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Randevu Taleplerim</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col divide-y divide-border">
                {randevuTalepleri.map((t) => (
                  <li key={t.id} className="flex flex-col gap-1 py-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{t.islem_tanimi?.ad ?? "—"}</span>
                      <span className="text-muted-foreground">{TALEP_DURUM_ETIKET[t.durum]}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Tercih: {formatDate(t.tercih_tarih)}
                      {t.tercih_saat ? ` · ${t.tercih_saat.slice(0, 5)}` : ""}
                    </span>
                    {t.not_metni && <span className="text-xs text-muted-foreground">Not: {t.not_metni}</span>}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Geçmiş Randevularım</CardTitle>
          </CardHeader>
          <CardContent>
            {gecmisRandevular.length === 0 ? (
              <p className="text-sm text-muted-foreground">Geçmiş randevu yok.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {gecmisRandevular.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                    <span>
                      {formatDate(r.baslangic)} · {r.terapist?.personel?.ad_soyad ?? "—"}
                    </span>
                    <span className="text-muted-foreground">{DURUM_ETIKET[r.durum]}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

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
                      </span>
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
