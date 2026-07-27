// components/landing/Features.tsx
import { MonitorSmartphone, MessageSquareText, FileHeart, TrendingUp } from "lucide-react";
import Reveal from "@/components/ui/Reveal";
import GlassPanel from "@/components/ui/GlassPanel";

/*
 * Yerleşim kararı: dört eşit kart yerine 2/3 + 1/3 asimetrik bento.
 * Canlı senkronizasyon ürünün çekirdek iddiası olduğu için geniş kartta
 * kendi görselini taşır; diğer üçü destekleyici kolonda durur.
 */

const SUPPORTING = [
  {
    icon: MessageSquareText,
    title: "Otomatik WhatsApp & SMS hatırlatıcı",
    // NOT: "%40 düşürün" ifadesi ölçülebilir bir iddiadır ve reklamda
    // ispat yükümlülüğü doğurur. Kendi verinizle doğrulayana kadar
    // aşağıdaki nötr ifade kullanılır.
    body: "Randevu saatinden 2 saat önce otomatik bildirim gönderin, gelmeyen hasta (no-show) sayısını düşürün.",
  },
  {
    icon: FileHeart,
    title: "Hasta geçmişi & reçete takibi",
    body: "Tek tıkla hastanın önceki muayenelerine, dosya ve tahlillerine ulaşın.",
  },
  {
    icon: TrendingUp,
    title: "Gelir & finans analitiği",
    body: "Günlük, haftalık ve aylık klinik cironuzu, tahsilatları görsel grafiklerle izleyin.",
  },
];

const DEVICES = ["Sekreterya paneli", "Terapist paneli", "Oda tableti", "Hasta portalı"];

export default function Features() {
  return (
    <section id="ozellikler" className="relative border-t border-white/5 bg-canvas-raised/40">
      <div className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
        <Reveal className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-500">
            Ne yapar
          </p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            Kliniğin akışını tek ekranda toplar
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {/* Geniş kart — çekirdek iddia */}
          <Reveal className="lg:col-span-2">
            <GlassPanel className="flex h-full flex-col justify-between gap-8 p-7 lg:p-9">
              <div>
                <MonitorSmartphone className="h-6 w-6 text-primary-500" aria-hidden />
                <h3 className="mt-5 text-2xl font-semibold tracking-tight text-ink">
                  Çapraz cihaz canlı senkronizasyon
                </h3>
                <p className="mt-3 max-w-md text-base leading-relaxed text-ink-muted">
                  Sekreterya, terapist ve hasta panelleri anlık güncellenir.
                  Çakışan randevulara son.
                </p>
              </div>

              {/* Mini görsel: aynı anda güncellenen yüzeyler */}
              <ul className="flex flex-wrap gap-2">
                {DEVICES.map((device) => (
                  <li
                    key={device}
                    className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-ink-muted"
                  >
                    <span
                      className="h-1.5 w-1.5 animate-live-blink rounded-full bg-secondary-500"
                      aria-hidden
                    />
                    {device}
                  </li>
                ))}
              </ul>
            </GlassPanel>
          </Reveal>

          {/* Destekleyici kolon */}
          <div className="grid gap-5">
            {SUPPORTING.map((feature, index) => (
              <Reveal key={feature.title} delay={0.06 * (index + 1)}>
                <GlassPanel className="group h-full p-6 transition duration-200 ease-out hover:-translate-y-0.5 hover:border-primary-500/30">
                  <feature.icon
                    className="h-5 w-5 text-primary-500 transition-colors group-hover:text-primary-400"
                    aria-hidden
                  />
                  <h3 className="mt-4 text-base font-semibold text-ink">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">{feature.body}</p>
                </GlassPanel>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
