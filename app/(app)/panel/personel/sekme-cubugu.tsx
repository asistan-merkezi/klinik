"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Briefcase, Users, Wallet, Clock } from "lucide-react";
import type { ReactNode } from "react";
import { Tabs, TabsList, TabsPanel, TabsTrigger } from "@/components/ui/tabs";
import type { PersonelSekme } from "./sekmeler";

// İkonlar bilinçli olarak burada, client tarafta çözülüyor — Server Component'ten
// (page.tsx) bir LucideIcon'u prop olarak geçirmek RSC serileştirmesini kırıyor
// (bkz. CLAUDE.md: Mesajlaşma sayfası 500 hatası, aynı sınıf hata).
const SEKME_IKONLARI: Record<PersonelSekme, LucideIcon> = {
  pozisyonlar: Briefcase,
  liste: Users,
  hesap: Wallet,
  puantaj: Clock,
};

export function PersonelSekmeCubugu({
  aktifSekme,
  izinliSekmeler,
  rozetler,
  children,
}: {
  aktifSekme: PersonelSekme;
  izinliSekmeler: { key: PersonelSekme; label: string }[];
  /** Sekme başına küçük sayısal rozet (örn. "Onay bekleyenler") — 0/undefined ise gösterilmez. */
  rozetler?: Partial<Record<PersonelSekme, number>>;
  children: ReactNode;
}) {
  return (
    <Tabs value={aktifSekme}>
      <TabsList>
        {izinliSekmeler.map((sekme) => {
          const Icon = SEKME_IKONLARI[sekme.key];
          const href = sekme.key === "liste" ? "/panel/personel" : `/panel/personel?tab=${sekme.key}`;
          const rozet = rozetler?.[sekme.key];
          return (
            <TabsTrigger
              key={sekme.key}
              value={sekme.key}
              nativeButton={false}
              render={
                <Link href={href} className="flex items-center gap-1.5">
                  <Icon className="size-4" aria-hidden />
                  {sekme.label}
                  {!!rozet && (
                    <span className="ml-0.5 inline-flex size-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-semibold text-white">
                      {rozet}
                    </span>
                  )}
                </Link>
              }
            />
          );
        })}
      </TabsList>
      <TabsPanel value={aktifSekme}>{children}</TabsPanel>
    </Tabs>
  );
}
