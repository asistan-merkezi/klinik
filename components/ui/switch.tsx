"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

// Not: shadcn'in nötr gri "kapalı" rengi yerine kırmızı/yeşil kullanılıyor —
// bu switch sadece "aktif/pasif", "var/yok" gibi iki tarafı da anlamlı
// (nötr olmayan) ikili durumlar için, bilinçli tasarım kararı.
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-rose-500 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[checked]:bg-emerald-500",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-4 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[checked]:translate-x-[18px]"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
