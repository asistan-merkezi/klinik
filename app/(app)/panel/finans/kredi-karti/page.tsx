import { redirect } from "next/navigation";
import { CreditCard } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import type { LedgerSatiri } from "@/types/nakit-banka-hareketi";
import { KrediKartiLedger } from "./kredi-karti-ledger";

type HastaOdemeSatiri = { id: string; created_at: string; tutar: number; hasta: { ad_soyad: string } | null };
type HarcamaSatiri = { id: string; tarih: string; tutar: number; tedarikci_adi: string | null; kategori: string };

/**
 * Kredi kartı üçüncü bir ödeme rayı (nakit/havale'nin yanında) ama Kasa
 * sadece odeme_yontemi='nakit', Banka sadece 'banka_havalesi' okuyordu —
 * kredi kartıyla alınan tahsilat/yapılan gider hasta cari kaydına ve
 * klinik_harcama'ya doğru düşüyordu ama hiçbir mutabakat ekranında
 * görünmüyordu (kullanıcı sorusu: "kredi kartıyla tahsilat nereye kayıt
 * alınıyor" — canlı testte doğrulandı). Kasa/Banka'nın aksine burada manuel
 * hareket girişi YOK: nakit_banka_hareketi şeması kart bacağı taşımıyor,
 * kart için "elden" bir kasa kavramı da yok — salt okunur mutabakat yeterli.
 */
export default async function KrediKartiSayfasi({ searchParams }: { searchParams: Promise<{ yil?: string }> }) {
  const { yil: yilParam } = await searchParams;
  const simdikiYil = new Date().getFullYear();
  const secilenYil = yilParam && /^\d{4}$/.test(yilParam) ? Number(yilParam) : simdikiYil;
  const yilBaslangicTarih = `${secilenYil}-01-01`;
  const yilBitisTarih = `${secilenYil + 1}-01-01`;
  const yilBaslangicTs = `${yilBaslangicTarih}T00:00:00.000Z`;
  const yilBitisTs = `${yilBitisTarih}T00:00:00.000Z`;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("rol, klinik_id")
    .eq("id", user.id)
    .single();

  const yetkili =
    kullanici?.rol === "klinik_admin" || kullanici?.rol === "muhasebe" || kullanici?.rol === "super_admin";

  if (!yetkili) {
    redirect("/panel");
  }

  const [hastaOdemeSonucu, harcamaSonucu, oncekiToplamSonucu] = await Promise.all([
    supabase
      .from("hasta_bakiye_hareket")
      .select("id, created_at, tutar, hasta:hasta_id(ad_soyad)")
      .eq("tur", "odeme")
      .eq("odeme_yontemi", "kredi_karti")
      .gte("created_at", yilBaslangicTs)
      .lt("created_at", yilBitisTs)
      .returns<HastaOdemeSatiri[]>(),
    supabase
      .from("klinik_harcama")
      .select("id, tarih, tutar, tedarikci_adi, kategori")
      .eq("odeme_tipi", "kredi_karti")
      .gte("tarih", yilBaslangicTarih)
      .lt("tarih", yilBitisTarih)
      .returns<HarcamaSatiri[]>(),
    supabase.rpc("kredi_karti_bakiye_once_toplam", { p_once_tarih: yilBaslangicTarih }),
  ]);

  const gelenRows: LedgerSatiri[] = (hastaOdemeSonucu.data ?? []).map((h) => ({
    tarih: h.created_at.slice(0, 10),
    tutar: h.tutar,
    etiket: "Hasta ödemesi",
    taraf: h.hasta?.ad_soyad ?? "Hasta",
  }));

  const gidenRows: LedgerSatiri[] = (harcamaSonucu.data ?? []).map((g) => ({
    tarih: g.tarih,
    tutar: g.tutar,
    etiket: g.tedarikci_adi ?? g.kategori,
    taraf: g.tedarikci_adi ?? undefined,
  }));

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          title="Kredi Kartı"
          description="POS ile alınan tahsilatlar ve kartla yapılan giderlerin mutabakatı."
          icon={CreditCard}
        />

        <KrediKartiLedger
          gelenRows={gelenRows}
          gidenRows={gidenRows}
          openingBalance={oncekiToplamSonucu.data ?? 0}
          yil={secilenYil}
        />
      </div>
    </div>
  );
}
