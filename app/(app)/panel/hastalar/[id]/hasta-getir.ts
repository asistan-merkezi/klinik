import { cache } from "react";
import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { sema, withTenant, zamanlariIsoyaCevir } from "@/lib/db";
import { oturumBaglami } from "@/lib/auth/gecerli-kullanici";
import { tenantGerekli } from "@/lib/auth/oturum";
import type { HastaDetay } from "@/types/hasta";
import type { RiskBayragi } from "@/types/hasta-detay";

export type HastaTemel = Pick<
  HastaDetay,
  | "id"
  | "ad_soyad"
  | "telefon"
  | "dogum_tarihi"
  | "cinsiyet"
  | "kategori"
  | "eposta"
  | "risk_bayraklari"
  | "kvkk_onay_tarihi"
  | "ozel_nitelikli_veri_onay_tarihi"
>;

// Hasta Detay layout'u ve altındaki her sekme sayfası (hub, kişisel, tedavi,
// cari, randevu) aynı oturum/hasta/rol sorgularını ayrı ayrı çalıştırıyordu.
// React'in cache()'i ile bu fonksiyonlar tek bir istek/render ömrü boyunca aynı
// argümanla ikinci kez çağrıldığında gerçek bir sorgu çalıştırmaz.
//
// Oturum/rol `oturumBaglami()`nden (zaten cache()'li, istek başına TEK oturum çözümü) gelir; tenant oturumdan, istemciden değil.
// Yalnız PERSONEL oturumu bu veriyi görür (hasta portal oturumu null döner).
async function personelBagi() {
  const ctx = await oturumBaglami();
  if (!ctx || ctx.tur !== "personel" || !ctx.tenantId) return null;
  return { ctx, bag: tenantGerekli(ctx) };
}

export const getAuthUser = cache(async (): Promise<{ id: string } | null> => {
  const ctx = await oturumBaglami();
  return ctx && ctx.tur === "personel" ? { id: ctx.userId } : null;
});

export const hastaTemelGetir = cache(async (id: string): Promise<HastaTemel | null> => {
  const p = await personelBagi();
  if (!p || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const s = (
    await withTenant(p.bag, (tx) =>
      tx
        .select({
          id: sema.hasta.id,
          ad_soyad: sema.hasta.adSoyad,
          telefon: sema.hasta.telefon,
          dogum_tarihi: sema.hasta.dogumTarihi,
          cinsiyet: sema.hasta.cinsiyet,
          kategori: sema.hasta.kategori,
          eposta: sema.hasta.eposta,
          risk_bayraklari: sema.hasta.riskBayraklari,
          kvkk_onay_tarihi: sema.hasta.kvkkOnayTarihi,
          ozel_nitelikli_veri_onay_tarihi: sema.hasta.ozelNitelikliVeriOnayTarihi,
        })
        .from(sema.hasta)
        .where(eq(sema.hasta.id, id))
        .limit(1)
    )
  )[0];
  return s ? zamanlariIsoyaCevir({ ...s, risk_bayraklari: (s.risk_bayraklari ?? []) as RiskBayragi[] }) as unknown as HastaTemel : null;
});

export const hastaDetayFullGetir = cache(async (id: string): Promise<HastaDetay | null> => {
  const p = await personelBagi();
  if (!p || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const kvkkOnaylayan = alias(sema.kullanici, "kvkk_onaylayan");
  const ozelOnaylayan = alias(sema.kullanici, "ozel_onaylayan");
  const ticariOnaylayan = alias(sema.kullanici, "ticari_onaylayan");
  const s = (
    await withTenant(p.bag, (tx) =>
      tx
        .select({ h: sema.hasta, kvkkAd: kvkkOnaylayan.adSoyad, ozelAd: ozelOnaylayan.adSoyad, ticariAd: ticariOnaylayan.adSoyad })
        .from(sema.hasta)
        .leftJoin(kvkkOnaylayan, eq(kvkkOnaylayan.id, sema.hasta.kvkkOnaylayanKullaniciId))
        .leftJoin(ozelOnaylayan, eq(ozelOnaylayan.id, sema.hasta.ozelNitelikliOnaylayanKullaniciId))
        .leftJoin(ticariOnaylayan, eq(ticariOnaylayan.id, sema.hasta.ticariIletiOnaylayanKullaniciId))
        .where(eq(sema.hasta.id, id))
        .limit(1)
    )
  )[0];
  if (!s) return null;
  const h = s.h;
  const sonuc: HastaDetay = {
    id: h.id,
    ad_soyad: h.adSoyad,
    telefon: h.telefon,
    dogum_tarihi: h.dogumTarihi,
    kvkk_onay_tarihi: h.kvkkOnayTarihi,
    whatsapp_izin_durumu: h.whatsappIzinDurumu,
    cinsiyet: h.cinsiyet as HastaDetay["cinsiyet"],
    kategori: h.kategori as HastaDetay["kategori"],
    eposta: h.eposta,
    referans_kanali: h.referansKanali,
    ozel_nitelikli_veri_onay_tarihi: h.ozelNitelikliVeriOnayTarihi,
    ticari_ileti_onay_tarihi: h.ticariIletiOnayTarihi,
    risk_bayraklari: (h.riskBayraklari ?? []) as RiskBayragi[],
    created_at: h.createdAt,
    kvkk_onaylayan_tip: h.kvkkOnaylayanTip as HastaDetay["kvkk_onaylayan_tip"],
    kvkk_onaylayan: s.kvkkAd == null ? null : { ad_soyad: s.kvkkAd },
    ozel_nitelikli_onaylayan_tip: h.ozelNitelikliOnaylayanTip as HastaDetay["ozel_nitelikli_onaylayan_tip"],
    ozel_nitelikli_onaylayan: s.ozelAd == null ? null : { ad_soyad: s.ozelAd },
    ticari_ileti_onaylayan_tip: h.ticariIletiOnaylayanTip as HastaDetay["ticari_ileti_onaylayan_tip"],
    ticari_ileti_onaylayan: s.ticariAd == null ? null : { ad_soyad: s.ticariAd },
  };
  return zamanlariIsoyaCevir(sonuc);
});

// Tüm çağıranlar zaten getAuthUser()'ın döndürdüğü kendi id'sini geçiyor, bu yüzden doğrudan oturum bağlamından
// (aynı istekte zaten hesaplanmış) okumak güvenli ve ekstra sorgu gerektirmiyor. userId eşleşmezse null döner.
export const kullaniciRolGetir = cache(async (userId: string): Promise<string | null> => {
  const ctx = await oturumBaglami();
  return ctx && ctx.tur === "personel" && ctx.userId === userId ? ctx.rol : null;
});
