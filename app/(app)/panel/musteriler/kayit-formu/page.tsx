import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { YazdirButonu } from "./yazdir-butonu";

function Bolum({ baslik, children }: { baslik: string; children: React.ReactNode }) {
  return (
    <fieldset className="mt-6 border-t border-black/20 pt-4 first:mt-0 first:border-t-0 first:pt-0">
      <legend className="mb-3 text-sm font-semibold uppercase tracking-wide">{baslik}</legend>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">{children}</div>
    </fieldset>
  );
}

function Alan({
  etiket,
  genis,
  satir,
}: {
  etiket: string;
  genis?: boolean;
  satir?: number;
}) {
  return (
    <div className={genis ? "col-span-2 flex flex-col gap-1" : "flex flex-col gap-1"}>
      <span className="text-xs text-black/70">{etiket}</span>
      {Array.from({ length: satir ?? 1 }).map((_, i) => (
        <span key={i} className="h-6 border-b border-black/40" />
      ))}
    </div>
  );
}

function Onay({ etiket }: { etiket: string }) {
  return (
    <div className="col-span-2 flex items-start gap-2">
      <span className="mt-0.5 size-4 shrink-0 border border-black/60" />
      <span className="text-sm">{etiket}</span>
    </div>
  );
}

function EvetHayirSatiri({ etiket, aciklamaEtiketi }: { etiket: string; aciklamaEtiketi?: string }) {
  return (
    <div className="col-span-2 flex flex-col gap-2 border-b border-black/10 pb-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">{etiket}</span>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1">
            <span className="size-3.5 shrink-0 border border-black/60" /> Evet
          </span>
          <span className="flex items-center gap-1">
            <span className="size-3.5 shrink-0 border border-black/60" /> Hayır
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-black/70">{aciklamaEtiketi ?? "Açıklama"}</span>
        <span className="h-6 border-b border-black/40" />
      </div>
    </div>
  );
}

export default async function KayitFormuSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("klinik_id")
    .eq("id", user.id)
    .single();

  const { data: klinik } = await supabase
    .from("klinik")
    .select("ad")
    .eq("id", kullanici?.klinik_id ?? "")
    .maybeSingle();

  const klinikAdi = klinik?.ad ?? "Klinik";

  return (
    <div className="flex-1 bg-background p-4 sm:p-8 print:bg-white print:p-0">
      <style>{`@media print { aside { display: none !important; } @page { margin: 12mm; } }`}</style>
      <div className="mx-auto flex max-w-3xl flex-col gap-6 print:max-w-none print:gap-0">
        <div className="flex items-center justify-between print:hidden">
          <Button variant="outline" nativeButton={false} render={<Link href="/panel/musteriler"><ArrowLeft /> Müşterilere dön</Link>} />
          <YazdirButonu />
        </div>

        <div className="rounded-xl border border-border bg-card p-8 text-card-foreground print:rounded-none print:border-0 print:bg-white print:p-10 print:text-black">
          <header className="mb-6 flex items-end justify-between border-b border-black/30 pb-4">
            <div>
              <p className="text-lg font-semibold">{klinikAdi}</p>
              <p className="text-sm text-muted-foreground print:text-black/70">
                Yeni Müşteri Kayıt Formu — elle doldurulacaktır
              </p>
            </div>
            <p className="text-xs text-muted-foreground print:text-black/70">Tarih: ____ / ____ / ______</p>
          </header>

          <Bolum baslik="Kimlik & İletişim Bilgileri">
            <Alan etiket="Ad Soyad" genis />
            <Alan etiket="Doğum Tarihi" />
            <Alan etiket="Cinsiyet (K / E / Belirtmek istemiyorum)" />
            <Alan etiket="Telefon" />
            <Alan etiket="E-posta (opsiyonel)" />
            <Alan etiket="T.C. Kimlik No / Pasaport No" />
            <Alan etiket="Adres" genis satir={2} />
            <Alan etiket="Bizi Nereden Duydunuz?" genis />
          </Bolum>

          <Bolum baslik="Veli Bilgisi (18 yaş altı hasta için)">
            <Alan etiket="Ad Soyad" />
            <Alan etiket="Yakınlığı" />
            <Alan etiket="Telefon" />
          </Bolum>

          <Bolum baslik="Acil Durum Kişisi">
            <Alan etiket="Ad Soyad" />
            <Alan etiket="Yakınlığı" />
            <Alan etiket="Telefon" />
          </Bolum>

          <Bolum baslik="Tıbbi Ön Geçmiş">
            <EvetHayirSatiri etiket="⚠ Alerji Durumu" aciklamaEtiketi="İlaç, lateks, lokal/genel anestezi, gıda vb. detaylar" />
            <EvetHayirSatiri etiket="🩸 Kan Sulandırıcı Kullanımı" aciklamaEtiketi="İlaç adı, dozu ve en son ne zaman alındığı" />
            <EvetHayirSatiri etiket="Kronik Hastalıklar" aciklamaEtiketi="Hipertansiyon, diyabet, kalp, astım vb. detayı" />
            <EvetHayirSatiri etiket="Sürekli Kullanılan İlaçlar" aciklamaEtiketi="Düzenli alınan tüm ilaçların adları" />
            <EvetHayirSatiri etiket="Geçirilmiş Ameliyatlar" aciklamaEtiketi="Ameliyat türü ve yılları" />
            <EvetHayirSatiri etiket="Bulaşıcı / Enfeksiyöz Hastalık" aciklamaEtiketi="Hepatit, HIV, tüberküloz vb. detayı" />
            <EvetHayirSatiri etiket="Protez / Kalp Pili / İmplant" aciklamaEtiketi="Vücutta bulunan protez veya tıbbi cihazlar" />
            <EvetHayirSatiri etiket="Hamilelik / Emzirme Durumu (kadın hastalar için)" aciklamaEtiketi="Hafta/ay bilgisi veya özel durumlar" />
            <EvetHayirSatiri etiket="Sigara / Alkol / Madde Kullanımı" aciklamaEtiketi="Tüketim sıklığı ve miktarı" />
          </Bolum>

          <Bolum baslik="Geliş Sebebi & Klinik Notları">
            <Alan etiket="Şikayet / Geliş Sebebi" genis satir={2} />
            <div className="col-span-2 flex items-center justify-between text-sm">
              <span>Öncelik / Aciliyet Durumu</span>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1">
                  <span className="size-3.5 shrink-0 border border-black/60" /> Normal
                </span>
                <span className="flex items-center gap-1">
                  <span className="size-3.5 shrink-0 border border-black/60" /> Öncelikli
                </span>
                <span className="flex items-center gap-1">
                  <span className="size-3.5 shrink-0 border border-black/60" /> Acil
                </span>
              </div>
            </div>
          </Bolum>

          <Bolum baslik="Onaylar">
            <Onay etiket="KVKK Aydınlatma Metni'ni okudum, kişisel verilerimin işlenmesini onaylıyorum." />
            <Onay etiket="Sağlık verilerimin (tıbbi geçmiş) tedavi amacıyla işlenmesine açık rıza veriyorum." />
            <Onay etiket="Randevu/paket/bakiye bilgilendirmesi için WhatsApp mesajı almak istiyorum." />
            <Onay etiket="Kampanya ve bilgilendirme amaçlı SMS/e-posta almak istiyorum." />
          </Bolum>

          <div className="mt-10 flex items-end justify-between border-t border-black/20 pt-6 text-sm">
            <span>Ad Soyad: ________________________________</span>
            <span>İmza: ________________________________</span>
          </div>
        </div>
      </div>
    </div>
  );
}
