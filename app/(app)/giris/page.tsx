import { ShieldCheck, Building2, Lock, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoginForm } from "./login-form";

/**
 * docs/DESIGN.md hedef görsel 3 — sol tanıtım paneli + sağ giriş kartı.
 * Referans görseldeki rol sekmeleri, klinik kodu alanı, "oturumu açık tut"
 * ve "kiosk modu başlat" BİLİNÇLİ OLARAK EKLENMEDİ — hiçbirinin gerçek
 * karşılığı yok: giriş tek bir alan (LoginForm, 2026-09-20'de telefon/e-posta
 * otomatik ayrımına geçti — @ içeriyorsa e-posta+klinik_admin/super_admin,
 * değilse telefon+diğer roller; rol yine sonradan kullanici.rol'den
 * çözülüyor/zorlanıyor, elle seçilmiyor), subdomain/custom_domain kolonları
 * şemada var ama hiçbir kod yolu
 * kullanmıyor, şifre sıfırlama akışı hiç yok, ScheduledLogout zaten
 * resepsiyon/terapist oturumlarını her gece zorla kapatıyor ("açık tut"
 * checkbox'ı bunu değiştirmezdi), kiosk ekranı da girişten ayrı bir staff-PIN
 * akışı (CLAUDE.md) — buraya link koymak sahte bir giriş noktası olurdu.
 * Sol panel "özet kartı" login öncesi klinik bağlamı olmadığı için gerçek
 * veri OLAMAZ — DESIGN'ın izin verdiği gibi (statik/pazarlama) açıkça
 * "Örnek" etiketli, sahte sayı içermeyen bir önizleme olarak tutuldu.
 */
export default function GirisSayfasi() {
  return (
    <div className="dark flex min-h-svh flex-1 bg-background">
      {/* Sol tanıtım paneli — mobilde gizli */}
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-gradient-to-br from-background via-background to-primary/10 p-12 lg:flex">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Activity className="size-5 text-primary" aria-hidden />
          Klinik Asistanı
        </div>

        <div className="flex max-w-md flex-col gap-6">
          <div>
            <h1 className="text-4xl leading-[1.15] font-bold tracking-tight text-foreground">
              Fizyoterapi Kliniğinizi <span className="text-primary">Akıllı ve Zahmetsiz</span> Yönetin.
            </h1>
            <p className="mt-4 text-base text-muted-foreground">
              Hasta takip protokolleri, interaktif anatomik vücut haritası, otomatik seans paketleme ve terapist
              hakediş yönetimi tek bir ekranda.
            </p>
          </div>

          <Card feature className="bg-card/60">
            <CardHeader className="pb-0">
              <div className="flex items-center justify-between">
                <CardTitle>Bugünkü Seans Dağılımı</CardTitle>
                <StatusBadge tone="slate">Örnek</StatusBadge>
              </div>
              <CardDescription>Kadıköy Şubesi</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
                <span className="text-foreground">09:00 — Manuel Terapi</span>
                <StatusBadge tone="emerald">Tamamlandı</StatusBadge>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
                <span className="text-foreground">10:00 — Post-op Rehabilitasyon</span>
                <StatusBadge tone="teal" pulse>
                  Seans Başladı
                </StatusBadge>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
                <span className="text-foreground">11:00 — Kuru İğneleme</span>
                <StatusBadge tone="amber">Beklemede</StatusBadge>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="size-4" aria-hidden /> KVKK Uyumlu
          </span>
          <span className="flex items-center gap-1.5">
            <Building2 className="size-4" aria-hidden /> Çoklu Klinik Mimarisi
          </span>
          <span className="flex items-center gap-1.5">
            <Lock className="size-4" aria-hidden /> Güvenli Bağlantı (SSL)
          </span>
        </div>
      </div>

      {/* Sağ giriş kartı */}
      <div className="flex flex-1 items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-lg">Klinik Giriş Portalı</CardTitle>
            <CardDescription>Personel telefon numarasıyla, yönetici e-posta ile giriş yapar.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
