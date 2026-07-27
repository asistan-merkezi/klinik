// components/landing/Hero.tsx
import { ArrowRight, PlayCircle, ShieldCheck } from "lucide-react";
import GlowButton from "@/components/ui/GlowButton";
import Reveal from "@/components/ui/Reveal";
import LiveScheduleCard from "./LiveScheduleCard";

export default function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Zemin dokusu: nokta grid + tek yumuşak cyan ışıma. Gradyan duvar yok. */}
      <div className="bg-dot-grid absolute inset-0 opacity-50" aria-hidden />
      <div
        className="absolute -right-40 top-0 h-[520px] w-[520px] rounded-full bg-primary-500/10 blur-[120px]"
        aria-hidden
      />

      <div className="relative mx-auto grid max-w-6xl gap-14 px-5 pb-20 pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:items-center lg:gap-16 lg:pb-28 lg:pt-24">
        {/* Sol: mesaj ve aksiyon */}
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-ink-muted">
            <ShieldCheck className="h-3.5 w-3.5 text-secondary-500" aria-hidden />
            KVKK uyumlu · Türkiye'de barındırılan veri
          </span>

          <h1 className="mt-6 text-4xl font-bold leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-6xl">
            Kliniğinizin dijital beyni:{" "}
            <span className="bg-gradient-to-r from-primary-500 to-primary-600 bg-clip-text text-transparent">
              akıllı klinik &amp; randevu asistanı
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-muted">
            Hastalarınızı kaçırmayın. Canlı randevu çizelgesi, otomatik WhatsApp
            hatırlatmaları ve hasta takibi tek platformda.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <GlowButton href="/kayit">
              14 gün ücretsiz deneyin
              <ArrowRight className="h-4 w-4" aria-hidden />
            </GlowButton>
            <GlowButton href="/demo" variant="outline">
              <PlayCircle className="h-4 w-4" aria-hidden />
              Canlı demoyu inceleyin
            </GlowButton>
          </div>

          <p className="mt-4 text-sm text-ink-faint">
            Kurulum gerekmez · Kredi kartı istemiyoruz
          </p>
        </Reveal>

        {/* Sağ: imza öğesi */}
        <Reveal delay={0.12} className="lg:justify-self-end">
          <LiveScheduleCard />
        </Reveal>
      </div>
    </section>
  );
}
