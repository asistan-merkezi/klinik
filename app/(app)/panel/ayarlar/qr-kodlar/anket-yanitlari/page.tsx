import { redirect } from "next/navigation";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/datetime";
import { cn, telefonGoster } from "@/lib/utils";

export default async function AnketYanitlariSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("rol, klinik_id").eq("id", user.id).single();

  if (kullanici?.rol !== "klinik_admin") {
    redirect("/panel/ayarlar");
  }

  const { data: yanitlar } = await supabase
    .from("anket_yaniti")
    .select("id, puan, oneri_metni, ad_soyad, telefon, created_at")
    .eq("klinik_id", kullanici.klinik_id)
    .order("created_at", { ascending: false });

  const puanlar = (yanitlar ?? []).map((y) => y.puan).filter((p): p is number => p !== null);
  const ortalama = puanlar.length > 0 ? (puanlar.reduce((a, b) => a + b, 0) / puanlar.length).toFixed(1) : null;

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header>
          <h1 className="text-xl font-semibold">Anket ve Öneriler</h1>
          <p className="text-sm text-muted-foreground">
            QR kod üzerinden gelen hasta geri bildirimleri.
            {ortalama && ` Ortalama puan: ${ortalama} / 5 (${puanlar.length} oy)`}
          </p>
        </header>

        {(!yanitlar || yanitlar.length === 0) && (
          <p className="text-sm text-muted-foreground">Henüz yanıt yok.</p>
        )}

        <ul className="flex flex-col divide-y divide-border">
          {(yanitlar ?? []).map((y) => (
            <li key={y.id} className="flex flex-col gap-2 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  {y.puan !== null &&
                    [1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={cn("size-4", n <= y.puan! ? "fill-amber-400 text-amber-400" : "text-muted-foreground")}
                      />
                    ))}
                </div>
                <span className="text-xs text-muted-foreground">{formatDateTime(y.created_at)}</span>
              </div>
              {y.oneri_metni && <p>{y.oneri_metni}</p>}
              {(y.ad_soyad || y.telefon) && (
                <p className="text-xs text-muted-foreground">
                  {[y.ad_soyad, telefonGoster(y.telefon)].filter(Boolean).join(" · ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
