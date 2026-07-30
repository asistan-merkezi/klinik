"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Mesai saatleri 07:00-20:00. 20:00-07:00 arası (gece) her tam saatte oturum
 * kapanır: 20, 21, 22, 23, 00, 01, 02, 03, 04, 05, 06, 07. 07:00 geçtikten
 * sonra (mesai, 08:00-19:00) bir sonraki kapanış aynı günün 20:00'i olur —
 * mesai boyunca kesintisiz açık kalır, sadece gece boyu saat başı yeniden
 * şifre istenir. Sadece resepsiyon ve terapist rollerine uygulanır — diğer
 * roller (klinik_admin, muhasebe, super_admin) ve hasta portalı bu kısıtlamaya
 * tabi değildir (bkz. KISITLI_ROLLER).
 */
const GECE_KAPANIS_SAATLERI = new Set([20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6, 7]);

const KISITLI_ROLLER = new Set(["resepsiyon", "terapist"]);

// Giriş ekranlarında zaten oturum yok — çalıştırmaya gerek yok.
const GIZLI_ROTALAR = ["/giris", "/portal/giris"];

function sonrakiKapanisZamani(simdi: Date): Date {
  for (let saatFarki = 1; saatFarki <= 25; saatFarki++) {
    const aday = new Date(simdi);
    aday.setMinutes(0, 0, 0);
    aday.setHours(aday.getHours() + saatFarki);
    if (GECE_KAPANIS_SAATLERI.has(aday.getHours())) {
      return aday;
    }
  }
  // Buraya asla düşmemeli (güvenlik amaçlı yedek: bugün 20:00).
  const yedek = new Date(simdi);
  yedek.setHours(20, 0, 0, 0);
  return yedek;
}

export function ScheduledLogout() {
  const pathname = usePathname();
  const router = useRouter();

  const devreDisi = pathname != null && GIZLI_ROTALAR.some((rota) => pathname.startsWith(rota));

  useEffect(() => {
    if (devreDisi) return;

    let iptalEdildi = false;
    let zamanlayiciId: ReturnType<typeof setTimeout>;

    async function oturumuKapat() {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace(pathname?.startsWith("/portal") ? "/portal/giris" : "/giris");
    }

    async function zamanlayiciyiKurGerekirse() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Hasta portalı kullanıcılarının "kullanici" tablosunda kaydı yoktur
      // (ayrı hasta_kullanici tablosu) — kullanici bulunamazsa kısıtlama uygulanmaz.
      const { data: kullanici } = await supabase
        .from("kullanici")
        .select("rol")
        .eq("id", user.id)
        .single();

      if (iptalEdildi || !kullanici || !KISITLI_ROLLER.has(kullanici.rol)) return;

      const simdi = new Date();
      const hedef = sonrakiKapanisZamani(simdi);
      const bekleme = hedef.getTime() - simdi.getTime();

      zamanlayiciId = setTimeout(() => {
        if (!iptalEdildi) oturumuKapat();
      }, bekleme);
    }

    zamanlayiciyiKurGerekirse();

    return () => {
      iptalEdildi = true;
      clearTimeout(zamanlayiciId);
    };
  }, [devreDisi, pathname, router]);

  return null;
}
