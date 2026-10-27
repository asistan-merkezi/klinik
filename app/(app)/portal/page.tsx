import { redirect } from "next/navigation";
import Link from "next/link";
import { withTenant } from "@/lib/db";
import { gecerliHastaBaglami } from "@/lib/auth/gecerli-hasta";
import { portalAnaVeriGetir } from "@/lib/portal/sorgular";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { telefonGoster } from "@/lib/utils";
import { YONTEM_ETIKETLERI } from "@/types/odeme";

import type { PortalRandevuSatir, PortalRandevuTalebiSatir } from "@/types/portal";
import { AktifPaketSatiri } from "@/components/hasta/aktif-paket-satiri";
import { portalCikisYap } from "./actions";
import { IptalTalepButonu } from "./iptal-talep-butonu";

const TALEP_DURUM_ETIKET: Record<PortalRandevuTalebiSatir["durum"], string> = {
  bekliyor: "İnceleniyor",
  onaylandi: "Onaylandı",
  reddedildi: "Reddedildi",
};

const DURUM_ETIKET: Record<PortalRandevuSatir["durum"], string> = {
  planlandi: "Planlandı",
  geldi: "Geldi",
  gecikmeli_geldi: "Gecikmeli Geldi",
  iptal: "İptal",
  gelmedi: "Gelmedi",
  ertelendi: "Ertelendi",
  tamamlandi: "Tamamlandı",
};

export default async function PortalSayfasi() {
  const oturum = await gecerliHastaBaglami();
  if (!oturum) {
    redirect("/portal/giris");
  }

  // hastaId ve tenant OTURUMDAN gelir; RLS ayrıca yalnız bu hastanın kayıtlarını gösterir.
  const { hasta, yaklasan: yaklasanRandevular, gecmis: gecmisRandevular, aktifPaketler, odemeGecmisi, randevuTalepleri } = await withTenant(oturum.bag, (tx) =>
    portalAnaVeriGetir(tx, oturum.hastaId)
  );

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">{hasta?.ad_soyad ?? "Portalım"}</h1>
            <p className="text-sm text-muted-foreground">{telefonGoster(hasta?.telefon)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button nativeButton={false} render={<Link href="/portal/randevu-talep">Randevu Talep Et</Link>} />
            <Button variant="outline" nativeButton={false} render={<Link href="/portal/bilgilerim">Bilgilerim</Link>} />
            <form action={portalCikisYap}>
              <Button type="submit" variant="outline">
                Çıkış yap
              </Button>
            </form>
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Aktif Paketler</CardTitle>
          </CardHeader>
          <CardContent>
            {aktifPaketler.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aktif paketiniz yok.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {aktifPaketler.map((ps) => (
                  <AktifPaketSatiri key={ps.id} paketSatis={ps} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Yaklaşan Randevularım</CardTitle>
          </CardHeader>
          <CardContent>
            {yaklasanRandevular.length === 0 ? (
              <p className="text-sm text-muted-foreground">Yaklaşan randevunuz yok.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {yaklasanRandevular.map((r) => {
                  const talep = r.randevu_iptal_talebi;
                  return (
                    <li
                      key={r.id}
                      className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{formatDateTime(r.baslangic)}</span>
                        <span className="text-muted-foreground">
                          {r.terapist?.personel?.ad_soyad ?? "—"} · {r.oda?.ad ?? "—"} ·{" "}
                          {DURUM_ETIKET[r.durum]}
                        </span>
                      </div>
                      {r.durum === "planlandi" &&
                        (talep ? (
                          <p className="text-xs text-muted-foreground">
                            {talep.durum === "bekliyor" && "İptal talebiniz inceleniyor."}
                            {talep.durum === "onaylandi" && "İptal talebiniz onaylandı."}
                            {talep.durum === "reddedildi" && "İptal talebiniz reddedildi."}
                          </p>
                        ) : (
                          <IptalTalepButonu randevuId={r.id} baslangic={r.baslangic} />
                        ))}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {randevuTalepleri.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Randevu Taleplerim</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col divide-y divide-border">
                {randevuTalepleri.map((t) => (
                  <li key={t.id} className="flex flex-col gap-1 py-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{t.islem_tanimi?.ad ?? "—"}</span>
                      <span className="text-muted-foreground">{TALEP_DURUM_ETIKET[t.durum]}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Tercih: {formatDate(t.tercih_tarih)}
                      {t.tercih_saat ? ` · ${t.tercih_saat.slice(0, 5)}` : ""}
                    </span>
                    {t.not_metni && <span className="text-xs text-muted-foreground">Not: {t.not_metni}</span>}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Geçmiş Randevularım</CardTitle>
          </CardHeader>
          <CardContent>
            {gecmisRandevular.length === 0 ? (
              <p className="text-sm text-muted-foreground">Geçmiş randevu yok.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {gecmisRandevular.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                    <span>
                      {formatDate(r.baslangic)} · {r.terapist?.personel?.ad_soyad ?? "—"}
                    </span>
                    <span className="text-muted-foreground">{DURUM_ETIKET[r.durum]}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ödeme Geçmişi</CardTitle>
          </CardHeader>
          <CardContent>
            {odemeGecmisi.length === 0 ? (
              <p className="text-sm text-muted-foreground">Henüz ödeme yok.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {odemeGecmisi.map((odeme) => (
                  <li key={odeme.id} className="flex flex-col gap-1 py-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{odeme.tur === "iade" ? "İade" : "Ödeme"}</span>
                      <span className="tabular-nums">
                        {(odeme.tur === "iade" ? -odeme.tutar : odeme.tutar).toLocaleString("tr-TR", {
                          style: "currency",
                          currency: "TRY",
                        })}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(odeme.created_at)} ·{" "}
                      {odeme.odeme_yontemi ? YONTEM_ETIKETLERI[odeme.odeme_yontemi] : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
