import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { YazdirButonu } from "@/components/panel/yazdir-butonu";
import { ONAY_ACIKLAMALARI } from "@/lib/onay-metinleri";

function Bolum({ baslik, children }: { baslik: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 border-t border-border pt-4 first:mt-0 first:border-t-0 first:pt-0 print:border-black/20">
      <p className="mb-3 text-sm font-semibold uppercase tracking-wide">{baslik}</p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">{children}</div>
    </section>
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
      <span className="text-xs text-muted-foreground print:text-black/70">{etiket}</span>
      {Array.from({ length: satir ?? 1 }).map((_, i) => (
        <span key={i} className="h-6 border-b border-border print:border-black/40" />
      ))}
    </div>
  );
}

function Onay({ etiket, aciklama }: { etiket: string; aciklama?: string }) {
  return (
    <div className="col-span-2 flex items-start gap-2">
      <span className="mt-0.5 size-4 shrink-0 border border-foreground/60 print:border-black/60" />
      <div className="flex flex-col gap-0.5">
        <span className="text-sm">{etiket}</span>
        {aciklama && <span className="text-xs text-muted-foreground print:text-black/60">{aciklama}</span>}
      </div>
    </div>
  );
}

function EvetHayirSatiri({ etiket, aciklamaEtiketi }: { etiket: string; aciklamaEtiketi?: string }) {
  return (
    <div className="col-span-2 flex flex-col gap-2 border-b border-border/60 pb-3 print:border-black/10">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">{etiket}</span>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1">
            <span className="size-3.5 shrink-0 border border-foreground/60 print:border-black/60" /> Evet
          </span>
          <span className="flex items-center gap-1">
            <span className="size-3.5 shrink-0 border border-foreground/60 print:border-black/60" /> Hayır
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground print:text-black/70">{aciklamaEtiketi ?? "Açıklama"}</span>
        <span className="h-6 border-b border-border print:border-black/40" />
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
          <Button variant="outline" nativeButton={false} render={<Link href="/panel/hastalar"><ArrowLeft /> Hastalara dön</Link>} />
          <YazdirButonu />
        </div>

        <div className="rounded-xl border border-border bg-card p-8 text-card-foreground print:rounded-none print:border-0 print:bg-white print:p-10 print:text-black">
          <header className="mb-6 flex items-end justify-between border-b border-border pb-4 print:border-black/30">
            <div>
              <p className="text-lg font-semibold">{klinikAdi}</p>
              <p className="text-sm text-muted-foreground print:text-black/70">
                Yeni Hasta Kayıt Formu — elle doldurulacaktır
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
            <Alan etiket="Anne Adı" />
            <Alan etiket="Anne Telefonu" />
            <Alan etiket="Baba Adı" />
            <Alan etiket="Baba Telefonu" />
            <Alan etiket="Diğer Yakını Ad Soyad" />
            <Alan etiket="Diğer Yakını Telefonu" />
            <Alan etiket="Diğer Yakını Yakınlık Derecesi (Teyze, Amca, Dede...)" genis />
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
          </Bolum>

          <Bolum baslik="Onaylar">
            <Onay
              etiket="KVKK Aydınlatma Metni'ni okudum, kişisel verilerimin işlenmesini onaylıyorum."
              aciklama={ONAY_ACIKLAMALARI.kvkk.metin}
            />
            <Onay
              etiket="Sağlık verilerimin (tıbbi geçmiş) tedavi amacıyla işlenmesine açık rıza veriyorum."
              aciklama={ONAY_ACIKLAMALARI.saglik.metin}
            />
            <Onay
              etiket="Randevu/paket/bakiye bilgilendirmesi için WhatsApp mesajı almak istiyorum."
              aciklama={ONAY_ACIKLAMALARI.whatsapp.metin}
            />
            <Onay
              etiket="Kampanya ve bilgilendirme amaçlı SMS/e-posta almak istiyorum."
              aciklama={ONAY_ACIKLAMALARI.ticari.metin}
            />
          </Bolum>

          <div className="mt-10 flex items-end justify-between border-t border-border pt-6 text-sm print:border-black/20">
            <span>Ad Soyad: ________________________________</span>
            <span>İmza: ________________________________</span>
          </div>
        </div>
      </div>
    </div>
  );
}
