import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PaketSatisSatir } from "@/types/odeme";
import type { HastaBakiyeHareket } from "@/types/hasta-detay";
import type { IskontoOranlariYuzde } from "@/lib/fiyat/etkin-fiyat-hesapla";
import type { FaturaBilgisiKontrol } from "@/lib/fatura/eksik-bilgi";
import { GeriLink } from "../geri-link";
import { CariOdemeSekmesi } from "../sekmeler/cari-odeme-sekmesi";
import { getAuthUser, hastaTemelGetir, kullaniciRolGetir } from "../hasta-getir";

export default async function CariOdemeSayfasi({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getAuthUser();

  if (!user) {
    redirect("/giris");
  }

  const hasta = await hastaTemelGetir(id);
  if (!hasta) {
    notFound();
  }

  const rol = await kullaniciRolGetir(user.id);
  if (rol === "terapist") {
    redirect(`/panel/hastalar/${id}`);
  }
  const duzenlenebilir = rol === "klinik_admin" || rol === "resepsiyon";

  const supabase = await createClient();
  const [paketSatisSonucu, bakiyeHareketSonucu, oranlarSonucu, ozetSonucu, epostaSonucu, hassasSonucu] =
    await Promise.all([
    supabase
      .from("paket_satis")
      .select("id, kalan_adet, gecerlilik_bitis_tarihi, durum, paket(ad, seans_sayisi)")
      .eq("hasta_id", id)
      .eq("durum", "aktif")
      .order("gecerlilik_bitis_tarihi")
      .returns<PaketSatisSatir[]>(),
    supabase
      .from("hasta_bakiye_hareket")
      .select(
        "id, tur, tutar, iskonto_tutari, aciklama, created_at, odeme_id, " +
          "randevu(terapist(personel(ad_soyad)), islem_tanimi(ad, vita_fiyat)), " +
          "odeme(iskonto_tutari, odeme_kalemi(miktar, birim_fiyat, islem_tanimi(ad, vita_fiyat), paket_satis(paket(ad))), odeme_satiri(yontem)), " +
          "iskonto_uygulayan:iskonto_uygulayan_kullanici_id(ad_soyad)"
      )
      .eq("hasta_id", id)
      .order("created_at", { ascending: false })
      .limit(30)
      .returns<HastaBakiyeHareket[]>(),
    supabase
      .from("iskonto_oranlari")
      .select("plus_pct, elit_pct, prime_pct")
      .maybeSingle<IskontoOranlariYuzde>(),
    supabase.from("v_hasta_ozet").select("bakiye").eq("hasta_id", id).maybeSingle<{ bakiye: number }>(),
    supabase.from("hasta").select("eposta").eq("id", id).single<{ eposta: string | null }>(),
    supabase
      .from("hasta_hassas")
      .select("kimlik_no, adres")
      .eq("hasta_id", id)
      .maybeSingle<{ kimlik_no: string | null; adres: string | null }>(),
  ]);

  const aktifPaketler = paketSatisSonucu.data ?? [];
  const bakiyeHareketleri = bakiyeHareketSonucu.data ?? [];
  const oranlar = oranlarSonucu.data ?? null;
  const guncelBakiye = ozetSonucu.data?.bakiye ?? 0;
  const faturaBilgisi: FaturaBilgisiKontrol = {
    adSoyad: hasta.ad_soyad,
    eposta: epostaSonucu.data?.eposta ?? null,
    adres: hassasSonucu.data?.adres ?? null,
    kimlikNo: hassasSonucu.data?.kimlik_no ?? null,
  };

  return (
    <div className="flex flex-col gap-3">
      <GeriLink hastaId={id} baslik="Cari & Ödeme" />
      <CariOdemeSekmesi
        hastaId={hasta.id}
        hastaAdSoyad={hasta.ad_soyad}
        hastaKategori={hasta.kategori}
        iskontoOranlari={oranlar}
        guncelBakiye={guncelBakiye}
        duzenlenebilir={duzenlenebilir}
        aktifPaketler={aktifPaketler}
        bakiyeHareketleri={bakiyeHareketleri}
        faturaBilgisi={faturaBilgisi}
      />
    </div>
  );
}
