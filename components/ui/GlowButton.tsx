// components/ui/GlowButton.tsx
import Link from "next/link";
import { cn } from "@/lib/utils";

type GlowButtonProps = {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "outline";
  className?: string;
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-base font-semibold transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

const variants = {
  // Sayfada TEK primary aksiyon vardır: 14 gün ücretsiz deneme
  primary: cn(
    "bg-gradient-to-r from-primary-500 to-primary-600 text-canvas shadow-glow",
    "hover:-translate-y-0.5 hover:shadow-glow-lg"
  ),
  outline: cn(
    "border border-white/15 bg-white/[0.03] text-ink backdrop-blur-sm",
    "hover:-translate-y-0.5 hover:border-primary-500/50 hover:bg-white/[0.06]"
  ),
} as const;

export default function GlowButton({
  href,
  children,
  variant = "primary",
  className,
}: GlowButtonProps) {
  return (
    <Link href={href} className={cn(base, variants[variant], className)}>
      {children}
    </Link>
  );
}
