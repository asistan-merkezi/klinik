import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SatilabilirUrun, PaketSatisSatir, OdemeGecmisSatir } from "@/types/odeme";
import type { HastaBakiyeHareket } from "@/types/hasta-detay";
import { GeriLink } from "../geri-link";
import { CariOdemeSekmesi } from "../sekmeler/cari-odeme-sekmesi";
import { hastaTemelGetir, kullaniciRolGetir } from "../hasta-getir";

export default async function CariOdemeSayfasi({
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

  const hasta = await hastaTemelGetir(supabase, id);
  if (!hasta) {
    notFound();
  }

  const rol = await kullaniciRolGetir(supabase, user.id);
  if (rol === "terapist") {
    redirect(`/panel/hastalar/${id}`);
  }
  const duzenlenebilir = rol === "klinik_admin" || rol === "resepsiyon";

  const [paketSatisSonucu, odemeSonucu, islemTanimiSonucu, paketSonucu, bakiyeHareketSonucu] =
    await Promise.all([
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
        .from("hasta_bakiye_hareket")
        .select("id, tur, tutar, aciklama, created_at")
        .eq("hasta_id", id)
        .order("created_at", { ascending: false })
        .limit(30)
        .returns<HastaBakiyeHareket[]>(),
    ]);

  const aktifPaketler = paketSatisSonucu.data ?? [];
  const odemeGecmisi = odemeSonucu.data ?? [];
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
    <div className="flex flex-col gap-3">
      <GeriLink hastaId={id} baslik="Cari & Ödeme" />
      <CariOdemeSekmesi
        hastaId={hasta.id}
        duzenlenebilir={duzenlenebilir}
        aktifPaketler={aktifPaketler}
        satilabilirUrunler={satilabilirUrunler}
        odemeGecmisi={odemeGecmisi}
        bakiyeHareketleri={bakiyeHareketleri}
      />
    </div>
  );
}
