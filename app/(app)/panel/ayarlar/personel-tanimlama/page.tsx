import { Briefcase } from "lucide-react";
import { eq } from "drizzle-orm";
import { sema, withTenant } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import type { Pozisyon } from "@/types/pozisyon";
import { PozisyonlarListesi } from "./pozisyonlar-listesi";
import { OzelPozisyonDialog } from "./ozel-pozisyon-dialog";

export default async function PersonelTanimlamaSayfasi() {
  const { ctx, bag } = await panelBaglami();
  const duzenlenebilir = ctx.rol === "klinik_admin";

  const v = await withTenant(bag, async (tx) => ({
    pozisyon: await tx
      .select({ id: sema.pozisyonlar.id, ad: sema.pozisyonlar.ad, grup: sema.pozisyonlar.grup, sira: sema.pozisyonlar.sira, aktif: sema.pozisyonlar.aktif, sistem_erisimi: sema.pozisyonlar.sistemErisimi, varsayilan_rol: sema.pozisyonlar.varsayilanRol, ucret_tipi: sema.pozisyonlar.ucretTipi, puantaj_modu: sema.pozisyonlar.puantajModu, ozel_mi: sema.pozisyonlar.ozelMi })
      .from(sema.pozisyonlar),
    personel: await tx.select({ pozisyon_id: sema.personel.pozisyonId }).from(sema.personel).where(eq(sema.personel.aktif, true)),
  }));
  const pozisyonlar = v.pozisyon as Pozisyon[];
  const personelSonucu = v.personel;

  // Özel Pozisyon Ekle'deki Departman seçimi — mevcut pozisyonlardaki grup
  // adlarından türetilir (sabit bir liste değil, katalog değişirse otomatik
  // güncellenir), listedeki sıralamayla aynı (en küçük sıraya göre).
  const departmanSiralari = new Map<string, number>();
  for (const poz of pozisyonlar) {
    const mevcut = departmanSiralari.get(poz.grup);
    if (mevcut === undefined || poz.sira < mevcut) departmanSiralari.set(poz.grup, poz.sira);
  }
  const departmanlar = [...departmanSiralari.entries()].sort((a, b) => a[1] - b[1]).map(([grup]) => grup);

  // "Deneme İçin Oluştur" kısayolu sadece aktif ama hiç aktif çalışanı olmayan
  // pozisyonlarda gösterilir (bkz. pozisyon-satiri.tsx).
  const calisaniOlanPozisyonIdleri = [
    ...new Set(personelSonucu.map((p) => p.pozisyon_id).filter((id): id is string => id !== null)),
  ];

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          icon={Briefcase}
          title="Personel Tanımlama"
          description="İşletmenizde çalışılan departman/unvanları seçin. Aktif olanlar Personel ve Yetkilendirme'de kullanılabilir olur; sistem erişimi olup olmayacağını da buradan belirleyin."
          actions={duzenlenebilir && <OzelPozisyonDialog departmanlar={departmanlar} />}
        />

        {pozisyonlar.length === 0 ? (
          <EmptyState icon={Briefcase} title="Henüz pozisyon tanımlı değil." />
        ) : (
          <PozisyonlarListesi
            pozisyonlar={pozisyonlar}
            duzenlenebilir={duzenlenebilir}
            calisaniOlanPozisyonIdleri={calisaniOlanPozisyonIdleri}
          />
        )}
      </div>
    </div>
  );
}
