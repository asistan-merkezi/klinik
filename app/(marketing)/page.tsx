// app/(marketing)/page.tsx
import SiteHeader from "@/components/landing/SiteHeader";
import Hero from "@/components/landing/Hero";
import Features from "@/components/landing/Features";
import StatsBand from "@/components/landing/StatsBand";
import FinalCta from "@/components/landing/FinalCta";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <Features />
        <StatsBand />
        <FinalCta />
      </main>
    </>
  );
}
