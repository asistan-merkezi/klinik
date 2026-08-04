import { redirect } from "next/navigation";
import { UserPlus, Briefcase, ClipboardEdit, Contact } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { QrKart } from "@/components/panel/qr-kart";

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

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header>
          <h1 className="text-xl font-semibold">QR Kodları</h1>
          <p className="text-sm text-muted-foreground">
            Aşağıdaki kare kodları yazdırıp klinikte (resepsiyon, bekleme salonu, ilan panosu vb.) asın.
            Okutan kişi giriş yapmadan ilgili formu doldurur; kayıtlar klinik panelinize düşer. Bu
            bağlantılar herkese açıktır — kare kodun görünür olduğu her yerden erişilebilir olduğunu
            unutmayın.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <QrKart
            icon={UserPlus}
            baslik="Hasta Ön Kayıt"
            aciklama="Hasta kendi ad-soyad, telefon ve kimlik bilgilerini girerek ön kayıt oluşturur. Kayıtlar doğrudan Hastalar listesinde görünür."
            yol={`/kayit/hasta/${klinikId}`}
            dosyaAdi="hasta-on-kayit-qr"
            goruntuleHref="/panel/hastalar"
            goruntuleEtiket="Hastalar listesini görüntüle"
          />
          <QrKart
            icon={Contact}
            baslik="Personel Başvurusu"
            aciklama="Kişi kendi bilgilerini girer; klinik_admin onaylamadan hiçbir hesap açılmaz (onay bekleyen taslak)."
            yol={`/kayit/personel/${klinikId}`}
            dosyaAdi="personel-basvuru-qr"
            goruntuleHref="/panel/ayarlar/qr-kodlar/personel-basvurulari"
          />
          <QrKart
            icon={Briefcase}
            baslik="İş Başvurusu"
            aciklama="Kısa bir iş başvuru formu — ad soyad, telefon, pozisyon ve mesaj."
            yol={`/basvuru/is/${klinikId}`}
            dosyaAdi="is-basvuru-qr"
            goruntuleHref="/panel/ayarlar/qr-kodlar/is-basvurulari"
          />
          <QrKart
            icon={ClipboardEdit}
            baslik="Anket ve Öneriler"
            aciklama="Hasta memnuniyet puanı ve öneri bırakır; isim/telefon opsiyoneldir."
            yol={`/anket/${klinikId}`}
            dosyaAdi="anket-oneri-qr"
            goruntuleHref="/panel/ayarlar/qr-kodlar/anket-yanitlari"
          />
        </div>
      </div>
    </div>
  );
}
