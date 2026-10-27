import { toNextJsHandler } from "better-auth/next-js";
import { kimlik } from "@/lib/auth/auth";

// Better Auth HTTP uçları (/api/auth/*). Örn. şifre sıfırlama bağlantısı /api/auth/reset-password/:jeton burada karşılanır.
// Örnek tembel oluşturulur: build sırasında ortam değişkenleri yokken modül yüklenmesi hata vermesin.
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return toNextJsHandler(kimlik()).GET(request);
}
export function POST(request: Request) {
  return toNextJsHandler(kimlik()).POST(request);
}
