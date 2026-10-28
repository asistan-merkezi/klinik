// Destek chatbotu ÖZELLİK BAYRAĞI. Varsayılan KAPALI: DESTEK_CHATBOT_ACIK ortam değişkeni "1" ya da "true" değilse chatbot yoktur.
// Kapalıyken: sayfa "etkin değil" gösterir, /api/destek-chatbot hiçbir şey okumadan 404 döner ve LLM'e (yurt dışı sağlayıcı) HİÇBİR veri gitmez
// (app/api/destek-chatbot/route.test.ts bunu sınar). Açmak KVKK kararıdır (docs/kvkk-aktarim.md): kullanıcı metni yurt dışı bir modele gider; yine de
// lib/destek-chatbot/maskele.ts kimlik/iletişim/finans numaralarını göndermeden önce siler.
export function chatbotAcikMi(): boolean {
  const v = (process.env.DESTEK_CHATBOT_ACIK ?? "").trim().toLowerCase();
  return v === "1" || v === "true";
}
