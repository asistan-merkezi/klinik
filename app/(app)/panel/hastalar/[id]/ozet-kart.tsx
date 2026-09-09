"use client";

import { useState } from "react";
import { Phone, Mail, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import { telefonGoster } from "@/lib/utils";
import { RiskDetayModal } from "./risk-bandi";
import { useHastaSigortalar } from "./queries";
import type { Cinsiyet, HastaKategori } from "@/types/hasta";

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

const CINSIYET_ETIKETLERI: Record<Cinsiyet, string | null> = {
  kadin: "Kadın",
  erkek: "Erkek",
  belirtilmemis: null,
};

const KATEGORI_ETIKETLERI: Record<HastaKategori, string> = {
  vita: "Vita",
  plus: "Plus",
  elit: "Elit",
  prime: "Prime",
};

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
  cinsiyet,
  kategori,
  kalanPaketHakki,
  riskBayraklariBos,
  eklenebilir,
}: {
  hastaId: string;
  adSoyad: string;
  telefon: string;
  eposta: string | null;
  dogumTarihi: string | null;
  cinsiyet: Cinsiyet | null;
  kategori: HastaKategori;
  kalanPaketHakki: number | null;
  riskBayraklariBos: boolean;
  eklenebilir: boolean;
}) {
  const [modalAcik, setModalAcik] = useState(false);
  const [formAcik, setFormAcik] = useState(false);
  const yas = yasHesapla(dogumTarihi);
  const cinsiyetEtiketi = cinsiyet ? CINSIYET_ETIKETLERI[cinsiyet] : null;
  const { data: sigortalar } = useHastaSigortalar(hastaId, true);
  const sigortaliMi = (sigortalar?.length ?? 0) > 0;

  return (
    <Card>
      <CardContent className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Avatar name={adSoyad} />
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-foreground">{adSoyad}</h1>
              <StatusBadge tone="slate">{KATEGORI_ETIKETLERI[kategori]}</StatusBadge>
              {cinsiyetEtiketi && (
                <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                  {cinsiyetEtiketi}
                </span>
              )}
            </div>
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

        {riskBayraklariBos && eklenebilir && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 shrink-0 gap-1.5 px-3 text-muted-foreground"
              onClick={() => {
                setModalAcik(true);
                setFormAcik(true);
              }}
            >
              <ShieldAlert className="size-4" aria-hidden />
              Risk Bayrağı
            </Button>
            <RiskDetayModal
              acik={modalAcik}
              onOpenChange={setModalAcik}
              hastaId={hastaId}
              riskBayraklari={[]}
              eklenebilir={eklenebilir}
              formAcik={formAcik}
              setFormAcik={setFormAcik}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
