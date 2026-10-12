import { Users, CalendarClock, Wallet, DatabaseBackup, UploadCloud } from "lucide-react";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { ModuleCard } from "@/components/panel/module-card";
import { PageHeader } from "@/components/ui/page-header";

export default async function ArsivIceAktarmaSayfasi() {
  await sayfaYetkisiIste(["klinik_admin"], { yetkisizHedef: "/panel/ayarlar" });

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          icon={UploadCloud}
          title="Arşiv İçe Aktarma, Arşiv Yükleme ve Yedekleme"
          description="Önceden kullandığınız programdaki verileri Excel/CSV dosyasından toplu olarak aktarın. Aşağıdaki sırayla ilerleyin — her bölüm bir önceki bölümün tamamlanmasına dayanır."
        />

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
