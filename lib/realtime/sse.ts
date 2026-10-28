// SSE yanıtı oluşturucu (saf: Dagitici'ya bağlanır, oturum/DB bilmez; yetki kontrolü route'ta yapılır).
import type { Dagitici, AboneMesaji } from "./dagitici";
import type { CanliTablo } from "./olay";

export const SSE_BASLIKLARI = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no", // (nginx türevi vekiller için; Caddy'de flush_interval -1 gerekir)
} as const;

/** Bağlantı ömrü: oturum iptali / gece kapanışı / devre dışı bırakma en geç bu sürede etkili olur (istemci yeniden bağlanırken oturum yeniden doğrulanır). */
export const SSE_OMUR_MS = 10 * 60_000;
/** Yavaş istemci koruması: bu kadar gönderilmemiş mesaj birikirse bağlantı kapatılır (istemci yeniden bağlanıp telafi çeker). */
const KUYRUK_SINIRI = 64;

export function mesajiBicimle(m: AboneMesaji): string {
  if (m.tur === "olay") return `event: olay\ndata: ${JSON.stringify(m.olay)}\n\n`;
  if (m.tur === "yeniden") return "event: yeniden\ndata: {}\n\n";
  return "event: ping\ndata: {}\n\n";
}

/** Oturum artık geçersiz: istemci yeniden bağlanmayı bırakır ve sayfayı yeniler (proxy giriş sayfasına yönlendirir). */
export const OTURUM_BITTI_OLAYI = 'event: oturum\ndata: {"gecerli":false}\n\n';

/** Abonelik kurar ve SSE Response döner; kullanıcı bağlantı sınırı aşıldıysa null (route 429 verir). */
export function sseYaniti(o: {
  dagitici: Dagitici;
  klinikId: string;
  kullaniciId: string;
  tablolar: ReadonlySet<CanliTablo>;
  signal: AbortSignal;
  omurMs?: number;
  /**
   * Her ping'de (25 sn) çağrılır: oturum hâlâ geçerli mi (iptal, gece kapanışı, hesap devre dışı, destek bağlamı bitişi)? false döner ya da
   * HATA fırlatırsa (doğrulanamıyorsa) bağlantı KAPATILIR — fail-closed; istemci yeniden bağlanırken oturum zaten baştan doğrulanır (401 → durur).
   */
  oturumGecerliMi?: () => Promise<boolean>;
}): Response | null {
  const enc = new TextEncoder();
  let kaldir: (() => void) | null = null;
  let omurZamanlayici: ReturnType<typeof setTimeout> | null = null;
  let kapali = false;
  let denetleyici: ReadableStreamDefaultController<Uint8Array> | null = null;

  const kapat = () => {
    if (kapali) return;
    kapali = true;
    if (omurZamanlayici) clearTimeout(omurZamanlayici);
    kaldir?.();
    try {
      denetleyici?.close();
    } catch {
      /* zaten kapalı */
    }
  };

  let denetliyor = false;
  const oturumuDenetle = () => {
    if (!o.oturumGecerliMi || denetliyor) return; // önceki denetim sürerken yenisi başlatılmaz
    denetliyor = true;
    o.oturumGecerliMi()
      .catch(() => false)
      .then((gecerli) => {
        if (gecerli || kapali) return;
        try {
          denetleyici?.enqueue(enc.encode(OTURUM_BITTI_OLAYI));
        } catch {
          /* akış zaten kapalı */
        }
        kapat();
      })
      .finally(() => {
        denetliyor = false;
      });
  };

  const gonder = (m: AboneMesaji): boolean => {
    if (kapali || !denetleyici) return false;
    if ((denetleyici.desiredSize ?? 1) <= 0) {
      kapat();
      return false;
    }
    try {
      denetleyici.enqueue(enc.encode(mesajiBicimle(m)));
      if (m.tur === "ping") oturumuDenetle();
      return true;
    } catch {
      kapat();
      return false;
    }
  };

  const kaldirici = o.dagitici.abone({ klinikId: o.klinikId, kullaniciId: o.kullaniciId, tablolar: o.tablolar, gonder });
  if (!kaldirici) return null;
  kaldir = kaldirici;

  const akis = new ReadableStream<Uint8Array>(
    {
      start(c) {
        denetleyici = c;
        // retry: tarayıcı yeniden bağlanma gecikmesi; "hazir": bağlantı kuruldu (istemci ilk veri çekimini buna bağlayabilir)
        c.enqueue(enc.encode("retry: 3000\n\nevent: hazir\ndata: {}\n\n"));
        omurZamanlayici = setTimeout(kapat, o.omurMs ?? SSE_OMUR_MS);
        omurZamanlayici.unref?.();
        if (o.signal.aborted) kapat();
        else o.signal.addEventListener("abort", kapat, { once: true });
      },
      cancel() {
        kapat();
      },
    },
    { highWaterMark: KUYRUK_SINIRI, size: () => 1 }
  );
  return new Response(akis, { headers: SSE_BASLIKLARI });
}
