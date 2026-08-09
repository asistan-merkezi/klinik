import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { KayitFormuPdfButonu } from "@/components/panel/kayit-formu-pdf-butonu";
import { ONAY_ACIKLAMALARI } from "@/lib/onay-metinleri";

function Sayfa({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-[794px] max-w-full overflow-hidden rounded-xl border border-neutral-200 shadow-sm">
      <div className="pdf-sayfa box-border w-[794px] max-w-full bg-white p-8 text-black sm:p-10">
        {children}
      </div>
    </div>
  );
}

function Bolum({ baslik, children }: { baslik: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <p className="mb-3 text-sm font-semibold tracking-wide uppercase">{baslik}</p>
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
      <span className="text-xs text-black/70">{etiket}</span>
      {Array.from({ length: satir ?? 1 }).map((_, i) => (
        <span key={i} className="h-6 border-b border-black/40" />
      ))}
    </div>
  );
}

function Onay({ etiket, aciklama }: { etiket: string; aciklama?: string }) {
  return (
    <div className="col-span-2 flex min-w-0 items-start gap-2">
      <span className="mt-0.5 size-4 shrink-0 border border-black/60" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm break-words">{etiket}</span>
        {aciklama && <span className="text-xs break-words text-black/60">{aciklama}</span>}
      </div>
    </div>
  );
}

function EvetHayirSatiri({ etiket, aciklamaEtiketi }: { etiket: string; aciklamaEtiketi?: string }) {
  return (
    <div className="col-span-2 flex flex-col gap-2 pb-3">
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
    .select("ad, logo_url")
    .eq("id", kullanici?.klinik_id ?? "")
    .maybeSingle();

  const klinikAdi = klinik?.ad ?? "Klinik";
  const logoUrl = klinik?.logo_url ?? null;

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-[850px] flex-col gap-6">
        <div className="flex items-center justify-between">
          <Button variant="outline" nativeButton={false} render={<Link href="/panel/hastalar"><ArrowLeft /> Hastalara dön</Link>} />
          <KayitFormuPdfButonu />
        </div>

        {/* Sayfa 1: Kimlik & İletişim, Veli Bilgisi, Acil Durum Kişisi */}
        <Sayfa>
          <header className="mb-6 flex items-end justify-between">
            <div className="flex items-center gap-3">
              {logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" crossOrigin="anonymous" className="h-12 w-auto object-contain" />
              )}
              <div>
                <p className="text-lg font-semibold">{klinikAdi}</p>
                <p className="text-sm text-black/70">Yeni Hasta Kayıt Formu — elle doldurulacaktır</p>
              </div>
            </div>
            <p className="text-xs text-black/70">Tarih: ____ / ____ / ______</p>
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
        </Sayfa>

        {/* Sayfa 2: Tıbbi Ön Geçmiş */}
        <Sayfa>
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
        </Sayfa>

        {/* Sayfa 3: Geliş Sebebi & Klinik Notları, Onaylar, imza */}
        <Sayfa>
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

          <div className="mt-10 flex items-end justify-between border-t border-black/20 pt-6 text-sm">
            <span>Ad Soyad: ________________________________</span>
            <span>İmza: ________________________________</span>
          </div>
        </Sayfa>
      </div>
    </div>
  );
}
