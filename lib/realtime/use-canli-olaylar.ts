"use client";

// Ortak canlı olay kancası (SSE, /api/canli). tüm tüketiciler bunu kullanır.
//  - onOlay(olay):  sunucudan {t, i} geldi (veri YOK) → tüketici veriyi normal yetkili yoldan yeniden çeker.
//  - onSenkron():   bağlantı (yeniden) kuruldu / sunucu dinleyicisi yeniden bağlandı / ağ geri geldi → kesintide kaçanları telafi için yeniden çek.
//                   İlk bağlantıda ÇAĞRILMAZ (ilk veri sayfayla zaten gelmiştir).
//  - baglanti:      "baglaniyor" | "bagli" | "kopuk" (tablet "Çevrimdışı" rozeti buradan beslenir).
// Sessizce ölmüş bağlantı (kiosk): sunucu 25 sn'de bir ping yollar; 70 sn ping/olay gelmezse bağlantı yenilenir.
// EventSource HTTP hatasında (401/429) kendiliğinden yeniden denemez → burada geri çekilmeli elle yeniden denenir.
import { useEffect, useRef, useState } from "react";
import type { CanliTablo, IstemciOlayi } from "./olay";

export type CanliBaglanti = "baglaniyor" | "bagli" | "kopuk";

const SESSIZLIK_ZAMAN_ASIMI_MS = 70_000;
const ILK_BEKLE_MS = 2_000;
const EN_FAZLA_BEKLE_MS = 30_000;

export function useCanliOlaylar(sec: {
  tablolar: readonly CanliTablo[];
  /** false ise hiç bağlanılmaz (ör. önizleme rotası). */
  etkin?: boolean;
  onOlay?: (olay: IstemciOlayi) => void;
  onSenkron?: () => void;
}): CanliBaglanti {
  const { tablolar, etkin = true } = sec;
  const [durum, setDurum] = useState<CanliBaglanti>("baglaniyor");
  const olayRef = useRef(sec.onOlay);
  const senkronRef = useRef(sec.onSenkron);
  useEffect(() => {
    olayRef.current = sec.onOlay;
    senkronRef.current = sec.onSenkron;
  });
  const anahtar = [...tablolar].sort().join(",");

  useEffect(() => {
    if (!etkin) return;
    let es: EventSource | null = null;
    let bekle = ILK_BEKLE_MS;
    let yenidenZamanlayici: ReturnType<typeof setTimeout> | null = null;
    let sessizlik: ReturnType<typeof setTimeout> | null = null;
    let iptal = false;
    let ilkBaglanti = true;

    const sessizligiSifirla = () => {
      if (sessizlik) clearTimeout(sessizlik);
      sessizlik = setTimeout(() => {
        setDurum("kopuk");
        yeniden();
      }, SESSIZLIK_ZAMAN_ASIMI_MS);
    };

    function yeniden() {
      es?.close();
      es = null;
      if (iptal || yenidenZamanlayici) return;
      yenidenZamanlayici = setTimeout(() => {
        yenidenZamanlayici = null;
        baglan();
      }, bekle);
      bekle = Math.min(bekle * 2, EN_FAZLA_BEKLE_MS);
    }

    function baglan() {
      if (iptal) return;
      setDurum("baglaniyor");
      const kaynak = new EventSource(`/api/canli?t=${encodeURIComponent(anahtar)}`);
      es = kaynak;
      kaynak.addEventListener("hazir", () => {
        bekle = ILK_BEKLE_MS;
        setDurum("bagli");
        sessizligiSifirla();
        if (ilkBaglanti) ilkBaglanti = false;
        else senkronRef.current?.();
      });
      kaynak.addEventListener("olay", (e) => {
        sessizligiSifirla();
        try {
          olayRef.current?.(JSON.parse((e as MessageEvent<string>).data) as IstemciOlayi);
        } catch {
          /* bozuk olay yok sayılır */
        }
      });
      kaynak.addEventListener("yeniden", () => {
        sessizligiSifirla();
        senkronRef.current?.();
      });
      kaynak.addEventListener("ping", sessizligiSifirla);
      // Sunucu oturumun bittiğini bildirdi (iptal / gece kapanışı / devre dışı): yeniden bağlanma; sayfayı yenile → proxy giriş sayfasına yönlendirir.
      kaynak.addEventListener("oturum", () => {
        iptal = true;
        if (sessizlik) clearTimeout(sessizlik);
        kaynak.close();
        setDurum("kopuk");
        window.location.reload();
      });
      kaynak.onerror = () => {
        setDurum("kopuk");
        // CLOSED: tarayıcı vazgeçti (401/429/ağ yok) → elle geri çekilmeli yeniden dene. CONNECTING: tarayıcı kendisi deniyor.
        if (kaynak.readyState === EventSource.CLOSED) yeniden();
      };
    }

    const agGeldi = () => {
      if (!es || es.readyState === EventSource.CLOSED) {
        bekle = ILK_BEKLE_MS;
        if (yenidenZamanlayici) {
          clearTimeout(yenidenZamanlayici);
          yenidenZamanlayici = null;
        }
        baglan();
      }
    };
    const agGitti = () => setDurum("kopuk");
    window.addEventListener("online", agGeldi);
    window.addEventListener("offline", agGitti);

    baglan();
    return () => {
      iptal = true;
      window.removeEventListener("online", agGeldi);
      window.removeEventListener("offline", agGitti);
      if (yenidenZamanlayici) clearTimeout(yenidenZamanlayici);
      if (sessizlik) clearTimeout(sessizlik);
      es?.close();
    };
  }, [anahtar, etkin]);

  return durum;
}
