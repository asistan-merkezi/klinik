import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ayAraligi } from "@/lib/utils";
import { YeniGiderButonu } from "./yeni-gider-butonu";

type HarcamaSatir = { id: string; tutar: number; tarih: string; aciklama: string | null };

const paraFormat = (tutar: number) =>
  tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

export default async function KamusalGiderlerSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ ay?: string }>;
}) {
  const { ay: ayParam } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("klinik_id, rol")
    .eq("id", user.id)
    .single();

  const yetkili =
    kullanici?.rol === "klinik_admin" || kullanici?.rol === "muhasebe" || kullanici?.rol === "super_admin";

  if (!yetkili) {
    redirect("/panel");
  }

  const yonetici = kullanici?.rol === "klinik_admin";
  const klinikId = kullanici?.klinik_id ?? "";
  const ay = ayAraligi(ayParam);

  const { data: harcamaSonuc } = await supabase
    .from("klinik_harcama")
    .select("id, tutar, tarih, aciklama")
    .eq("klinik_id", klinikId)
    .eq("kategori", "vergi_sgk")
    .gte("tarih", ay.baslangicTarih)
    .lt("tarih", ay.bitisTarih)
    .order("tarih", { ascending: false })
    .returns<HarcamaSatir[]>();

  const harcamalar = harcamaSonuc ?? [];
  const ayToplami = harcamalar.reduce((acc, h) => acc + h.tutar, 0);

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Kamusal Giderler</h1>
            <p className="text-sm text-muted-foreground">
              Vergi, SGK ve diğer resmi kesinti/ödeme takibi.
            </p>
          </div>
          {yonetici && <YeniGiderButonu />}
        </header>

        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold">{ay.etiket}</h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/panel/muhasebe/kamusal-giderler?ay=${ay.oncekiParam}`}>‹ Önceki</Link>}
            />
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/panel/muhasebe/kamusal-giderler?ay=${ay.sonrakiParam}`}>Sonraki ›</Link>}
            />
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{ay.etiket} — Kayıtlar</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {harcamalar.length === 0 ? (
              <p className="text-sm text-muted-foreground">Bu ay için kayıtlı kamusal gider yok.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {harcamalar.map((h) => (
                  <li key={h.id} className="flex items-center justify-between py-2 text-sm">
                    <div className="flex flex-col">
                      <span className="font-medium">{h.aciklama ?? "Vergi / SGK"}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(h.tarih).toLocaleDateString("tr-TR")}
                      </span>
                    </div>
                    <span>{paraFormat(h.tutar)}</span>
                  </li>
                ))}
              </ul>
            )}

            {harcamalar.length > 0 && (
              <div className="flex items-center justify-between border-t border-border pt-3 font-semibold">
                <span>Ay Toplamı</span>
                <span className="text-rose-600 dark:text-rose-400">{paraFormat(ayToplami)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
