import type { MenuGrubu } from "@/lib/panel/menu-gruplari";
import { ModuleCard } from "@/components/panel/module-card";

export function MenuGrubuSayfasi({ grup }: { grup: MenuGrubu }) {
  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex items-center gap-2">
          <grup.icon className="size-5 text-muted-foreground" aria-hidden />
          <h1 className="text-xl font-semibold">{grup.label}</h1>
        </header>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {grup.ogeler.map((oge) => (
            <ModuleCard key={oge.href} href={oge.href} icon={oge.icon} label={oge.label} />
          ))}
        </div>
      </div>
    </div>
  );
}
