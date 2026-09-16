import { redirect } from "next/navigation";
import { Smartphone, QrCode } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { QrKart } from "@/components/panel/qr-kart";
import { QrKartYonetilebilir } from "@/components/panel/qr-kart-yonetilebilir";
import { PageHeader } from "@/components/ui/page-header";
import { QR_KOD_TANIMLARI, type QrKodTipi } from "@/lib/qr/qr-kod-tanimlari";

export default async function QrKodlariSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("rol, klinik_id").eq("id", user.id).single();

  if (kullanici?.rol !== "klinik_admin") {
    redirect("/panel/ayarlar");
  }

  const klinikId = kullanici.klinik_id;

  if (!klinikId) {
    return (
      <div className="flex-1 bg-background p-4 sm:p-8">
        <p className="text-sm text-muted-foreground">Klinik bilgisi bulunamadı.</p>
      </div>
    );
  }

  // Tablet Görünümü ayarlarıyla aynı desen: klinik_ayarlar.ayarlar tek jsonb
  // kolonu, admin zaten RLS'ten geçtiği için doğrudan .select() yeterli
  // (anonim public sayfalardaki gibi RPC'ye gerek yok).
  const [{ data: klinikAyarlar }, { data: klinik }] = await Promise.all([
    supabase.from("klinik_ayarlar").select("ayarlar").eq("klinik_id", klinikId).maybeSingle(),
    supabase.from("klinik").select("qr_kisa_kod").eq("id", klinikId).single(),
  ]);

  const kisaKod = klinik?.qr_kisa_kod;

  if (!kisaKod) {
    return (
      <div className="flex-1 bg-background p-4 sm:p-8">
        <p className="text-sm text-muted-foreground">Klinik bilgisi bulunamadı.</p>
      </div>
    );
  }

  const qrKodlariAyarlari: Partial<Record<QrKodTipi, { aktif: boolean }>> =
    (klinikAyarlar?.ayarlar as { qr_kodlari?: Partial<Record<QrKodTipi, { aktif: boolean }>> } | null)?.qr_kodlari ??
    {};

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <PageHeader
          icon={QrCode}
          title="QR Kodları"
          description={
            'Aşağıdaki kare kodları yazdırıp klinikte (resepsiyon, bekleme salonu, ilan panosu vb.) asın. Okutan kişi giriş yapmadan ilgili formu doldurur; kayıtlar klinik panelinize düşer. Bu bağlantılar herkese açıktır — kare kodun görünür olduğu her yerden erişilebilir olduğunu unutmayın. Bir QR kodunu "Aktif" işaretinden kaldırırsanız, o kodu okutan kişiye "kullanım dışı" mesajı gösterilir; formu tekrar doldurulabilir hâle getirmek için yeniden işaretleyin.'
          }
        />
        <p className="-mt-4 text-sm text-muted-foreground">
          İş Başvurusu kare kodu artık burada değil — Personel &gt; İş Başvurusu Ekle sayfasında.
        </p>

        <div className="flex flex-col gap-4">
          {QR_KOD_TANIMLARI.map((tanim) => {
            const Icon = tanim.icon;
            return (
              <QrKartYonetilebilir
                key={tanim.tip}
                tip={tanim.tip}
                icon={<Icon className="size-5 text-primary" aria-hidden />}
                baslik={tanim.baslik}
                aciklama={tanim.aciklama}
                yol={tanim.yol(kisaKod)}
                dosyaAdi={tanim.dosyaAdi}
                goruntuleHref={tanim.goruntuleHref}
                goruntuleEtiket={tanim.goruntuleEtiket}
                baslangicAktif={qrKodlariAyarlari[tanim.tip]?.aktif ?? true}
              />
            );
          })}

          <QrKart
            icon={<Smartphone className="size-5 text-primary" aria-hidden />}
            baslik="Hasta Portalı Girişi"
            aciklama="Hasta bu kodu okutunca giriş ekranına gider, kendi telefon numarası + şifresiyle giriş yapar (yeni hesap açmaz — portal erişimi Hasta Detay'dan açılmalı). Bu, tüm kliniklerin ortak giriş sayfası olduğu için diğer kartlardaki gibi bir Aktif/Pasif anahtarı yok; belirli bir hastanın erişimini kapatmak isterseniz Hasta Detay > Portal Erişimi'nden yapabilirsiniz."
            yol="/portal/giris"
            dosyaAdi="hasta-portal-giris-qr"
          />
        </div>
      </div>
    </div>
  );
}
