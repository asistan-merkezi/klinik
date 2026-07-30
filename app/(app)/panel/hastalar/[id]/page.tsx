import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import type { HastaDetay } from "@/types/hasta";
import type { HastaOzet, HastaBakiyeHareket } from "@/types/hasta-detay";
import type { SatilabilirUrun, PaketSatisSatir, OdemeGecmisSatir } from "@/types/odeme";
import type { PeriyodikRandevuSatir } from "@/types/periyodik-randevu";
import { HastaDetayIcerik } from "./hasta-detay-icerik";

export default async function HastaDetaySayfasi({
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

  const { data: hasta } = await supabase
    .from("hasta")
    .select(
      "id, ad_soyad, telefon, dogum_tarihi, kvkk_onay_tarihi, whatsapp_izin_durumu, cinsiyet, eposta, referans_kanali, ozel_nitelikli_veri_onay_tarihi, ticari_ileti_onay_tarihi, risk_bayraklari"
    )
    .eq("id", id)
    .single<HastaDetay>();

  if (!hasta) {
    notFound();
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("rol")
    .eq("id", user.id)
    .single();

  const rol = kullanici?.rol ?? null;
  const duzenlenebilir = rol === "klinik_admin" || rol === "resepsiyon";

  const [
    hastaKullaniciSonucu,
    ozetSonucu,
    paketSatisSonucu,
    odemeSonucu,
    islemTanimiSonucu,
    paketSonucu,
    periyodikRandevuSonucu,
    bakiyeHareketSonucu,
  ] = await Promise.all([
    supabase.from("hasta_kullanici").select("aktif").eq("hasta_id", id).maybeSingle(),
    supabase.from("v_hasta_ozet").select("*").eq("hasta_id", id).maybeSingle<HastaOzet>(),
    supabase
      .from("paket_satis")
      .select("id, kalan_adet, gecerlilik_bitis_tarihi, durum, paket(ad, seans_sayisi)")
      .eq("hasta_id", id)
      .eq("durum", "aktif")
      .order("gecerlilik_bitis_tarihi")
      .returns<PaketSatisSatir[]>(),
    supabase
      .from("odeme")
      .select(
        "id, created_at, iskonto_tutari, faturali, odeme_kalemi(miktar, birim_fiyat, islem_tanimi(ad), paket_satis(paket(ad))), odeme_satiri(yontem, tutar), fatura(id, durum, e_arsiv_pdf_url, hata_mesaji)"
      )
      .eq("hasta_id", id)
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
      .eq("hasta_id", id)
      .eq("durum", "aktif")
      .order("haftanin_gunu")
      .returns<PeriyodikRandevuSatir[]>(),
    supabase
      .from("hasta_bakiye_hareket")
      .select("id, tur, tutar, aciklama, created_at")
      .eq("hasta_id", id)
      .order("created_at", { ascending: false })
      .limit(30)
      .returns<HastaBakiyeHareket[]>(),
  ]);

  const hastaKullanici = hastaKullaniciSonucu.data;
  const ozet = ozetSonucu.data;
  const aktifPaketler = paketSatisSonucu.data ?? [];
  const odemeGecmisi = odemeSonucu.data ?? [];
  const periyodikRandevular = periyodikRandevuSonucu.data ?? [];
  const bakiyeHareketleri = bakiyeHareketSonucu.data ?? [];

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
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <div className="flex justify-end">
          <Button variant="outline" nativeButton={false} render={<Link href="/panel/hastalar">Hastalara dön</Link>} />
        </div>

        <HastaDetayIcerik
          hasta={hasta}
          ozet={ozet}
          rol={rol}
          duzenlenebilir={duzenlenebilir}
          portalDurumu={{ var: hastaKullanici != null, aktif: hastaKullanici?.aktif ?? false }}
          periyodikRandevular={periyodikRandevular}
          aktifPaketler={aktifPaketler}
          satilabilirUrunler={satilabilirUrunler}
          odemeGecmisi={odemeGecmisi}
          bakiyeHareketleri={bakiyeHareketleri}
        />
      </div>
    </div>
  );
}
