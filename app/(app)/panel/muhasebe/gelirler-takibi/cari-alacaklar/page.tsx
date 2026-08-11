import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { HandCoins } from "lucide-react";

type CariOzetSatiri = {
  hasta_id: string;
  ad_soyad: string;
  toplam_bakiye: number;
  tahsil_edilen: number;
  kalan_bakiye: number;
};

const paraFormat = (tutar: number) => tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

export default async function CariAlacaklarTakibiSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("rol").eq("id", user.id).single();

  const yetkili =
    kullanici?.rol === "klinik_admin" ||
    kullanici?.rol === "resepsiyon" ||
    kullanici?.rol === "muhasebe" ||
    kullanici?.rol === "super_admin";

  if (!yetkili) {
    redirect("/panel");
  }

  const { data } = await supabase
    .from("v_hasta_cari_ozet")
    .select("hasta_id, ad_soyad, toplam_bakiye, tahsil_edilen, kalan_bakiye")
    .order("kalan_bakiye", { ascending: false })
    .order("toplam_bakiye", { ascending: false })
    .returns<CariOzetSatiri[]>();

  const satirlar = data ?? [];

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header>
          <h1 className="text-xl font-semibold">Cari Alacaklar Takibi</h1>
          <p className="text-sm text-muted-foreground">
            Paketsiz check-in ile borçlandırılan hastaların toplam bakiye, tahsil edilen ve kalan bakiye
            durumu. Bir satıra tıklayınca hastanın Cari & Ödeme sayfası açılır.
          </p>
        </header>

        {satirlar.length === 0 ? (
          <EmptyState icon={HandCoins} title="Henüz cari borç kaydı yok." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Hasta</th>
                  <th className="px-3 py-2 text-right font-medium">Toplam Bakiye</th>
                  <th className="px-3 py-2 text-right font-medium">Tahsil Edilen</th>
                  <th className="px-3 py-2 text-right font-medium">Kalan Bakiye</th>
                </tr>
              </thead>
              <tbody>
                {satirlar.map((s) => {
                  const href = `/panel/hastalar/${s.hasta_id}/cari`;
                  return (
                    <tr key={s.hasta_id} className="border-b border-border last:border-b-0 hover:bg-muted/30">
                      <td className="p-0">
                        <Link href={href} className="block px-3 py-2 font-medium">
                          {s.ad_soyad}
                        </Link>
                      </td>
                      <td className="p-0">
                        <Link href={href} className="block px-3 py-2 text-right tabular-nums">
                          {paraFormat(s.toplam_bakiye)}
                        </Link>
                      </td>
                      <td className="p-0">
                        <Link
                          href={href}
                          className="block px-3 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400"
                        >
                          {paraFormat(s.tahsil_edilen)}
                        </Link>
                      </td>
                      <td className="p-0">
                        <Link
                          href={href}
                          className={`block px-3 py-2 text-right tabular-nums font-semibold ${
                            s.kalan_bakiye > 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"
                          }`}
                        >
                          {paraFormat(s.kalan_bakiye)}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
