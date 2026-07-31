"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { HastaDetay } from "@/types/hasta";
import { ILISKI_TURU_ETIKETLERI } from "@/types/hasta-detay";
import { DetayliBilgilerKarti } from "../detayli-bilgiler-karti";
import { PortalErisimKarti } from "../portal-erisim-karti";
import { PlaceholderSekmesi } from "./placeholder-sekmesi";
import { useHastaHassas, useHastaIliskiler, useHastaSigortalar } from "../queries";

function OnayRozeti({ etiket, tarih }: { etiket: string; tarih: string | null }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{etiket}</span>
      {tarih ? (
        <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          {new Date(tarih).toLocaleDateString("tr-TR")}
        </span>
      ) : (
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">Alınmadı</span>
      )}
    </div>
  );
}

export function KisiselBilgilerSekmesi({
  hasta,
  aktif,
  duzenlenebilir,
  portalDurumu,
}: {
  hasta: HastaDetay;
  aktif: boolean;
  duzenlenebilir: boolean;
  portalDurumu: { var: boolean; aktif: boolean };
}) {
  const { data: hassas, isLoading: hassasYukleniyor } = useHastaHassas(hasta.id, aktif);
  const { data: iliskiler, isLoading: iliskilerYukleniyor } = useHastaIliskiler(hasta.id, aktif);
  const { data: sigortalar, isLoading: sigortalarYukleniyor } = useHastaSigortalar(hasta.id, aktif);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Kimlik & Onaylar</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-y-1.5 text-sm">
            <span className="text-muted-foreground">Doğum Tarihi</span>
            <span>{hasta.dogum_tarihi ? new Date(hasta.dogum_tarihi).toLocaleDateString("tr-TR") : "—"}</span>
            <span className="text-muted-foreground">Cinsiyet</span>
            <span>{hasta.cinsiyet ?? "—"}</span>
            <span className="text-muted-foreground">E-posta</span>
            <span>{hasta.eposta ?? "—"}</span>
            <span className="text-muted-foreground">Bizi Nereden Duydu</span>
            <span>{hasta.referans_kanali ?? "—"}</span>
          </div>
          <div className="flex flex-col gap-1.5 border-t border-border pt-3">
            <OnayRozeti etiket="KVKK Onayı" tarih={hasta.kvkk_onay_tarihi} />
            <OnayRozeti etiket="Sağlık Verisi İşleme Onayı" tarih={hasta.ozel_nitelikli_veri_onay_tarihi} />
            <OnayRozeti etiket="Ticari İleti Onayı" tarih={hasta.ticari_ileti_onay_tarihi} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Acil Durum Kişisi & Adres</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {hassasYukleniyor ? (
            <p className="text-muted-foreground">Yükleniyor...</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-y-1.5">
                <span className="text-muted-foreground">Ad Soyad</span>
                <span>{hassas?.acil_durum_ad_soyad ?? "—"}</span>
                <span className="text-muted-foreground">Yakınlık</span>
                <span>{hassas?.acil_durum_yakinlik ?? "—"}</span>
                <span className="text-muted-foreground">Telefon</span>
                <span>{hassas?.acil_durum_telefon ?? "—"}</span>
              </div>
              <div className="border-t border-border pt-2">
                <span className="text-muted-foreground">Adres</span>
                <p>
                  {[hassas?.mahalle, hassas?.ilce, hassas?.il].filter(Boolean).join(" / ") || "—"}
                </p>
                {hassas?.adres && <p className="text-muted-foreground">{hassas.adres}</p>}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sigorta Bilgileri</CardTitle>
        </CardHeader>
        <CardContent>
          {sigortalarYukleniyor ? (
            <p className="text-sm text-muted-foreground">Yükleniyor...</p>
          ) : !sigortalar || sigortalar.length === 0 ? (
            <p className="text-sm text-muted-foreground">Kayıtlı sigorta yok.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {sigortalar.map((s) => (
                <li key={s.id} className="flex flex-col gap-1 py-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{s.kurum_adi}</span>
                    {s.fatura_kurum_adina && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        Fatura kuruma
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {s.police_no && `Poliçe: ${s.police_no} · `}
                    {s.katilim_payi_orani != null && `Katılım payı: %${s.katilim_payi_orani}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {duzenlenebilir && (
        <Card>
          <CardHeader>
            <CardTitle>Hasta Portalı Erişimi</CardTitle>
          </CardHeader>
          <CardContent>
            <PortalErisimKarti hastaId={hasta.id} telefon={hasta.telefon} durum={portalDurumu} />
          </CardContent>
        </Card>
      )}

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Aile / Yakın Bağlantıları</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {hassasYukleniyor ? (
            <p className="text-sm text-muted-foreground">Yükleniyor...</p>
          ) : hassas?.anne_adi || hassas?.anne_telefon || hassas?.baba_adi || hassas?.baba_telefon ? (
            <div className="grid grid-cols-2 gap-y-1.5 border-b border-border pb-3 text-sm">
              <span className="text-muted-foreground">Anne</span>
              <span>{[hassas?.anne_adi, hassas?.anne_telefon].filter(Boolean).join(" · ") || "—"}</span>
              <span className="text-muted-foreground">Baba</span>
              <span>{[hassas?.baba_adi, hassas?.baba_telefon].filter(Boolean).join(" · ") || "—"}</span>
            </div>
          ) : null}

          {iliskilerYukleniyor ? (
            <p className="text-sm text-muted-foreground">Yükleniyor...</p>
          ) : !iliskiler || iliskiler.length === 0 ? (
            <p className="text-sm text-muted-foreground">Bağlı kişi yok.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {iliskiler.map((i) => (
                <li key={i.id}>
                  <Link
                    href={`/panel/hastalar/${i.iliskili_hasta_id}`}
                    className={cn(
                      "flex items-center justify-between py-2.5 text-sm transition-colors hover:text-primary"
                    )}
                  >
                    <span className="font-medium">{i.iliskili_hasta?.ad_soyad ?? "—"}</span>
                    <span className="text-xs text-muted-foreground">
                      {ILISKI_TURU_ETIKETLERI[i.iliski_turu]}
                      {i.ortak_odeme && " · Ortak ödeme"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Detaylı Bilgiler & Anamnez</CardTitle>
        </CardHeader>
        <CardContent>
          {hassasYukleniyor ? (
            <p className="text-sm text-muted-foreground">Yükleniyor...</p>
          ) : (
            <DetayliBilgilerKarti hasta={hasta} hassas={hassas ?? null} />
          )}
        </CardContent>
      </Card>

      <div className="lg:col-span-2">
        <PlaceholderSekmesi
          baslik="İletişim & Bildirimler"
          aciklama="Bu bölüm yakında eklenecek: iletişim geçmişi, hızlı WhatsApp/SMS, anket sonuçları, randevu öncesi form cevapları."
        />
      </div>
    </div>
  );
}
