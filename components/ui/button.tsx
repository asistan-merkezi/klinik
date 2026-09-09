import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // Radius: rounded-lg zaten Faz 0'ın --radius-lg=0.5rem token remapiyle
  // docs/DESIGN.md'nin "core control" ölçüsüne (0.5rem) oturuyor, ayrıca
  // değiştirilmedi. Focus/error ring opaklığı DESIGN §4'e göre düzeltildi
  // (ring/50→/15, aria-invalid ring/20→/12) — button/input/select üçünde de.
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/15 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/12 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/30 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // docs/DESIGN.md §1 Primary: hover gölgesi light #1E40AF / dark #2563EB
        // rgb'sine göre (bkz. globals.css .dark notu — dark primary kendi
        // ara-değerimiz, DESIGN'ın literal hex'i değil).
        default:
          "bg-primary text-primary-foreground hover:bg-primary-hover hover:shadow-[0_2px_8px_rgba(30,64,175,0.25)] dark:hover:shadow-[0_2px_8px_rgba(37,99,235,0.35)]",
        // docs/DESIGN.md §1 Secondary/Ghost: hover zemin --background (#F8FAFC),
        // hover border --input (#CBD5E1), etiket metni slate-700 (DESIGN'ın
        // literal #334155'i — mevcut semantic token'lardan hiçbiri bu tonu
        // karşılamıyor, yeni bir token açmak yerine stok Tailwind rengi
        // kullanıldı, status-badge.tsx'teki emerald/amber/rose/sky ile aynı emsal).
        outline:
          "border-border bg-surface-2 text-slate-700 hover:border-input hover:bg-background hover:text-foreground aria-expanded:border-input aria-expanded:bg-background aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:text-slate-300 dark:hover:bg-input/50 dark:hover:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        // docs/DESIGN.md "Procedural / Clinical (Seansı Başlat)" — pozitif/prosedürel
        // aksiyonlar için, primary'den ayrı bir teal marka rengi.
        clinical: "bg-clinical text-clinical-foreground hover:bg-clinical-hover",
        ghost:
          "hover:bg-background hover:text-foreground aria-expanded:bg-background aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/12 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/30",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
