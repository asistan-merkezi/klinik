import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createClient } from "@/lib/supabase/server";
import { DESTEK_CHATBOTU_SISTEM_PROMPTU } from "@/lib/destek-chatbot/sistem-promptu";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Yetkisiz.", { status: 401 });
  }

  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: "anthropic/claude-sonnet-5",
    instructions: DESTEK_CHATBOTU_SISTEM_PROMPTU,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
