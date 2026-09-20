import type { MenuGrubu } from "@/lib/panel/menu-gruplari";
import { ModuleCard } from "@/components/panel/module-card";
import { PageHeader } from "@/components/ui/page-header";

/** Tedaviler/Muhasebe/Ayarlar/Destek hub sayfalarının PAYLAŞILAN render'ı — tek yerden PageHeader'a geçince hepsi güncellenir. */
export function MenuGrubuSayfasi({ grup }: { grup: MenuGrubu }) {
  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader title={grup.label} icon={grup.icon} />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {grup.ogeler.map((oge) => (
            <ModuleCard key={oge.href} href={oge.href} icon={oge.icon} label={oge.label} />
          ))}
        </div>
      </div>
    </div>
  );
}
