import Link from "next/link";
import type { MenuGrubu } from "@/lib/panel/menu-gruplari";

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
            <Link
              key={oge.href}
              href={oge.href}
              className="flex flex-col items-center gap-3 rounded-xl bg-card p-6 text-center text-sm font-medium text-card-foreground ring-1 ring-foreground/10 transition-colors hover:bg-accent hover:text-accent-foreground dark:bg-card/70"
            >
              <oge.icon className="size-7 shrink-0 text-muted-foreground" aria-hidden />
              {oge.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
