import { Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { tumSayfalariOku } from "@/lib/supabase/sayfali-okuma";
import { ROL_GRUPLARI, sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { PageHeader } from "@/components/ui/page-header";
import type { KlinikHarcamaSatir } from "@/types/klinik-harcama";
import { GiderlerSekmeCubugu } from "../giderler-sekme-cubugu";
import { TedarikciListesi, type TedarikciOzeti } from "./tedarikci-listesi";

type HarcamaSatiri = Pick<
  KlinikHarcamaSatir,
  "id" | "tarih" | "tutar" | "kategori" | "aciklama" | "tedarikci_adi" | "odeme_tipi" | "fatura_no"
>;

/** "Ofis  Market" / "ofis market" aynı tedarikçi sayılsın diye (Türkçe küçük harf, tek boşluk). */
const tedarikciAnahtari = (ad: string) => ad.trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR");

/**
 * Tedarikçi bazında cari özet: `klinik_harcama.tedarikci_adi`ndan gruplanır (ayrı tedarikçi tablosu yok).
 * Giderler şu an ödeme anında girildiği için "bakiye/borç" kavramı yok; burada her tedarikçiye
 * ödenen toplam ve hareket dökümü izlenir (tüm zamanlar).
 */
export default async function TedarikcilerSayfasi() {
  await sayfaYetkisiIste(ROL_GRUPLARI.finansYonetim);
  const supabase = await createClient();

  // Sayfalı: tek sorgu 1000 kayıtta sessizce kesilir.
  const satirlar = await tumSayfalariOku<HarcamaSatiri>((bas, son) =>
    supabase
      .from("klinik_harcama")
      .select("id, tarih, tutar, kategori, aciklama, tedarikci_adi, odeme_tipi, fatura_no")
      .not("tedarikci_adi", "is", null)
      .neq("tedarikci_adi", "")
      .order("tarih", { ascending: false })
      .order("id")
      .range(bas, son)
      .returns<HarcamaSatiri[]>()
  );

  const gruplar = new Map<string, TedarikciOzeti>();
  for (const s of satirlar) {
    const ad = (s.tedarikci_adi ?? "").trim();
    if (!ad) continue;
    const anahtar = tedarikciAnahtari(ad);
    let grup = gruplar.get(anahtar);
    if (!grup) {
      // Satırlar tarihe göre azalan geldiği için ilk görülen yazım en güncel olanıdır.
      grup = { anahtar, ad, toplam: 0, sonTarih: s.tarih, hareketler: [] };
      gruplar.set(anahtar, grup);
    }
    grup.toplam += s.tutar;
    grup.hareketler.push({
      id: s.id,
      tarih: s.tarih,
      tutar: s.tutar,
      kategori: s.kategori,
      aciklama: s.aciklama,
      odeme_tipi: s.odeme_tipi,
      fatura_no: s.fatura_no,
    });
  }

  const tedarikciler = [...gruplar.values()].sort((a, b) => b.toplam - a.toplam);

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <PageHeader
          title="Tedarikçiler ve Cari Takibi"
          description="Tedarikçi bazında yapılan ödemelerin toplamı ve hareket dökümü."
          icon={Truck}
        />

        <GiderlerSekmeCubugu />

        <TedarikciListesi tedarikciler={tedarikciler} />
      </div>
    </div>
  );
}
