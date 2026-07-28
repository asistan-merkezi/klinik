"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { MusteriDetay } from "@/types/musteri";
import { ILISKI_TURU_ETIKETLERI } from "@/types/musteri-detay";
import { PortalErisimKarti } from "../portal-erisim-karti";
import { useMusteriHassas, useMusteriIliskiler, useMusteriSigortalar } from "../queries";

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

export function GenelBilgilerSekmesi({
  musteri,
  aktif,
  duzenlenebilir,
  portalDurumu,
}: {
  musteri: MusteriDetay;
  aktif: boolean;
  duzenlenebilir: boolean;
  portalDurumu: { var: boolean; aktif: boolean };
}) {
  const { data: hassas, isLoading: hassasYukleniyor } = useMusteriHassas(musteri.id, aktif);
  const { data: iliskiler, isLoading: iliskilerYukleniyor } = useMusteriIliskiler(musteri.id, aktif);
  const { data: sigortalar, isLoading: sigortalarYukleniyor } = useMusteriSigortalar(musteri.id, aktif);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Kimlik & Onaylar</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-y-1.5 text-sm">
            <span className="text-muted-foreground">Doğum Tarihi</span>
            <span>{musteri.dogum_tarihi ? new Date(musteri.dogum_tarihi).toLocaleDateString("tr-TR") : "—"}</span>
            <span className="text-muted-foreground">Cinsiyet</span>
            <span>{musteri.cinsiyet ?? "—"}</span>
            <span className="text-muted-foreground">E-posta</span>
            <span>{musteri.eposta ?? "—"}</span>
            <span className="text-muted-foreground">Bizi Nereden Duydu</span>
            <span>{musteri.referans_kanali ?? "—"}</span>
          </div>
          <div className="flex flex-col gap-1.5 border-t border-border pt-3">
            <OnayRozeti etiket="KVKK Onayı" tarih={musteri.kvkk_onay_tarihi} />
            <OnayRozeti etiket="Sağlık Verisi İşleme Onayı" tarih={musteri.ozel_nitelikli_veri_onay_tarihi} />
            <OnayRozeti etiket="Ticari İleti Onayı" tarih={musteri.ticari_ileti_onay_tarihi} />
          </div>
          <p className="text-xs text-muted-foreground">
            Kimlik/anamnez bilgilerini düzenlemek için{" "}
            <a href="?tab=tedavi" className="underline decoration-dotted underline-offset-2">
              Tedavi & Anamnez
            </a>{" "}
            sekmesine gidin.
          </p>
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
                <p>{hassas?.adres ?? "—"}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Veli Bilgisi</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            18 yaş altı hastalar için veli bilgisi modülü henüz eklenmedi.
          </p>
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
            <CardTitle>Müşteri Portalı Erişimi</CardTitle>
          </CardHeader>
          <CardContent>
            <PortalErisimKarti musteriId={musteri.id} telefon={musteri.telefon} durum={portalDurumu} />
          </CardContent>
        </Card>
      )}

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Aile / Yakın Bağlantıları</CardTitle>
        </CardHeader>
        <CardContent>
          {iliskilerYukleniyor ? (
            <p className="text-sm text-muted-foreground">Yükleniyor...</p>
          ) : !iliskiler || iliskiler.length === 0 ? (
            <p className="text-sm text-muted-foreground">Bağlı kişi yok.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {iliskiler.map((i) => (
                <li key={i.id}>
                  <Link
                    href={`/panel/musteriler/${i.iliskili_musteri_id}`}
                    className={cn(
                      "flex items-center justify-between py-2.5 text-sm transition-colors hover:text-primary"
                    )}
                  >
                    <span className="font-medium">{i.iliskili_musteri?.ad_soyad ?? "—"}</span>
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
    </div>
  );
}
