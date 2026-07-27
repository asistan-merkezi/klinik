// components/landing/StatsBand.tsx
import Reveal from "@/components/ui/Reveal";

/*
 * Rakamlar yerine, ürün henüz pilot aşamasındayken de doğru kalan
 * dürüst iddialar kullanılıyor (bkz. README "Yayına almadan önce
 * çözülmesi gerekenler" — %99.8 / +500 klinik / 2.5M+ randevu gibi
 * ölçülebilir ticari iddialar Ticari Reklam ve Haksız Ticari
 * Uygulamalar Yönetmeliği kapsamında ispat yükümlülüğü doğurur ve
 * gerçek veriyle doğrulanana kadar kullanılmamalıdır).
 */
const STATS = [
  { value: "1 gün", label: "Kurulum süresi" },
  { value: "TR", label: "Veri Türkiye'de barındırılır" },
  { value: "7/24", label: "Türkçe destek" },
];

export default function StatsBand() {
  return (
    <section className="border-y border-white/5">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <Reveal>
          <dl className="grid gap-8 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-white/10">
            {STATS.map((stat, index) => (
              <div key={stat.label} className={index === 0 ? "sm:pr-8" : "sm:px-8"}>
                <dt className="sr-only">{stat.label}</dt>
                <dd>
                  <span className="tabular block font-mono text-4xl font-bold tracking-tight text-ink lg:text-5xl">
                    {stat.value}
                  </span>
                  <span className="mt-2 block text-sm text-ink-muted">{stat.label}</span>
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}
