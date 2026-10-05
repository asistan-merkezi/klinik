import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createClient } from "@/lib/supabase/server";
import { DESTEK_CHATBOTU_SISTEM_PROMPTU } from "@/lib/destek-chatbot/sistem-promptu";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAKS_GOVDE_KARAKTER = 100_000;
const MAKS_MESAJ_SAYISI = 20;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Yetkisiz.", { status: 401 });
  }

  // Yalnız panel kullanıcıları (portal hastaları da auth.users'ta, onlara kapalı).
  const { data: kullanici } = await supabase.from("kullanici").select("id").eq("id", user.id).maybeSingle();
  if (!kullanici) {
    return new Response("Yetkisiz.", { status: 403 });
  }

  // Maliyet tavanı: aşırı uzun gövde reddedilir, modele yalnız son mesajlar gider.
  const govde = await req.text();
  if (govde.length > MAKS_GOVDE_KARAKTER) {
    return new Response("Mesaj çok uzun.", { status: 413 });
  }
  const { messages }: { messages: UIMessage[] } = JSON.parse(govde);
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("Geçersiz istek.", { status: 400 });
  }

  const result = streamText({
    model: "anthropic/claude-sonnet-5",
    instructions: DESTEK_CHATBOTU_SISTEM_PROMPTU,
    messages: await convertToModelMessages(messages.slice(-MAKS_MESAJ_SAYISI)),
  });

  return result.toUIMessageStreamResponse();
}
