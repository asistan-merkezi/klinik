import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Personel Maaş ve Personel Takip şimdilik gezinmeden kaldırıldı (kullanıcı
// kararı: "personel detayına girilince zaten takip ediliyor" — Personel
// Detay > Ödemeler sekmesi bu ihtiyacı karşılıyor). Route'lar (maas/, takip/)
// silinmedi, sadece erişilemez hale getirildi; ileride geri alınabilir.
export default async function PersonelSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  redirect("/panel/personel/liste");
}
