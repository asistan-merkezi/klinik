import { redirect } from "next/navigation";
import { Users, CalendarClock, Wallet, DatabaseBackup } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ModuleCard } from "@/components/panel/module-card";

export default async function ArsivIceAktarmaSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("rol").eq("id", user.id).single();

  if (kullanici?.rol !== "klinik_admin") {
    redirect("/panel/ayarlar");
  }

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header>
          <h1 className="text-xl font-semibold">Arşiv İçe Aktarma, Arşiv Yükleme ve Yedekleme</h1>
          <p className="text-sm text-muted-foreground">
            Önceden kullandığınız programdaki verileri Excel/CSV dosyasından toplu olarak aktarın. Aşağıdaki
            sırayla ilerleyin — her bölüm bir önceki bölümün tamamlanmasına dayanır.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ModuleCard
            icon={Users}
            label="1. Hastalar"
            subtitle="Hasta kayıtları ve iletişim/kimlik bilgileri"
            href="/panel/ayarlar/arsiv-ice-aktarma/hastalar"
          />
          <ModuleCard
            icon={CalendarClock}
            label="2. Randevu / Seans Geçmişi"
            subtitle="Geçmiş randevular (hasta içe aktarımından sonra)"
            href="/panel/ayarlar/arsiv-ice-aktarma/randevular"
          />
          <ModuleCard
            icon={Wallet}
            label="3. Ödeme & Paket Geçmişi"
            subtitle="Bakiye hareketleri ve kalan paket hakları"
            href="/panel/ayarlar/arsiv-ice-aktarma/odeme-paket"
          />
          <ModuleCard
            icon={DatabaseBackup}
            label="Yedekleme"
            subtitle="Henüz kurulmadı"
            href="/panel/ayarlar/arsiv-ice-aktarma/yedekleme"
          />
        </div>
      </div>
    </div>
  );
}
