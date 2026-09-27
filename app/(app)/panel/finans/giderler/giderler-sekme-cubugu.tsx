"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet, Landmark, Receipt } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const SEKMELER = [
  { href: "/panel/finans/giderler", label: "Genel Giderler", icon: Wallet },
  { href: "/panel/finans/giderler/kamusal-giderler", label: "Kamusal Giderler", icon: Landmark },
  { href: "/panel/finans/giderler/gelen-faturalar", label: "Gelen Faturalar", icon: Receipt },
] as const;

export function GiderlerSekmeCubugu() {
  const pathname = usePathname();
  const aktif = SEKMELER.find((sekme) => sekme.href === pathname)?.href ?? SEKMELER[0].href;

  return (
    <Tabs value={aktif}>
      <TabsList>
        {SEKMELER.map((sekme) => (
          <TabsTrigger
            key={sekme.href}
            value={sekme.href}
            nativeButton={false}
            render={
              <Link href={sekme.href} className="flex items-center gap-1.5">
                <sekme.icon className="size-4" aria-hidden />
                {sekme.label}
              </Link>
            }
          />
        ))}
      </TabsList>
    </Tabs>
  );
}
