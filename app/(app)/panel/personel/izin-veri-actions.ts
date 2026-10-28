"use server";

import { z } from "zod";
import { pgHata, rpc, withTenant } from "@/lib/db";
import { eylemYetkisi } from "@/lib/auth/yetki";
import type { IzinCakisan } from "@/types/izin";

const TARIH = /^\d{4}-\d{2}-\d{2}$/;

/** Canlı önizleme: iki tarih arası sayılan iş günü (kliniğin hafta tatili + resmi tatil kuralıyla, SQL fonksiyonu). Hata/yetkisizse null. */
export async function izinIsGunuSayisi(baslangic: string, bitis: string): Promise<number | null> {
  const y = await eylemYetkisi(["klinik_admin", "resepsiyon", "terapist", "muhasebe"]);
  if (!y.yetkili || !y.bag || !TARIH.test(baslangic) || !TARIH.test(bitis)) return null;
  try {
    const r = await withTenant(y.bag, (tx) => rpc<{ personel_izin_is_gunu_sayisi: number }>(tx, "personel_izin_is_gunu_sayisi", { p_baslangic: baslangic, p_bitis: bitis }));
    return Number(r[0]?.personel_izin_is_gunu_sayisi ?? 0);
  } catch (e) {
    console.error("İş günü sayısı hesaplanamadı:", pgHata(e).mesaj);
    return null;
  }
}

/** Bir izin talebiyle çakışan diğer talepler (yalnız klinik_admin; RPC de içeride denetler). */
export async function izinCakisanlariGetir(talepId: string): Promise<IzinCakisan[]> {
  const y = await eylemYetkisi(["klinik_admin"]);
  if (!y.yetkili || !y.bag || !z.string().uuid().safeParse(talepId).success) return [];
  try {
    return (await withTenant(y.bag, (tx) => rpc<IzinCakisan>(tx, "personel_izin_cakisanlari_getir", { p_talep_id: talepId }))) as IzinCakisan[];
  } catch (e) {
    console.error("Çakışan izinler alınamadı:", pgHata(e).mesaj);
    return [];
  }
}
