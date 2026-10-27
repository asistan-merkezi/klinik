import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { oturumBaglami } from "@/lib/auth/gecerli-kullanici";
import { tenantGerekli } from "@/lib/auth/oturum";
import { sema, withTenant } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import type { KlinikArac, KlinikBankaHesabiDetay, KlinikKrediKarti, KrediKartiTahsilatAyari, SirketBilgileri } from "@/types/klinik";
import { SirketBilgileriFormu } from "./sirket-bilgileri-formu";
import { AraclarKarti } from "./araclar-karti";
import { BankaHesaplariKarti } from "./banka-hesaplari-karti";
import { KrediKartlariKarti } from "./kredi-kartlari-karti";

export default async function SirketBilgileriSayfasi() {
  const ctx = await oturumBaglami();
  if (!ctx || ctx.tur !== "personel") {
    redirect("/giris");
  }

  const duzenlenebilir = ctx.rol === "klinik_admin";

  let bilgiler: SirketBilgileri | null = null;
  let araclar: KlinikArac[] = [];
  let bankaHesaplari: KlinikBankaHesabiDetay[] = [];
  let krediKartlari: KlinikKrediKarti[] = [];
  let tahsilatAyariSonuc: KrediKartiTahsilatAyari | null = null;

  if (ctx.tenantId) {
    const klinikId = ctx.tenantId;
    const [k, a, b, kk] = await withTenant(tenantGerekli(ctx), (tx) =>
      Promise.all([
        tx
          .select({
            ad: sema.klinik.ad,
            unvan: sema.klinik.unvan,
            il: sema.klinik.il,
            ilce: sema.klinik.ilce,
            mahalle: sema.klinik.mahalle,
            adres: sema.klinik.adres,
            vergi_dairesi: sema.klinik.vergiDairesi,
            vergi_no: sema.klinik.vergiNo,
            telefon: sema.klinik.telefon,
            whatsapp_no: sema.klinik.whatsappNo,
            eposta: sema.klinik.eposta,
            yetkili_kisi: sema.klinik.yetkiliKisi,
            yetkili_telefon: sema.klinik.yetkiliTelefon,
            yetkili_eposta: sema.klinik.yetkiliEposta,
            logo_url: sema.klinik.logoUrl,
            logo_url_koyu: sema.klinik.logoUrlKoyu,
            hafta_ici_baslangic: sema.klinik.haftaIciBaslangic,
            hafta_ici_bitis: sema.klinik.haftaIciBitis,
            cumartesi_baslangic: sema.klinik.cumartesiBaslangic,
            cumartesi_bitis: sema.klinik.cumartesiBitis,
            pazar_baslangic: sema.klinik.pazarBaslangic,
            pazar_bitis: sema.klinik.pazarBitis,
            kart_banka: sema.klinik.krediKartiTahsilatBankaHesapId,
            kart_oran: sema.klinik.krediKartiKomisyonOrani,
          })
          .from(sema.klinik)
          .where(eq(sema.klinik.id, klinikId))
          .limit(1),
        tx
          .select({ id: sema.klinikArac.id, marka: sema.klinikArac.marka, model: sema.klinikArac.model, plaka: sema.klinikArac.plaka })
          .from(sema.klinikArac)
          .where(eq(sema.klinikArac.klinikId, klinikId))
          .orderBy(asc(sema.klinikArac.createdAt)),
        tx
          .select({
            id: sema.klinikBankaHesaplari.id,
            banka_adi: sema.klinikBankaHesaplari.bankaAdi,
            sube: sema.klinikBankaHesaplari.sube,
            hesap_sahibi: sema.klinikBankaHesaplari.hesapSahibi,
            iban: sema.klinikBankaHesaplari.iban,
            hesap_tipi: sema.klinikBankaHesaplari.hesapTipi,
          })
          .from(sema.klinikBankaHesaplari)
          .where(eq(sema.klinikBankaHesaplari.klinikId, klinikId))
          .orderBy(asc(sema.klinikBankaHesaplari.sortOrder)),
        tx
          .select({
            id: sema.klinikKrediKartlari.id,
            kart_tipi: sema.klinikKrediKartlari.kartTipi,
            kart_adi: sema.klinikKrediKartlari.kartAdi,
            banka_adi: sema.klinikKrediKartlari.bankaAdi,
            kart_sahibi: sema.klinikKrediKartlari.kartSahibi,
            son_dort_hane: sema.klinikKrediKartlari.sonDortHane,
          })
          .from(sema.klinikKrediKartlari)
          .where(eq(sema.klinikKrediKartlari.klinikId, klinikId))
          .orderBy(asc(sema.klinikKrediKartlari.sortOrder)),
      ])
    );
    if (k[0]) {
      const { kart_banka, kart_oran, ...sirket } = k[0];
      bilgiler = sirket as SirketBilgileri;
      tahsilatAyariSonuc = { kredi_karti_tahsilat_banka_hesap_id: kart_banka, kredi_karti_komisyon_orani: Number(kart_oran) };
    }
    araclar = a;
    bankaHesaplari = b as KlinikBankaHesabiDetay[];
    krediKartlari = kk as KlinikKrediKarti[];
  }

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader icon={Building2} title="Şirket Bilgileri" description="Fatura ve kurumsal iletişimde kullanılan şirket profili." />

        <Card>
          <CardHeader>
            <CardTitle>Kurumsal Bilgiler</CardTitle>
          </CardHeader>
          <CardContent>
            {duzenlenebilir ? (
              <SirketBilgileriFormu bilgiler={bilgiler} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Bu bilgileri yalnızca klinik yöneticisi düzenleyebilir.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Araçlar</CardTitle>
          </CardHeader>
          <CardContent>
            <AraclarKarti araclar={araclar} duzenlenebilir={duzenlenebilir} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Banka Hesapları</CardTitle>
          </CardHeader>
          <CardContent>
            <BankaHesaplariKarti bankaHesaplari={bankaHesaplari} duzenlenebilir={duzenlenebilir} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Kredi Kartları</CardTitle>
          </CardHeader>
          <CardContent>
            <KrediKartlariKarti
              krediKartlari={krediKartlari}
              bankaHesaplari={bankaHesaplari}
              tahsilatAyari={tahsilatAyariSonuc}
              duzenlenebilir={duzenlenebilir}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
