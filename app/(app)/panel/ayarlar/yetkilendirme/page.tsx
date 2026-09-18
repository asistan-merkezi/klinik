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

export default async function YetkilendirmeSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  // Sadece AKTİF pozisyonlar gösterilir — bir pozisyon Ayarlar → Personel
  // Tanımlama'da pasife alındığında burada da otomatik kaybolur (o görev
  // artık firmada çalışmıyor sayılır).
  const { data: pozisyonlar } = await supabase
    .from("pozisyonlar")
    .select("id, ad, grup, sira, aktif, sistem_erisimi, varsayilan_rol, ucret_tipi, puantaj_modu, ozel_mi")
    .eq("aktif", true)
    .order("sira")
    .returns<Pozisyon[]>();

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

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          icon={ShieldCheck}
          title="Yetkilendirme"
          description="Aktif pozisyonların hangi role ve sistem erişimine bağlı olduğunu gösterir. Ekleme/çıkarma ve pasife alma Ayarlar → Personel Tanımlama'dan yapılır."
        />

        {liste.length === 0 ? (
          <EmptyState icon={Briefcase} title="Aktif pozisyon yok." />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Aktif Pozisyonlar</CardTitle>
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
                            <span className="font-medium">{poz.ad}</span>
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
            <CardTitle>Yakında</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              Rol bazlı ekran/işlem yetkilendirmesi (klinik_admin, resepsiyon, terapist, muhasebe) şu an veritabanı
              seviyesinde (RLS) uygulanıyor — bu ekrandan yönetilebilen bir izin editörü henüz yok.
            </p>
            <Button variant="outline" size="sm" className="w-fit" nativeButton={false} render={<Link href="/panel/ayarlar/personel-tanimlama">Personel Tanımlama&apos;ya git</Link>} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
