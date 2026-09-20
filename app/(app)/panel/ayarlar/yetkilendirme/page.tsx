import { redirect } from "next/navigation";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import type { Pozisyon } from "@/types/pozisyon";
import { PozisyonIzinListesi } from "./pozisyon-izin-listesi";

export default async function YetkilendirmeSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("rol, klinik_id").eq("id", user.id).single();
  const duzenlenebilir = kullanici?.rol === "klinik_admin";

  const { data: pozisyonSonucu } = await supabase
    .from("pozisyonlar")
    .select("id, ad, grup, sira, aktif, sistem_erisimi, varsayilan_rol, ucret_tipi, puantaj_modu, ozel_mi, allowed_modules")
    .returns<Pozisyon[]>();

  const pozisyonlar = pozisyonSonucu ?? [];

  // Departman sekmeleri Personel Tanımlama'daki gruplarla birebir aynı kaynaktan
  // (pozisyonlar.grup) türetiliyor — sıralama o gruptaki en küçük `sira`ya göre.
  const departmanSiralari = new Map<string, number>();
  const pozisyonlarByDepartman: Record<string, Pozisyon[]> = {};
  for (const poz of pozisyonlar) {
    const mevcut = departmanSiralari.get(poz.grup);
    if (mevcut === undefined || poz.sira < mevcut) departmanSiralari.set(poz.grup, poz.sira);
    (pozisyonlarByDepartman[poz.grup] ??= []).push(poz);
  }
  for (const liste of Object.values(pozisyonlarByDepartman)) {
    liste.sort((a, b) => a.sira - b.sira);
  }
  const departmanlar = [...departmanSiralari.entries()].sort((a, b) => a[1] - b[1]).map(([grup]) => grup);

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          icon={ShieldCheck}
          title="Yetkilendirme"
          description="Her pozisyonun hangi modüllere erişeceğini belirleyin — sidebar görünürlüğü ve sayfa erişimi buradan beslenir. Departman/pozisyon eklemek, çıkarmak ve aktif-pasif etmek Ayarlar → Personel Tanımlama'dan yapılır."
        />

        <Card>
          <CardHeader>
            <CardTitle>Modül İzinleri</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Bir pozisyon seçip &quot;İzinleri Düzenle&quot;ye tıklayarak o pozisyondaki kişilerin hangi modüllere
              erişeceğini belirleyin. Bir kullanıcıya pozisyonundan farklı özel yetki tanımlamak için Personel
              formundaki &quot;Sistem Yetkileri&quot; adımını kullanın.
            </p>
            <PozisyonIzinListesi
              departmanlar={departmanlar}
              pozisyonlarByDepartman={pozisyonlarByDepartman}
              duzenlenebilir={duzenlenebilir}
            />
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              nativeButton={false}
              render={<Link href="/panel/ayarlar/personel-tanimlama">Personel Tanımlama&apos;ya git</Link>}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
