import { redirect } from "next/navigation";

// Bu ekran /panel/ayarlar/mesajlasma'ya taşındı (kredi bazlı, kural
// matrisli tam bir mesajlaşma yönetim modülüne dönüştürüldü) — eski
// bağlantı/bookmark kırılmasın diye burada sadece yönlendirme kaldı.
export default function WhatsappAyarlariSayfasi() {
  redirect("/panel/ayarlar/mesajlasma");
}
