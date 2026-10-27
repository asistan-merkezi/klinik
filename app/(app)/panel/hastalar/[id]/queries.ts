"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { randevuSeansiTamamla } from "../../randevular/actions";
import { sikayetKaydiEkle, sikayetDurumGuncelle } from "./actions";
import {
  hastaAnamnezKayitlariGetir,
  hastaDetayOzetiGetir,
  hastaHassasGetir,
  hastaIliskileriGetir,
  hastaOlcumleriGetir,
  hastaProtokolleriGetir,
  hastaSeansGecmisiGetir,
  hastaSigortalariGetir,
  hastaTalepIcinRandevularGetir,
  hastaTalepVeOnerilerGetir,
  islemKontrendikasyonlariGetir,
  islemTanimlariGetir,
  vucutHaritasiGetir,
  vucutIsaretiKaldir,
  vucutIsaretiKaydet,
  type TalepIcinRandevuVerisi,
} from "./veri-actions";
import type { VucutHaritasiIsareti, SikayetDurumu } from "@/types/hasta-detay";
import type { IptalTalebiDurum } from "@/types/portal";

// Tüm okuma/yazma sunucu eylemleridir (./veri-actions.ts): oturum + rol + tenant sunucuda doğrulanır, tarayıcı veritabanına doğrudan erişmez.

export function useHastaDetayOzet(hastaId: string) {
  return useQuery({
    queryKey: ["hasta_detay_ozet", hastaId],
    queryFn: () => hastaDetayOzetiGetir(hastaId),
  });
}

export function useHastaHassas(hastaId: string, aktif: boolean) {
  return useQuery({
    queryKey: ["hasta_hassas", hastaId],
    enabled: aktif,
    queryFn: () => hastaHassasGetir(hastaId),
  });
}

export function useHastaIliskiler(hastaId: string, aktif: boolean) {
  return useQuery({
    queryKey: ["hasta_iliski", hastaId],
    enabled: aktif,
    queryFn: () => hastaIliskileriGetir(hastaId),
  });
}

export function useHastaSigortalar(hastaId: string, aktif: boolean) {
  return useQuery({
    queryKey: ["hasta_sigorta", hastaId],
    enabled: aktif,
    queryFn: () => hastaSigortalariGetir(hastaId),
  });
}

export function useHastaAnamnezKayitlari(hastaId: string, aktif: boolean) {
  return useQuery({
    queryKey: ["hasta_anamnez", hastaId],
    enabled: aktif,
    queryFn: () => hastaAnamnezKayitlariGetir(hastaId),
  });
}

type SikayetKaydiGirdi = {
  basvuru_sikayeti: string;
  sikayet_baslangici: string;
  agri_oykusu: string;
  ilk_degerlendirme_notu: string;
  durum: SikayetDurumu;
};

export function useSikayetKaydiEkle(hastaId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (girdi: SikayetKaydiGirdi) => {
      const sonuc = await sikayetKaydiEkle(hastaId, girdi);
      if (!sonuc?.success) throw new Error(sonuc?.message ?? "Kaydedilemedi.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hasta_anamnez", hastaId] });
    },
  });
}

export function useSikayetDurumGuncelle(hastaId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ kayitId, durum }: { kayitId: string; durum: SikayetDurumu }) => {
      const sonuc = await sikayetDurumGuncelle(kayitId, durum);
      if (!sonuc?.success) throw new Error(sonuc?.message ?? "Güncellenemedi.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hasta_anamnez", hastaId] });
    },
  });
}

function vucutHaritasiQueryKey(hastaId: string, seansId: string | null | undefined) {
  return ["vucut_haritasi", hastaId, seansId ?? "tumu"] as const;
}

export function useVucutHaritasi(hastaId: string, seansId: string | null | undefined, aktif: boolean) {
  return useQuery({
    queryKey: vucutHaritasiQueryKey(hastaId, seansId),
    enabled: aktif,
    queryFn: () => vucutHaritasiGetir(hastaId, seansId ?? null),
  });
}

type VucutIsaretiKaydetGirdi = {
  id?: string;
  bolge: string;
  yuz: "on" | "arka";
  severity: number;
  not_metni: string;
  randevu_id: string | null;
};

/** Tabletteki bölge popover'ında Kaydet'e basınca — mevcut işareti günceller (id varsa) ya da yenisini ekler. */
export function useVucutIsaretKaydet(hastaId: string, seansId: string | null | undefined) {
  const queryClient = useQueryClient();
  const queryKey = vucutHaritasiQueryKey(hastaId, seansId);

  return useMutation({
    mutationFn: (girdi: VucutIsaretiKaydetGirdi) => vucutIsaretiKaydet(hastaId, girdi),
    onMutate: async (girdi) => {
      await queryClient.cancelQueries({ queryKey });
      const onceki = queryClient.getQueryData<VucutHaritasiIsareti[]>(queryKey);
      const geciciId = girdi.id ?? `gecici-${Date.now()}`;
      queryClient.setQueryData<VucutHaritasiIsareti[]>(queryKey, (mevcut) => {
        const liste = mevcut ?? [];
        if (girdi.id) {
          return liste.map((i) =>
            i.id === girdi.id ? { ...i, severity: girdi.severity, not_metni: girdi.not_metni || null } : i
          );
        }
        const yeni: VucutHaritasiIsareti = {
          id: geciciId,
          hasta_id: hastaId,
          randevu_id: girdi.randevu_id,
          yuz: girdi.yuz,
          bolge: girdi.bolge,
          x: null,
          y: null,
          severity: girdi.severity,
          not_metni: girdi.not_metni || null,
          created_at: new Date().toISOString(),
        };
        return [yeni, ...liste];
      });
      return { onceki };
    },
    onError: (_err, _girdi, context) => {
      if (context?.onceki) queryClient.setQueryData(queryKey, context.onceki);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });
}

/** Bölge popover'ında Kaldır'a basınca — işareti tamamen siler. */
export function useVucutIsaretKaldir(hastaId: string, seansId: string | null | undefined) {
  const queryClient = useQueryClient();
  const queryKey = vucutHaritasiQueryKey(hastaId, seansId);

  return useMutation({
    mutationFn: (id: string) => vucutIsaretiKaldir(hastaId, id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const onceki = queryClient.getQueryData<VucutHaritasiIsareti[]>(queryKey);
      queryClient.setQueryData<VucutHaritasiIsareti[]>(queryKey, (mevcut) => (mevcut ?? []).filter((i) => i.id !== id));
      return { onceki };
    },
    onError: (_err, _id, context) => {
      if (context?.onceki) queryClient.setQueryData(queryKey, context.onceki);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });
}

export function useIslemTanimlari(aktif: boolean) {
  return useQuery({
    queryKey: ["islem_tanimi_aktif"],
    enabled: aktif,
    queryFn: () => islemTanimlariGetir(),
  });
}

export function useIslemKontrendikasyonlari(islemTanimiId: string | null) {
  return useQuery({
    queryKey: ["islem_kontrendikasyon", islemTanimiId],
    enabled: Boolean(islemTanimiId),
    queryFn: () => islemKontrendikasyonlariGetir(islemTanimiId as string),
  });
}

/** Sağ kolondaki vücut haritasının hangi seansı göstereceğini seçtiren dikey zaman çizelgesi için. */
export function useHastaSeansGecmisi(hastaId: string, aktif: boolean) {
  return useQuery({
    queryKey: ["hasta_seans_gecmisi", hastaId],
    enabled: aktif,
    queryFn: () => hastaSeansGecmisiGetir(hastaId),
  });
}

type SeansTamamlaGirdi = {
  randevuId: string;
  aciklama: string;
};

/**
 * Seans Geçmişi'ndeki "Seansı Tamamla" — artık ham bir client-side update
 * DEĞİL, Randevu Detay Paneli'ndeki "Seansı Bitir" butonuyla PAYLAŞILAN
 * randevuSeansiTamamla server action'ını çağırıyor (bkz.
 * app/(app)/panel/randevular/actions.ts) — iki UI tek fonksiyona iniyor,
 * tablet hangi yoldan tetiklenirse tetiklensin aynı 'tamamlandi' durumunu
 * görüyor. Canlı olay altyapısı (lib/realtime) sayesinde bu güncelleme
 * Günün Çizelgesi'ne de otomatik yansır.
 */
export function useSeansTamamla(hastaId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ randevuId, aciklama }: SeansTamamlaGirdi) => {
      const sonuc = await randevuSeansiTamamla(randevuId, aciklama);
      if (!sonuc?.success) throw new Error(sonuc?.message ?? "Seans tamamlanamadı.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hasta_seans_gecmisi", hastaId] });
    },
  });
}

export function useHastaProtokoller(hastaId: string, aktif: boolean) {
  return useQuery({
    queryKey: ["hasta_protokol", hastaId],
    enabled: aktif,
    queryFn: () => hastaProtokolleriGetir(hastaId),
  });
}

export function useHastaOlcumler(hastaId: string, aktif: boolean) {
  return useQuery({
    queryKey: ["hasta_olcum", hastaId],
    enabled: aktif,
    queryFn: () => hastaOlcumleriGetir(hastaId),
  });
}

export type HastaIptalTalebiSatir = {
  id: string;
  durum: IptalTalebiDurum;
  created_at: string;
  randevuBaslangic: string;
};

/**
 * OzetKart'taki "Talep ve Öneriler" kutusu için — hastanın portaldan
 * gönderdiği randevu_talebi + randevu_iptal_talebi kayıtları.
 */
export function useHastaTalepVeOneriler(hastaId: string, aktif: boolean) {
  return useQuery({
    queryKey: ["hasta_talep_oneri", hastaId],
    enabled: aktif,
    queryFn: () => hastaTalepVeOnerilerGetir(hastaId),
  });
}

export type TalepIcinRandevuSatir = TalepIcinRandevuVerisi;

/** "Randevu İptali" / "Terapist Yorumu" / "Randevu Hakkında Yorum" alanlarındaki seçim listeleri için. */
export function useHastaTalepIcinRandevular(hastaId: string, aktif: boolean) {
  return useQuery({
    queryKey: ["hasta_talep_icin_randevular", hastaId],
    enabled: aktif,
    queryFn: () => hastaTalepIcinRandevularGetir(hastaId),
  });
}
