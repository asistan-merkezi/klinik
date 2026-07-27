// components/ui/GlassPanel.tsx
import { cn } from "@/lib/utils";

type GlassPanelProps = {
  children: React.ReactNode;
  className?: string;
};

/**
 * Dark glassmorphism yüzeyi. Cam efekti tek yerde tanımlıdır;
 * kartlarda blur/border kombinasyonu tekrar yazılmaz.
 */
export default function GlassPanel({ children, className }: GlassPanelProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-canvas-panel/70 shadow-2xl shadow-black/40 backdrop-blur-md",
        className
      )}
    >
      {children}
    </div>
  );
}
