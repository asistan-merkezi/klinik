import { redirect } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, Briefcase } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { ROL_SECENEKLERI } from "@/types/personel";
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
    // Personel Tanımlama'yla BİREBİR aynı liste — aktif/pasif filtresi YOK,
    // departman isimleri ve içerik iki sayfada da tutarlı kalsın diye.
    supabase
      .from("pozisyonlar")
      .select("id, ad, grup, sira, aktif, sistem_erisimi, varsayilan_rol, ucret_tipi, puantaj_modu, ozel_mi")
      .order("sira")
      .returns<Pozisyon[]>(),
    supabase.from("klinik_ayarlar").select("ayarlar").eq("klinik_id", kullanici?.klinik_id ?? "").maybeSingle(),
  ]);

  const liste = pozisyonlar ?? [];

  // Personel Tanımlama'yla aynı gruplama: departman (grup), en küçük sıraya
  // göre sıralı.
  const departmanGruplari = new Map<string, Pozisyon[]>();
  for (const poz of liste) {
    const grup = departmanGruplari.get(poz.grup) ?? [];
    grup.push(poz);
    departmanGruplari.set(poz.grup, grup);
  }
  const departmanAdlari = [...departmanGruplari.keys()].sort((a, b) => {
    const minA = Math.min(...(departmanGruplari.get(a) ?? []).map((p) => p.sira));
    const minB = Math.min(...(departmanGruplari.get(b) ?? []).map((p) => p.sira));
    return minA - minB;
  });

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
          description="Personel Tanımlama'daki tüm departman ve pozisyonları, hangi role ve sistem erişimine bağlı olduklarıyla birlikte gösterir. Ekleme/çıkarma ve aktif-pasif değişikliği Ayarlar → Personel Tanımlama'dan yapılır."
        />

        <Card>
          <CardHeader>
            <CardTitle>Sidebar Menü Görünürlüğü</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Departman bazlı — bir kişinin hangi menüleri göreceği, Personel Tanımlama&apos;da bağlı olduğu
              departmana göre belirlenir (kişinin sistem rolüne göre değil).
            </p>
            <SidebarYetkiFormu
              departmanlar={departmanAdlari}
              baslangicGizli={baslangicGizli}
              duzenlenebilir={duzenlenebilir}
            />
          </CardContent>
        </Card>

        {liste.length === 0 ? (
          <EmptyState icon={Briefcase} title="Henüz pozisyon tanımlı değil." />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Departmanlar ve Pozisyonlar</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {departmanAdlari.map((departman) => {
                const gruptakiler = (departmanGruplari.get(departman) ?? []).sort((a, b) => a.sira - b.sira);
                return (
                  <div key={departman} className="flex flex-col gap-2">
                    <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {departman}
                    </h2>
                    <ul className="flex flex-col divide-y divide-border">
                      {gruptakiler.map((poz) => (
                        <li key={poz.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                          <div className="flex flex-col">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`font-medium ${poz.aktif ? "" : "text-muted-foreground line-through"}`}>
                                {poz.ad}
                              </span>
                              {!poz.aktif && <StatusBadge tone="rose">Pasif</StatusBadge>}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {ROL_SECENEKLERI.find((r) => r.value === poz.varsayilan_rol)?.label}
                            </span>
                          </div>
                          <StatusBadge tone={poz.sistem_erisimi ? "emerald" : "slate"}>
                            {poz.sistem_erisimi ? "Sistem erişimi var" : "Sistem erişimi yok"}
                          </StatusBadge>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Kapsam Notu</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              Yukarıdaki anahtarlar sadece sol menüdeki linki gizler/gösterir. Sayfaların kendi erişim kontrolü
              (klinik_admin, resepsiyon, terapist, muhasebe rollerine göre) ayrı ve değişmedi — bir menüyü açık
              bırakmak, o sayfaya rolün zaten erişimi yoksa erişim kazandırmaz; kapatmak da linki gizler, adresi
              doğrudan yazan biri sayfanın kendi kuralına tabi kalır.
            </p>
            <Button variant="outline" size="sm" className="w-fit" nativeButton={false} render={<Link href="/panel/ayarlar/personel-tanimlama">Personel Tanımlama&apos;ya git</Link>} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
