import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Briefcase } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { QrKart } from "@/components/panel/qr-kart";
import { IsBasvuruFormuPdfButonu } from "@/components/panel/is-basvuru-formu-pdf-butonu";
import type { IsBasvurusu } from "@/types/personel";
import { BasvuruListesi } from "./basvuru-listesi";
import { BasvuruArsivi } from "./basvuru-arsivi";

export default async function BasvurularSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("rol, klinik_id").eq("id", user.id).single();

  if (kullanici?.rol !== "klinik_admin") {
    redirect("/panel/personel");
  }

  const klinikId = kullanici.klinik_id;

  const { data: basvurular, error } = await supabase
    .from("is_basvurusu")
    .select(
      "id, ad_soyad, telefon, eposta, dogum_tarihi, tc_kimlik_no, adres, pozisyon, bizi_nereden_duydunuz, calismaya_baslama_tarihi, calisma_sekli, beklenen_ucret, egitim_okul_bolum, egitim_mezuniyet_yili, egitim_sertifikalar, is_deneyimi, referanslar, durum, personel_id, created_at"
    )
    .eq("klinik_id", klinikId ?? "")
    .neq("durum", "olumlu")
    .order("created_at", { ascending: false })
    .returns<IsBasvurusu[]>();

  const liste = basvurular ?? [];
  const bekleyenler = liste.filter((b) => b.durum === "beklemede");

  return (
    <div className="flex-1 bg-background">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 pb-24 sm:p-8">
        <div>
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/panel/personel"><ArrowLeft /> Personel Listesi</Link>} />
        </div>

        <header>
          <h1 className="text-2xl font-semibold tracking-tight">İş Başvurusu</h1>
          <p className="text-sm text-muted-foreground">
            Gelen başvuruları değerlendirin — Olumlu bulduğunuz bir başvuru, bilgileriyle önceden
            doldurulmuş Personel oluşturma formunu açar. Olumsuz/Beklemede kalanlar aşağıdaki arşivde
            ay/yıl bazlı saklanır, hiçbir bilgi silinmez.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col justify-center gap-3 rounded-xl border border-border p-4">
            <p className="text-sm font-medium">Elle Doldurulacak Form</p>
            <p className="text-xs text-muted-foreground">
              Aday kliniğe geldiyse yazdırıp kağıt üzerinde doldurtabilirsiniz.
            </p>
            <IsBasvuruFormuPdfButonu />
          </div>
          {klinikId && (
            <QrKart
              icon={<Briefcase className="size-5 text-primary" aria-hidden />}
              baslik="İş Başvurusu (Web)"
              aciklama="Aday kendi telefonundan/bilgisayarından doldurur — kayıt aşağıdaki listeye düşer."
              yol={`/basvuru/is/${klinikId}`}
              dosyaAdi="is-basvuru-qr"
            />
          )}
        </div>

        {error && <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>}

        {!error && (
          <>
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground">
                Bekleyen Başvurular ({bekleyenler.length})
              </h2>
              <BasvuruListesi basvurular={bekleyenler} />
            </section>

            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground">Arşiv</h2>
              <BasvuruArsivi basvurular={liste} />
            </section>
          </>
        )}
      </div>
    </div>
  );
}
