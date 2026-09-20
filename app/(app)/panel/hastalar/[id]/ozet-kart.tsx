"use client";

import Link from "next/link";
import { Phone, Mail, CalendarClock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import { telefonGoster } from "@/lib/utils";
import { useHastaSigortalar } from "./queries";

function yasHesapla(dogumTarihi: string | null): number | null {
  if (!dogumTarihi) return null;
  const dogum = new Date(dogumTarihi);
  const bugun = new Date();
  let yas = bugun.getFullYear() - dogum.getFullYear();
  const ayFarki = bugun.getMonth() - dogum.getMonth();
  if (ayFarki < 0 || (ayFarki === 0 && bugun.getDate() < dogum.getDate())) {
    yas--;
  }
  return yas;
}

/**
 * Dosya başlığı (docs/DESIGN.md hedef görsel). Referans görseldeki "Seansı
 * Başlat" ve "Rapor/Reçete" butonları BİLİNÇLİ OLARAK eklenmedi — hiçbirinin
 * gerçek bir karşılığı yok: "Seansı Başlat" diye ayrı bir aksiyon/RPC hiç
 * yok (check-in randevu bazlı, Randevu Çizelgesi'ndeki "Geldi" butonuyla
 * yapılıyor, hasta başlığından tetiklenen genel bir "seans başlat" akışı
 * yok); "Rapor/Reçete" için de hasta bazlı bir PDF/rapor üretimi (Cari
 * Hareketler PDF'i dışında, o da bu bağlamda değil) hiç yapılmadı. Maskeli
 * TC de eklenmedi — hasta_hassas RLS'te terapist'e kısıtlı, bu paylaşılan
 * (tüm rollere görünen) başlıkta yeni bir sorgu+maskeleme+rol mantığı
 * açmak "sadece görünüm" kapsamının dışına taşırdı.
 */
export function OzetKart({
  hastaId,
  adSoyad,
  telefon,
  eposta,
  dogumTarihi,
  kalanPaketHakki,
}: {
  hastaId: string;
  adSoyad: string;
  telefon: string;
  eposta: string | null;
  dogumTarihi: string | null;
  kalanPaketHakki: number | null;
}) {
  const yas = yasHesapla(dogumTarihi);
  const { data: sigortalar } = useHastaSigortalar(hastaId, true);
  const sigortaliMi = (sigortalar?.length ?? 0) > 0;

  return (
    <Card>
      <CardContent className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Avatar name={adSoyad} />
          <div className="flex flex-col gap-1.5">
            <h1 className="text-xl font-semibold text-foreground">{adSoyad}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <a href={`tel:${telefon}`} className="flex items-center gap-1.5 tabular-nums hover:text-foreground">
                <Phone className="size-3.5 shrink-0 text-primary" aria-hidden />
                {telefonGoster(telefon)}
              </a>
              {eposta && (
                <a href={`mailto:${eposta}`} className="flex items-center gap-1.5 hover:text-foreground">
                  <Mail className="size-3.5 shrink-0 text-primary" aria-hidden />
                  {eposta}
                </a>
              )}
              {yas != null && <span className="tabular-nums">{yas} yaşında</span>}
            </div>
            {(sigortaliMi || (kalanPaketHakki ?? 0) > 0) && (
              <div className="flex flex-wrap gap-1.5">
                {sigortaliMi && <StatusBadge tone="sky">Sigortalı</StatusBadge>}
                {(kalanPaketHakki ?? 0) > 0 && <StatusBadge tone="teal">Aktif Paket · {kalanPaketHakki} hak</StatusBadge>}
              </div>
            )}
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-9 shrink-0 gap-1.5 px-3 text-muted-foreground"
          nativeButton={false}
          render={
            <Link href={`/panel/hastalar/${hastaId}/randevu`}>
              <CalendarClock className="size-4" aria-hidden />
              Randevu Takip
            </Link>
          }
        />
      </CardContent>
    </Card>
  );
}
