import { Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { tumSayfalariOku } from "@/lib/supabase/sayfali-okuma";
import { ROL_GRUPLARI, sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { PageHeader } from "@/components/ui/page-header";
import type { KlinikArac, KlinikBankaHesabi, KlinikKrediKarti } from "@/types/klinik";
import type { KlinikHarcamaSatir } from "@/types/klinik-harcama";
import { YeniGiderButonu } from "./yeni-gider-butonu";
import { GiderListesi } from "./gider-listesi";
import { GiderlerSekmeCubugu } from "./giderler-sekme-cubugu";

export default async function GiderlerSayfasi() {
  const { kullanici } = await sayfaYetkisiIste(ROL_GRUPLARI.finansYonetim);
  const supabase = await createClient();

  const duzenlenebilir = kullanici.rol === "klinik_admin";

  // Dönem filtresi (Aylık/Yıllık) GiderListesi içinde tamamen client-side
  // yapılıyor — bu yüzden tüm kayıtlar tek seferde çekiliyor, dönem
  // değişince sunucuya round-trip yok.
  const [harcamaSonucu, aracSonucu, bankaSonucu, kartSonucu] = await Promise.all([
    // Sayfalı: tek sorgu 1000 kayıtta sessizce kesilir, eski dönemler boş görünürdü.
    tumSayfalariOku<KlinikHarcamaSatir>((bas, son) =>
      supabase
        .from("klinik_harcama")
        .select(
          "id, tarih, tutar, kategori, aciklama, tedarikci_adi, arac_id, odeme_tipi, banka_hesap_id, kredi_karti_id, is_faturali, fatura_no"
        )
        .order("tarih", { ascending: false })
        .order("id")
        .range(bas, son)
        .returns<KlinikHarcamaSatir[]>()
    ).then((data) => ({ data })),
    supabase.from("klinik_arac").select("id, marka, model, plaka").order("plaka").returns<KlinikArac[]>(),
    supabase
      .from("klinik_banka_hesaplari")
      .select("id, banka_adi, sube")
      .order("sort_order")
      .returns<KlinikBankaHesabi[]>(),
    supabase
      .from("klinik_kredi_kartlari")
      .select("id, kart_tipi, kart_adi, banka_adi, kart_sahibi, son_dort_hane")
      .order("sort_order")
      .returns<KlinikKrediKarti[]>(),
  ]);

  const giderler = harcamaSonucu.data ?? [];
  const araclar = aracSonucu.data ?? [];
  const bankaHesaplari = bankaSonucu.data ?? [];
  const kartlar = kartSonucu.data ?? [];
  // Tedarikçi önerileri: aynı tedarikçi farklı yazılıp cariyi bölmesin (anahtar: Türkçe küçük harf, tek boşluk).
  const tedarikciAdlari = [
    ...new Map(
      giderler
        .map((g) => (g.tedarikci_adi ?? "").trim().replace(/\s+/g, " "))
        .filter(Boolean)
        .map((ad) => [ad.toLocaleLowerCase("tr-TR"), ad] as const)
    ).values(),
  ].sort((a, b) => a.localeCompare(b, "tr-TR"));

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <PageHeader
          title="Giderler"
          description="Kira, sarf malzeme, fatura gibi genel işletme giderleri."
          icon={Wallet}
          actions={duzenlenebilir && <YeniGiderButonu
              araclar={araclar}
              bankaHesaplari={bankaHesaplari}
              kartlar={kartlar}
              tedarikciAdlari={tedarikciAdlari}
            />}
        />

        <GiderlerSekmeCubugu />

        <GiderListesi
          satirlar={giderler}
          duzenlenebilir={duzenlenebilir}
          araclar={araclar}
          bankaHesaplari={bankaHesaplari}
          kartlar={kartlar}
          tedarikciAdlari={tedarikciAdlari}
        />
      </div>
    </div>
  );
}
