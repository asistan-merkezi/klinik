// components/landing/FinalCta.tsx
import { ArrowRight } from "lucide-react";
import GlowButton from "@/components/ui/GlowButton";
import Reveal from "@/components/ui/Reveal";

export default function FinalCta() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="absolute left-1/2 top-1/2 h-[420px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-500/[0.07] blur-[120px]"
        aria-hidden
      />
      <div className="relative mx-auto max-w-3xl px-5 py-24 text-center lg:py-32">
        <Reveal>
          <h2 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            Yarınki çizelgenizi bu akşam kurun
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-lg text-ink-muted">
            Kurulum, eğitim ve veri aktarımı ilk 14 gün ücretsiz.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <GlowButton href="/kayit">
              14 gün ücretsiz deneyin
              <ArrowRight className="h-4 w-4" aria-hidden />
            </GlowButton>
            <GlowButton href="/iletisim" variant="outline">
              Kliniğinize özel demo isteyin
            </GlowButton>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
