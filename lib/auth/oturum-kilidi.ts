import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Tek oturum kilidi: aynı kullanıcı+şifreyle aynı anda yalnız 1 cihaz/tarayıcı
 * açık kalsın (admin dahil, kullanıcı kararı 2026-09-27). Girişte
 * oturum_anahtari_yenile() RPC'siyle oturum_kilidi tablosuna rastgele bir
 * anahtar yazılır ve aynı anahtar tarayıcıya cookie olarak konur; sonraki her
 * panel/portal sayfa yüklemesinde ikisi karşılaştırılır (bkz.
 * lib/auth/gecerli-kullanici.ts, lib/auth/gecerli-hasta.ts). Başka bir yerden
 * yeniden giriş yapılınca satır güncellenir, eski tarayıcının anahtarı artık
 * eşleşmez ve o oturum /oturum-cikis üzerinden zorla kapatılır.
 *
 * HENÜZ AKTİF DEĞİL: supabase/migrations/20260927140000_tek_oturum_kilidi.sql
 * bu turda yazıldı ama canlı Supabase'e KASITLI olarak uygulanmadı (Vodafone
 * cloud sunucuya geçişte uygulanacak, bkz. root CLAUDE.md). Migration
 * uygulanana kadar oturum_kilidi tablosu/RPC'si yok — aşağıdaki her çağrı bu
 * yüzden hatayı sessizce yutup fail-open davranır: migration uygulanmadan bu
 * kod deploy edilirse tüm girişler kırılmasın diye (bkz. migration_before_push
 * hafıza kaydı — geçmişte bunun tam tersi bir sırayla tam bir prod kesintisi
 * yaşanmış).
 */
export const OTURUM_ANAHTARI_COOKIE = "oturum_anahtari";

export async function oturumKilidiYenile(supabase: SupabaseClient): Promise<void> {
  try {
    const { data, error } = await supabase.rpc("oturum_anahtari_yenile");
    if (error || !data) {
      return;
    }

    const cookieStore = await cookies();
    cookieStore.set(OTURUM_ANAHTARI_COOKIE, String(data), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
  } catch {
    // Migration henüz uygulanmadıysa RPC yok — bkz. dosya başı not.
  }
}

/**
 * Satır hiç yoksa (bu kullanıcı hiç oturumKilidiYenile()'den geçmemiş — ör.
 * migration henüz uygulanmadı ya da eski bir oturum) KASITLI olarak true
 * döner: kilit hiç kurulmamışken zorla çıkışa sürüklemek yalnız migration
 * anında TÜM açık oturumları gereksiz yere kırar. Kilit ancak birileri
 * (bu tarayıcı ya da başka biri) gerçekten bu RPC'den geçtiğinde devreye
 * girer — o andan sonra eşleşmeyen her tarayıcı bir sonraki sayfa
 * yüklemesinde düşer.
 */
export async function oturumKilidiGecerliMi(
  supabase: SupabaseClient,
  kullaniciId: string
): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const anahtar = cookieStore.get(OTURUM_ANAHTARI_COOKIE)?.value ?? null;

    const { data, error } = await supabase
      .from("oturum_kilidi")
      .select("oturum_anahtari")
      .eq("kullanici_id", kullaniciId)
      .maybeSingle();

    if (error || !data) {
      return true;
    }

    return data.oturum_anahtari === anahtar;
  } catch {
    return true;
  }
}
