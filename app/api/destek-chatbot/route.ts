import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { oturumBaglami } from "@/lib/auth/gecerli-kullanici";
import { ayniKokenMi, caprazKokenYaniti } from "@/lib/guvenlik/origin";
import { sinirYaniti } from "@/lib/guvenlik/istek-siniri";
import { chatbotAcikMi } from "@/lib/destek-chatbot/bayrak";
import { mesajlariMaskele } from "@/lib/destek-chatbot/maskele";
import { DESTEK_CHATBOTU_SISTEM_PROMPTU } from "@/lib/destek-chatbot/sistem-promptu";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAKS_GOVDE_KARAKTER = 100_000;
const MAKS_MESAJ_SAYISI = 20;

export async function POST(req: Request) {
  // 1) ÖZELLİK BAYRAĞI: kapalıyken oturum, gövde ya da model ile HİÇ ilgilenilmez → LLM'e veri gitmez.
  if (!chatbotAcikMi()) return new Response("Destek chatbotu etkin değil.", { status: 404 });

  if (!ayniKokenMi(req)) return caprazKokenYaniti();

  // 2) Yalnız panel personeli (portal hastası ve klinik bağlamı olmayan super_admin hariç)
  const ctx = await oturumBaglami();
  if (!ctx) return new Response("Yetkisiz.", { status: 401 });
  if (ctx.tur !== "personel" || !ctx.tenantId) return new Response("Yetkisiz.", { status: 403 });

  const sinir = await sinirYaniti("chatbot", ctx.userId);
  if (sinir) return sinir;

  // 3) Maliyet tavanı: aşırı uzun gövde reddedilir, modele yalnız son mesajlar gider.
  const govde = await req.text();
  if (govde.length > MAKS_GOVDE_KARAKTER) return new Response("Mesaj çok uzun.", { status: 413 });
  let messages: UIMessage[];
  try {
    messages = (JSON.parse(govde) as { messages: UIMessage[] }).messages;
  } catch {
    return new Response("Geçersiz istek.", { status: 400 });
  }
  if (!Array.isArray(messages) || messages.length === 0) return new Response("Geçersiz istek.", { status: 400 });

  // 4) Kimlik/iletişim/finans numaraları modele gitmeden SİLİNİR.
  const guvenli = mesajlariMaskele(messages.slice(-MAKS_MESAJ_SAYISI));

  const result = streamText({
    model: "anthropic/claude-sonnet-5",
    instructions: DESTEK_CHATBOTU_SISTEM_PROMPTU,
    messages: await convertToModelMessages(guvenli),
  });

  return result.toUIMessageStreamResponse();
}
