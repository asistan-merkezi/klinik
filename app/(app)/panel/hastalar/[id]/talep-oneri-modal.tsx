"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, CalendarX, CalendarClock, MessageCircle, MessageSquareText, type LucideIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { formatDate, formatDateForInput, formatDateTime } from "@/lib/datetime";
import { talepOneriGonder } from "./actions";
import { useHastaTalepIcinRandevular, useHastaTalepVeOneriler, useIslemTanimlari } from "./queries";
import type { IptalTalebiDurum } from "@/types/portal";

type TalepTuru = "randevu_talebi" | "randevu_iptali" | "randevu_ertele" | "terapist_yorumu" | "randevu_yorumu";

const TALEP_TURU_SECENEKLERI: { value: TalepTuru; label: string; icon: LucideIcon }[] = [
  { value: "randevu_talebi", label: "Randevu Talebi", icon: CalendarPlus },
  { value: "randevu_iptali", label: "Randevu İptali", icon: CalendarX },
  { value: "randevu_ertele", label: "Randevu Ertele", icon: CalendarClock },
  { value: "terapist_yorumu", label: "Terapist Yorumu", icon: MessageCircle },
  { value: "randevu_yorumu", label: "Randevu Hakkında Yorum", icon: MessageSquareText },
];

const KATILDI_DURUMLARI = ["geldi", "gecikmeli_geldi", "tamamlandi"];

const PUAN_SECENEKLERI: { deger: number; emoji: string; etiket: string }[] = [
  { deger: 1, emoji: "😟", etiket: "Çok Yetersiz" },
  { deger: 2, emoji: "🙁", etiket: "Yetersiz" },
  { deger: 3, emoji: "😐", etiket: "Orta" },
  { deger: 4, emoji: "🙂", etiket: "İyi" },
  { deger: 5, emoji: "😊", etiket: "Çok İyi" },
];

const TALEP_DURUM_TONU: Record<IptalTalebiDurum, StatusTone> = {
  bekliyor: "amber",
  onaylandi: "emerald",
  reddedildi: "rose",
};

const TALEP_DURUM_ETIKET: Record<IptalTalebiDurum, string> = {
  bekliyor: "İnceleniyor",
  onaylandi: "Onaylandı",
  reddedildi: "Reddedildi",
};

export function TalepOneriModal({
  acik,
  onOpenChange,
  hastaId,
}: {
  acik: boolean;
  onOpenChange: (acik: boolean) => void;
  hastaId: string;
}) {
  const queryClient = useQueryClient();
  const [tur, setTur] = useState<TalepTuru>("randevu_talebi");
  const [terapistId, setTerapistId] = useState<string>("");
  const [randevuId, setRandevuId] = useState<string>("");
  const [puan, setPuan] = useState<number | null>(null);

  const gonder = async (onceki: Awaited<ReturnType<typeof talepOneriGonder>>, formData: FormData) => {
    const sonuc = await talepOneriGonder(hastaId, onceki, formData);
    if (sonuc?.success) {
      queryClient.invalidateQueries({ queryKey: ["hasta_talep_oneri", hastaId] });
      setRandevuId("");
      setPuan(null);
    }
    return sonuc;
  };
  const [durum, formAction, isPending] = useActionState(gonder, null);

  const randevuGerektirenTur = tur !== "randevu_talebi";
  const { data: tedaviler } = useIslemTanimlari(acik && tur === "randevu_talebi");
  const { data: randevular } = useHastaTalepIcinRandevular(hastaId, acik && randevuGerektirenTur);
  const { data: talepler, isLoading: talepGecmisiYukleniyor } = useHastaTalepVeOneriler(hastaId, acik);

  const bugun = formatDateForInput(new Date().toISOString());

  const planlandiRandevular = useMemo(
    () =>
      (randevular ?? [])
        .filter((r) => r.durum === "planlandi")
        .sort((a, b) => a.baslangic.localeCompare(b.baslangic)),
    [randevular]
  );

  const katildiRandevular = useMemo(
    () => (randevular ?? []).filter((r) => KATILDI_DURUMLARI.includes(r.durum)),
    [randevular]
  );

  const terapistler = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of katildiRandevular) {
      if (r.terapist) map.set(r.terapist.id, r.terapist.personel?.ad_soyad ?? "—");
    }
    return Array.from(map, ([id, ad]) => ({ id, ad })).sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
  }, [katildiRandevular]);

  const terapistRandevulari = useMemo(
    () => katildiRandevular.filter((r) => r.terapist?.id === terapistId),
    [katildiRandevular, terapistId]
  );

  const yorumRandevuSecenekleri = tur === "terapist_yorumu" ? terapistRandevulari : katildiRandevular;

  function turDegistir(yeniTur: TalepTuru) {
    setTur(yeniTur);
    setTerapistId("");
    setRandevuId("");
    setPuan(null);
  }

  const randevuTalepleri = talepler?.randevuTalepleri ?? [];
  const iptalTalepleri = talepler?.iptalTalepleri ?? [];

  return (
    <Dialog open={acik} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Talep ve Öneriler</DialogTitle>
          <DialogDescription>Randevu talebi, iptali veya ertelemesi gönderin ya da bir not bırakın.</DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="tur" value={tur} />

          <div className="flex flex-col gap-1.5">
            <Label>Tür</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {TALEP_TURU_SECENEKLERI.map((s) => {
                const Icon = s.icon;
                const secili = tur === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    disabled={isPending}
                    onClick={() => turDegistir(s.value)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-center text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
                      secili
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-surface-2 text-muted-foreground hover:border-input hover:bg-background hover:text-foreground"
                    )}
                  >
                    <Icon className="size-5" aria-hidden />
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {tur === "randevu_talebi" && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="islem_tanimi_id">Tedavi</Label>
                <Select
                  name="islem_tanimi_id"
                  required
                  disabled={isPending}
                  items={(tedaviler ?? []).map((t) => ({ value: t.id, label: t.ad }))}
                >
                  <SelectTrigger id="islem_tanimi_id" className="w-full">
                    <SelectValue placeholder="Tedavi seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {(tedaviler ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.ad}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tercih_tarih">Tercih Edilen Tarih</Label>
                  <Input id="tercih_tarih" name="tercih_tarih" type="date" min={bugun} defaultValue={bugun} required disabled={isPending} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tercih_saat">Tercih Edilen Saat (opsiyonel)</Label>
                  <Input id="tercih_saat" name="tercih_saat" type="time" disabled={isPending} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="not_metni">Not (opsiyonel)</Label>
                <textarea
                  id="not_metni"
                  name="not_metni"
                  rows={2}
                  placeholder="Örn. belirli bir terapist tercihi..."
                  disabled={isPending}
                  className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </div>
            </>
          )}

          {tur === "randevu_iptali" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="randevu_id_iptal">Randevu</Label>
              {planlandiRandevular.length === 0 ? (
                <p className="text-sm text-muted-foreground">Planlanmış (iptal edilebilir) randevu yok.</p>
              ) : (
                <Select
                  name="randevu_id"
                  required
                  disabled={isPending}
                  value={randevuId}
                  onValueChange={(v) => setRandevuId(v ?? "")}
                  items={planlandiRandevular.map((r) => ({
                    value: r.id,
                    label: `${formatDateTime(r.baslangic)} · ${r.islem_tanimi?.ad ?? "—"}`,
                  }))}
                >
                  <SelectTrigger id="randevu_id_iptal" className="w-full">
                    <SelectValue placeholder="Randevu seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {planlandiRandevular.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {formatDateTime(r.baslangic)} · {r.islem_tanimi?.ad ?? "—"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {tur === "randevu_ertele" && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="randevu_id_ertele">Randevu</Label>
                {planlandiRandevular.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ertelenebilecek (planlanmış) randevu yok.</p>
                ) : (
                  <Select
                    name="randevu_id"
                    required
                    disabled={isPending}
                    value={randevuId}
                    onValueChange={(v) => setRandevuId(v ?? "")}
                    items={planlandiRandevular.map((r) => ({
                      value: r.id,
                      label: `${formatDateTime(r.baslangic)} · ${r.islem_tanimi?.ad ?? "—"}`,
                    }))}
                  >
                    <SelectTrigger id="randevu_id_ertele" className="w-full">
                      <SelectValue placeholder="Randevu seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {planlandiRandevular.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {formatDateTime(r.baslangic)} · {r.islem_tanimi?.ad ?? "—"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tarih">Yeni Tarih</Label>
                  <Input id="tarih" name="tarih" type="date" min={bugun} required disabled={isPending} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="saat">Yeni Saat</Label>
                  <Input id="saat" name="saat" type="time" required disabled={isPending} />
                </div>
              </div>
            </>
          )}

          {tur === "terapist_yorumu" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="terapist_id">Terapist</Label>
              {terapistler.length === 0 ? (
                <p className="text-sm text-muted-foreground">Bu hastanın katıldığı bir seansı olan terapist yok.</p>
              ) : (
                <Select
                  disabled={isPending}
                  value={terapistId}
                  onValueChange={(v) => {
                    setTerapistId(v ?? "");
                    setRandevuId("");
                  }}
                  items={terapistler.map((t) => ({ value: t.id, label: t.ad }))}
                >
                  <SelectTrigger id="terapist_id" className="w-full">
                    <SelectValue placeholder="Terapist seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {terapistler.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.ad}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {(tur === "terapist_yorumu" || tur === "randevu_yorumu") && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="randevu_id_yorum">Randevu</Label>
              {tur === "terapist_yorumu" && !terapistId ? (
                <p className="text-sm text-muted-foreground">Önce terapist seçin.</p>
              ) : yorumRandevuSecenekleri.length === 0 ? (
                <p className="text-sm text-muted-foreground">Seçilebilecek randevu yok.</p>
              ) : (
                <Select
                  name="randevu_id"
                  required
                  disabled={isPending}
                  value={randevuId}
                  onValueChange={(v) => setRandevuId(v ?? "")}
                  items={yorumRandevuSecenekleri.map((r) => ({
                    value: r.id,
                    label: `${formatDateTime(r.baslangic)} · ${r.islem_tanimi?.ad ?? "—"}`,
                  }))}
                >
                  <SelectTrigger id="randevu_id_yorum" className="w-full">
                    <SelectValue placeholder="Randevu seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {yorumRandevuSecenekleri.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {formatDateTime(r.baslangic)} · {r.islem_tanimi?.ad ?? "—"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <input type="hidden" name="puan" value={puan ?? ""} />
              <Label>Puan</Label>
              <div className="flex gap-1.5">
                {PUAN_SECENEKLERI.map((p) => {
                  const secili = puan === p.deger;
                  return (
                    <button
                      key={p.deger}
                      type="button"
                      disabled={isPending}
                      onClick={() => setPuan(p.deger)}
                      className={cn(
                        "flex flex-1 flex-col items-center gap-1 rounded-xl border px-1 py-2 text-center transition-colors disabled:pointer-events-none disabled:opacity-50",
                        secili
                          ? "border-primary bg-primary/10"
                          : "border-border bg-surface-2 hover:border-input hover:bg-background"
                      )}
                    >
                      <span className="text-xl leading-none" aria-hidden>
                        {p.emoji}
                      </span>
                      <span className={cn("text-[10px] leading-tight font-medium", secili ? "text-primary" : "text-muted-foreground")}>
                        {p.etiket}
                      </span>
                    </button>
                  );
                })}
              </div>

              <textarea
                name="yorum"
                rows={3}
                required
                placeholder={tur === "terapist_yorumu" ? "Terapist hakkındaki yorumunuz..." : "Randevu hakkındaki yorumunuz..."}
                disabled={isPending}
                className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
          )}

          {durum && (
            <p role={durum.success ? "status" : "alert"} className={cn("text-sm", durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
              {durum.message}
            </p>
          )}

          <Button type="submit" disabled={isPending} className="w-fit">
            {isPending ? "Gönderiliyor..." : "Gönder"}
          </Button>
        </form>

        {!talepGecmisiYukleniyor && (randevuTalepleri.length > 0 || iptalTalepleri.length > 0) && (
          <div className="flex flex-col gap-4 border-t border-border pt-4">
            {randevuTalepleri.length > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-muted-foreground">Gönderilen Randevu Talepleri</h3>
                <ul className="flex flex-col divide-y divide-border">
                  {randevuTalepleri.map((t) => (
                    <li key={t.id} className="flex flex-col gap-1 py-2.5 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{t.islem_tanimi?.ad ?? "—"}</span>
                        <StatusBadge tone={TALEP_DURUM_TONU[t.durum]}>{TALEP_DURUM_ETIKET[t.durum]}</StatusBadge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Tercih: {formatDate(t.tercih_tarih)}
                        {t.tercih_saat ? ` · ${t.tercih_saat.slice(0, 5)}` : ""}
                      </span>
                      {t.not_metni && <span className="text-xs text-muted-foreground">Not: {t.not_metni}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {iptalTalepleri.length > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-muted-foreground">Gönderilen İptal Talepleri</h3>
                <ul className="flex flex-col divide-y divide-border">
                  {iptalTalepleri.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                      <span>{formatDateTime(t.randevuBaslangic)} tarihli randevu</span>
                      <StatusBadge tone={TALEP_DURUM_TONU[t.durum]}>{TALEP_DURUM_ETIKET[t.durum]}</StatusBadge>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
