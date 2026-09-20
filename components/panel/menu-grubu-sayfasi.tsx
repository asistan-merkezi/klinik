import type { MenuGrubu } from "@/lib/panel/menu-gruplari";
import { ModuleCard } from "@/components/panel/module-card";
import { PageHeader } from "@/components/ui/page-header";
import { canAccessModule, moduleKeyForRoute } from "@/lib/auth/roles";

/**
 * Tedaviler/Muhasebe/Ayarlar/Destek hub sayfalarının PAYLAŞILAN render'ı —
 * tek yerden PageHeader'a geçince hepsi güncellenir. `allowedModules` ile
 * kartlar tek tek süzülür (Partial Visibility) — sayfaya girebilmiş olmak
 * (bkz. erisimKontrolEt) o gruptaki TÜM alt modüllere erişim anlamına gelmez.
 */
export function MenuGrubuSayfasi({ grup, allowedModules }: { grup: MenuGrubu; allowedModules: string[] }) {
  const gorunurOgeler = grup.ogeler.filter((oge) =>
    canAccessModule(allowedModules, moduleKeyForRoute(oge.href) ?? grup.key)
  );

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader title={grup.label} icon={grup.icon} />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {gorunurOgeler.map((oge) => (
            <ModuleCard key={oge.href} href={oge.href} icon={oge.icon} label={oge.label} />
          ))}
        </div>
      </div>
    </div>
  );
}
