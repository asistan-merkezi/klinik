import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PaketSatisSatir, OdemeGecmisSatir } from "@/types/odeme";
import { YONTEM_ETIKETLERI } from "@/types/odeme";
import type { PortalRandevuSatir } from "@/types/portal";
import { portalCikisYap } from "./actions";
import { IptalTalepButonu } from "./iptal-talep-butonu";

const DURUM_ETIKET: Record<PortalRandevuSatir["durum"], string> = {
  planlandi: "Planlandı",
  geldi: "Geldi",
  iptal: "İptal",
  gelmedi: "Gelmedi",
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
    .from("musteri_kullanici")
    .select("musteri_id, aktif")
    .eq("id", user.id)
    .single();

  if (!mk?.musteri_id || !mk.aktif) {
    redirect("/portal/giris");
  }

  const musteriId = mk.musteri_id;
  const simdi = new Date().toISOString();

  const [musteriSonucu, yaklasanSonucu, gecmisSonucu, paketSonucu, odemeSonucu] = await Promise.all([
    supabase.from("musteri").select("ad_soyad, telefon").eq("id", musteriId).single(),
    supabase
      .from("randevu")
      .select(
        "id, baslangic, bitis, durum, terapist(personel(ad_soyad)), oda(ad), randevu_iptal_talebi(id, durum)"
      )
      .eq("musteri_id", musteriId)
      .gte("bitis", simdi)
      .order("baslangic")
      .returns<PortalRandevuSatir[]>(),
    supabase
      .from("randevu")
      .select(
        "id, baslangic, bitis, durum, terapist(personel(ad_soyad)), oda(ad), randevu_iptal_talebi(id, durum)"
      )
      .eq("musteri_id", musteriId)
      .lt("bitis", simdi)
      .order("baslangic", { ascending: false })
      .limit(10)
      .returns<PortalRandevuSatir[]>(),
    supabase
      .from("paket_satis")
      .select("id, kalan_adet, gecerlilik_bitis_tarihi, durum, paket(ad, seans_sayisi)")
      .eq("musteri_id", musteriId)
      .eq("durum", "aktif")
      .order("gecerlilik_bitis_tarihi")
      .returns<PaketSatisSatir[]>(),
    supabase
      .from("odeme")
      .select(
        "id, created_at, iskonto_tutari, faturali, odeme_kalemi(miktar, birim_fiyat, islem_tanimi(ad), paket_satis(paket(ad))), odeme_satiri(yontem, tutar), fatura(id, durum, e_arsiv_pdf_url, hata_mesaji)"
      )
      .eq("musteri_id", musteriId)
      .order("created_at", { ascending: false })
      .limit(20)
      .returns<OdemeGecmisSatir[]>(),
  ]);

  const musteri = musteriSonucu.data;
  const yaklasanRandevular = yaklasanSonucu.data ?? [];
  const gecmisRandevular = gecmisSonucu.data ?? [];
  const aktifPaketler = paketSonucu.data ?? [];
  const odemeGecmisi = odemeSonucu.data ?? [];

  return (
    <div className="flex-1 bg-zinc-50 dark:bg-black p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">{musteri?.ad_soyad ?? "Portalım"}</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{musteri?.telefon}</p>
          </div>
          <form action={portalCikisYap}>
            <Button type="submit" variant="outline">
              Çıkış yap
            </Button>
          </form>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Aktif Paketler</CardTitle>
          </CardHeader>
          <CardContent>
            {aktifPaketler.length === 0 ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Aktif paketiniz yok.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
                {aktifPaketler.map((ps) => (
                  <li key={ps.id} className="flex items-center justify-between py-3 text-sm">
                    <span className="font-medium">{ps.paket?.ad ?? "—"}</span>
                    <span className="text-zinc-600 dark:text-zinc-400">
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
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Yaklaşan randevunuz yok.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
                {yaklasanRandevular.map((r) => {
                  const talep = r.randevu_iptal_talebi;
                  return (
                    <li
                      key={r.id}
                      className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {new Date(r.baslangic).toLocaleString("tr-TR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <span className="text-zinc-600 dark:text-zinc-400">
                          {r.terapist?.personel?.ad_soyad ?? "—"} · {r.oda?.ad ?? "—"} ·{" "}
                          {DURUM_ETIKET[r.durum]}
                        </span>
                      </div>
                      {r.durum === "planlandi" &&
                        (talep ? (
                          <p className="text-xs text-zinc-500">
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

        <Card>
          <CardHeader>
            <CardTitle>Geçmiş Randevularım</CardTitle>
          </CardHeader>
          <CardContent>
            {gecmisRandevular.length === 0 ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Geçmiş randevu yok.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
                {gecmisRandevular.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                    <span>
                      {new Date(r.baslangic).toLocaleDateString("tr-TR")} ·{" "}
                      {r.terapist?.personel?.ad_soyad ?? "—"}
                    </span>
                    <span className="text-zinc-600 dark:text-zinc-400">{DURUM_ETIKET[r.durum]}</span>
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
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Henüz ödeme yok.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
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
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">
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
