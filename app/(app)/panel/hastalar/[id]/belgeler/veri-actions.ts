"use server";

// Belge sekmesi okuma eylemleri (eskiden tarayıcıdan doğrudan Supabase). Yalnız belge görebilen roller; tenant oturumdan gelir.
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { sema, withTenant, zamanlariIsoyaCevir } from "@/lib/db";
import { eylemYetkisi } from "@/lib/auth/yetki";
import { BELGE_OKUMA_ROLLERI } from "@/lib/belge/servis";
import type { BelgeKategori, HastaBelge } from "@/types/hasta-belge";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KATEGORILER = ["radyoloji", "klinik_foto", "dokuman"];

async function yetki() {
  const y = await eylemYetkisi(BELGE_OKUMA_ROLLERI);
  if (!y.yetkili || !y.bag) throw new Error("Bu işlem için yetkiniz yok.");
  return y.bag;
}

export async function hastaBelgeleriGetir(hastaId: string, kategori: BelgeKategori): Promise<HastaBelge[]> {
  if (!UUID.test(hastaId) || !KATEGORILER.includes(kategori)) throw new Error("Geçersiz istek.");
  const bag = await yetki();
  const s = await withTenant(bag, (tx) =>
    tx
      .select()
      .from(sema.hastaBelge)
      .where(and(eq(sema.hastaBelge.hastaId, hastaId), eq(sema.hastaBelge.kategori, kategori), isNull(sema.hastaBelge.deletedAt)))
      .orderBy(desc(sema.hastaBelge.cekimTarihi))
  );
  return zamanlariIsoyaCevir(
    s.map(
      (b): HastaBelge => ({
        id: b.id,
        hasta_id: b.hastaId,
        kategori: b.kategori as HastaBelge["kategori"],
        belge_turu: b.belgeTuru as HastaBelge["belge_turu"],
        bolge: b.bolge,
        cekim_tarihi: b.cekimTarihi,
        upload_tarihi: b.uploadTarihi,
        karsilastirma_grubu_id: b.karsilastirmaGrubuId,
        asama: b.asama as HastaBelge["asama"],
        onam_id: b.onamId,
        storage_path: b.storagePath,
        thumbnail_path: b.thumbnailPath,
        dosya_mime: b.dosyaMime,
        dosya_boyut_byte: b.dosyaBoyutByte,
        versiyon_no: b.versiyonNo,
        onceki_belge_id: b.oncekiBelgeId,
        is_guncel: b.isGuncel,
        metadata: (b.metadata ?? {}) as Record<string, unknown>,
        yukleyen_kullanici_id: b.yukleyenKullaniciId,
      })
    )
  );
}

export async function klinikFotoOnamGetir(hastaId: string): Promise<{ id: string; imza_tarihi: string } | null> {
  if (!UUID.test(hastaId)) throw new Error("Geçersiz istek.");
  const bag = await yetki();
  const s = (
    await withTenant(bag, (tx) =>
      tx
        .select({ id: sema.hastaOnam.id, imzaTarihi: sema.hastaOnam.imzaTarihi })
        .from(sema.hastaOnam)
        .where(and(eq(sema.hastaOnam.hastaId, hastaId), eq(sema.hastaOnam.onamTipi, "klinik_foto")))
        .orderBy(desc(sema.hastaOnam.imzaTarihi))
        .limit(1)
    )
  )[0];
  return s ? zamanlariIsoyaCevir({ id: s.id, imza_tarihi: s.imzaTarihi }) : null;
}

export async function karsilastirmaGruplariGetir(hastaId: string): Promise<string[]> {
  if (!UUID.test(hastaId)) throw new Error("Geçersiz istek.");
  const bag = await yetki();
  const s = await withTenant(bag, (tx) =>
    tx
      .select({ g: sema.hastaBelge.karsilastirmaGrubuId })
      .from(sema.hastaBelge)
      .where(and(eq(sema.hastaBelge.hastaId, hastaId), eq(sema.hastaBelge.kategori, "klinik_foto"), isNotNull(sema.hastaBelge.karsilastirmaGrubuId), isNull(sema.hastaBelge.deletedAt)))
  );
  return Array.from(new Set(s.map((x) => x.g!)));
}
