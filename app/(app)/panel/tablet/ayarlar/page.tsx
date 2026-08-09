import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VARSAYILAN_TABLET_AYARLARI, type TabletAyarlari } from "@/types/tablet-ayarlari";
import { TabletAyarlariIstemci } from "./tablet-ayarlari-istemci";

export default async function TabletAyarlarSayfasi() {
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

  const duzenlenebilir = kullanici?.rol === "klinik_admin";

  const { data: klinikAyarlar } = await supabase
    .from("klinik_ayarlar")
    .select("ayarlar")
    .eq("klinik_id", kullanici?.klinik_id ?? "")
    .maybeSingle();

  const ayarlar: TabletAyarlari = {
    ...VARSAYILAN_TABLET_AYARLARI,
    ...(klinikAyarlar?.ayarlar as { tablet?: Partial<TabletAyarlari> } | null)?.tablet,
  };

  const { data: klinik } = await supabase
    .from("klinik")
    .select("ad, logo_url, logo_url_koyu, marka_renkleri")
    .eq("id", kullanici?.klinik_id ?? "")
    .maybeSingle();

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header>
          <h1 className="text-xl font-semibold">Tablet Görünümü</h1>
          <p className="text-sm text-muted-foreground">
            Oda tabletlerinde hangi bilgilerin gösterileceğini seç. Değişiklikler tüm oda
            tabletlerine anında yansır.
          </p>
        </header>

        {duzenlenebilir ? (
          <TabletAyarlariIstemci
            ayarlar={ayarlar}
            klinik={klinik ?? { ad: "Klinik", logo_url: null, logo_url_koyu: null, marka_renkleri: null }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Bu ayarları yalnızca klinik yöneticisi düzenleyebilir.
          </p>
        )}
      </div>
    </div>
  );
}
