import { redirect } from "next/navigation";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import type { Pozisyon } from "@/types/pozisyon";
import { SIDEBAR_GIZLI_VARSAYILAN_DEPARTMAN } from "@/lib/panel/menu-gruplari";
import { SidebarYetkiFormu } from "./sidebar-yetki-formu";

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

  const [{ data: pozisyonlar }, { data: klinikAyarlar }] = await Promise.all([
    // Departman sekmeleri Personel Tanımlama'daki departmanlarla birebir
    // aynı olsun diye aynı kaynaktan (pozisyonlar.grup) türetiliyor.
    supabase
      .from("pozisyonlar")
      .select("ad, grup, sira")
      .order("sira")
      .returns<Pick<Pozisyon, "ad" | "grup" | "sira">[]>(),
    supabase.from("klinik_ayarlar").select("ayarlar").eq("klinik_id", kullanici?.klinik_id ?? "").maybeSingle(),
  ]);

  const liste = pozisyonlar ?? [];

  const departmanSiralari = new Map<string, number>();
  for (const poz of liste) {
    const mevcut = departmanSiralari.get(poz.grup);
    if (mevcut === undefined || poz.sira < mevcut) departmanSiralari.set(poz.grup, poz.sira);
  }
  const departmanAdlari = [...departmanSiralari.entries()].sort((a, b) => a[1] - b[1]).map(([grup]) => grup);

  // Başlığın yanında görünen "(İşletme Ortağı, Klinik Yöneticisi)" gibi liste —
  // departman sekmesi de aktif/pasif ayrımı yapmadan tüm pozisyonlardan
  // türetildiği için (yukarıdaki departmanAdlari) burada da aynı kaynak
  // kullanılıyor, yoksa hiç aktif pozisyonu olmayan bir departman sekmesi
  // görünüp yanındaki liste boş kalıyordu.
  const departmanPozisyonlari = new Map<string, string[]>();
  for (const poz of [...liste].sort((a, b) => a.sira - b.sira)) {
    const mevcut = departmanPozisyonlari.get(poz.grup) ?? [];
    mevcut.push(poz.ad);
    departmanPozisyonlari.set(poz.grup, mevcut);
  }
  const departmanRolleri: Record<string, string[]> = Object.fromEntries(
    departmanAdlari.map((d) => [d, departmanPozisyonlari.get(d) ?? []])
  );

  const sidebarGizliKayitli =
    ((klinikAyarlar?.ayarlar as Record<string, unknown> | null)?.sidebar_gizli as
      | Record<string, string[]>
      | undefined) ?? {};
  const baslangicGizli: Record<string, string[]> = Object.fromEntries(
    departmanAdlari.map((d) => [d, sidebarGizliKayitli[d] ?? SIDEBAR_GIZLI_VARSAYILAN_DEPARTMAN[d] ?? []])
  );

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          icon={ShieldCheck}
          title="Yetkilendirme"
          description="Departmanlara göre sidebar menü erişimini yönetin. Departman/pozisyon eklemek, çıkarmak ve aktif-pasif etmek Ayarlar → Personel Tanımlama'dan yapılır."
        />

        <Card>
          <CardHeader>
            <CardTitle>Departman Yetkilendirmesi</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Bir departman seçip hangi menülerin o departmandaki kişilere görüneceğini belirleyin. Bir kişinin
              hangi departmanda sayıldığı, Personel Tanımlama&apos;da bağlı olduğu pozisyona göre belirlenir.
            </p>
            <SidebarYetkiFormu
              departmanlar={departmanAdlari}
              departmanRolleri={departmanRolleri}
              baslangicGizli={baslangicGizli}
              duzenlenebilir={duzenlenebilir}
            />
            <p className="text-xs text-muted-foreground">
              Not: bu anahtarlar sadece sol menüdeki linki gizler/gösterir — sayfaların kendi erişim kontrolü
              (klinik_admin, resepsiyon, terapist, muhasebe rollerine göre) ayrı ve değişmedi.
            </p>
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
