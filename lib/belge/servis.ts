// Hasta belgesi sunumu / yükleme / silme — iş mantığı (route ve server action'lar ince sarmalayıcıdır; test:db bunu doğrudan sınar).
// Yetki: yalnız klinik_admin / resepsiyon / terapist (muhasebe ve portal hastası belge göremez). Tenant bağlamı (`bag`) oturumdan gelir.
// Erişim izi (KVKK): "goruntule" → hasta_belge_goruntule RPC'si audit_log'a 'select'; "indir" → ek olarak 'indirme' satırı; "kucuk" (liste küçük resmi) → iz YOK.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { pgHata, rpc, sema, withTenant, type TenantBaglami } from "@/lib/db";
import { BELGE_UZANTILARI, icerikTipiDogrula } from "@/lib/dosya/imza";
import { belgeDosyasiOku, belgeDosyasiSil, belgeDosyasiYaz, belgeYoluOlustur } from "@/lib/dosya/belge";
import { MAX_DOSYA_BOYUTU_BYTE } from "@/types/hasta-belge";

export const BELGE_OKUMA_ROLLERI = ["klinik_admin", "resepsiyon", "terapist"] as const;
export const BELGE_SILME_ROLLERI = ["klinik_admin", "resepsiyon"] as const; // yumuşak silme (terapist silemez)
export type BelgeIslem = "goruntule" | "indir" | "kucuk";

export type BelgeSunumu =
  | { tur: "ok"; veri: Buffer; mime: string; dosyaAdi: string }
  | { tur: "yok" }
  | { tur: "yetkisiz" };

export async function belgeIcerigiGetir(g: { bag: TenantBaglami; rol: string; belgeId: string; islem: BelgeIslem }): Promise<BelgeSunumu> {
  if (!(BELGE_OKUMA_ROLLERI as readonly string[]).includes(g.rol)) return { tur: "yetkisiz" };
  if (!/^[0-9a-f-]{36}$/i.test(g.belgeId)) return { tur: "yok" };
  const { bag } = g;

  const yol = await withTenant(bag, async (tx) => {
    // RLS: yalnız çağıranın kliniğinin silinmemiş belgeleri görünür; başka kliniğin belgesi "yok" gibi davranır.
    const b = (
      await tx
        .select({ storagePath: sema.hastaBelge.storagePath, thumbnailPath: sema.hastaBelge.thumbnailPath, mime: sema.hastaBelge.dosyaMime, klinikId: sema.hastaBelge.klinikId })
        .from(sema.hastaBelge)
        .where(eq(sema.hastaBelge.id, g.belgeId))
        .limit(1)
    )[0];
    if (!b) return null;
    if (g.islem === "kucuk") return b.thumbnailPath ? { yol: b.thumbnailPath, mime: "image/jpeg", klinikId: b.klinikId } : null;

    // Gerçek açma anı: RPC audit_log'a 'select' satırını yazar ve tenant doğrulamasını kendisi de yapar.
    await rpc(tx, "hasta_belge_goruntule", { p_id: g.belgeId });
    if (g.islem === "indir") {
      await tx.insert(sema.auditLog).values({ klinikId: b.klinikId, kullaniciId: bag.userId, eylem: "indirme", hedefTablo: "hasta_belge", hedefId: g.belgeId });
    }
    return { yol: b.storagePath, mime: b.mime ?? "application/octet-stream", klinikId: b.klinikId };
  }).catch((e) => {
    if (pgHata(e).mesaj.includes("yetkisiz") || pgHata(e).mesaj.includes("belge_bulunamadi")) return null;
    throw e;
  });
  if (!yol) return { tur: "yok" };

  const veri = await belgeDosyasiOku(yol.yol, bag.tenantId).catch(() => null); // yol doğrulaması başarısızsa da "yok"
  if (!veri) return { tur: "yok" };
  const uzanti = yol.yol.split(".").pop() ?? "bin";
  return { tur: "ok", veri, mime: yol.mime, dosyaAdi: `${g.belgeId}.${uzanti}` };
}

export type BelgeYuklemeGirdisi = {
  hastaId: string;
  kategori: "radyoloji" | "klinik_foto" | "dokuman";
  belgeTuru: string;
  cekimTarihi: string;
  bolge: string | null;
  karsilastirmaGrubuId: string | null;
  asama: string | null;
  onamId: string | null;
  not: string | null;
  cekenKurum: string | null;
  mime: string;
  veri: Buffer;
};

export type BelgeYuklemeSonucu = { tur: "ok"; id: string } | { tur: "hata"; durum: number; mesaj: string };

export async function belgeYukle(g: { bag: TenantBaglami; rol: string; girdi: BelgeYuklemeGirdisi }): Promise<BelgeYuklemeSonucu> {
  if (!(BELGE_OKUMA_ROLLERI as readonly string[]).includes(g.rol)) return { tur: "hata", durum: 403, mesaj: "Bu işlem için yetkiniz yok." };
  const { girdi, bag } = g;
  if (girdi.veri.length > MAX_DOSYA_BOYUTU_BYTE) return { tur: "hata", durum: 400, mesaj: "Dosya boyutu çok büyük." };
  // İstemci görselleri WebP'ye çevirir; sunucu yine de türü zorlar, uzantıyı dosya adından değil türden türetir ve İÇERİK imzasını doğrular.
  const uzanti = BELGE_UZANTILARI[girdi.mime];
  if (!uzanti) return { tur: "hata", durum: 400, mesaj: "Desteklenmeyen dosya türü." };
  if (!icerikTipiDogrula(girdi.mime, girdi.veri)) return { tur: "hata", durum: 400, mesaj: "Dosya içeriği bildirilen türle eşleşmiyor." };

  const belgeId = randomUUID();
  const yol = belgeYoluOlustur({ klinikId: bag.tenantId, hastaId: girdi.hastaId, kategori: girdi.kategori, belgeId, uzanti });

  const metadata: Record<string, unknown> = {};
  if (girdi.not) metadata.not = girdi.not;
  if (girdi.cekenKurum) metadata.ceken_kurum = girdi.cekenKurum;

  // Hasta bu kliniğin mi (RLS) + satır eklenir; dosya satırdan ÖNCE yazılır, satır başarısızsa silinir (sahipsiz dosya kalmasın).
  await belgeDosyasiYaz(yol, bag.tenantId, girdi.veri);
  try {
    const sonuc = await withTenant(bag, async (tx) => {
      const hasta = (await tx.select({ id: sema.hasta.id }).from(sema.hasta).where(eq(sema.hasta.id, girdi.hastaId)).limit(1))[0];
      if (!hasta) return { yok: true as const };
      await tx.insert(sema.hastaBelge).values({
        id: belgeId,
        klinikId: bag.tenantId,
        hastaId: girdi.hastaId,
        kategori: girdi.kategori,
        belgeTuru: girdi.belgeTuru,
        bolge: girdi.bolge,
        cekimTarihi: girdi.cekimTarihi,
        karsilastirmaGrubuId: girdi.karsilastirmaGrubuId,
        asama: girdi.asama,
        onamId: girdi.onamId,
        storagePath: yol,
        dosyaMime: girdi.mime,
        dosyaBoyutByte: girdi.veri.length,
        yukleyenKullaniciId: bag.userId,
        metadata,
      });
      return { yok: false as const };
    });
    if (sonuc.yok) {
      await belgeDosyasiSil(yol, bag.tenantId);
      return { tur: "hata", durum: 404, mesaj: "Hasta bulunamadı." };
    }
  } catch (e) {
    console.error("Belge kaydedilemedi:", pgHata(e).mesaj);
    await belgeDosyasiSil(yol, bag.tenantId).catch(() => {});
    return { tur: "hata", durum: 500, mesaj: "Belge kaydedilemedi, lütfen tekrar deneyin." };
  }

  // Küçük resim yalnız görseller için (PDF rasterize edilmez). Hata belgeyi etkilemez.
  if (girdi.mime !== "application/pdf") {
    try {
      const kucuk = await sharp(girdi.veri).rotate().resize(300, 300, { fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
      const thumbYol = belgeYoluOlustur({ klinikId: bag.tenantId, hastaId: girdi.hastaId, kategori: girdi.kategori, belgeId, uzanti: "jpg", kucuk: true });
      await belgeDosyasiYaz(thumbYol, bag.tenantId, kucuk);
      await withTenant(bag, (tx) => tx.update(sema.hastaBelge).set({ thumbnailPath: thumbYol }).where(and(eq(sema.hastaBelge.id, belgeId))));
    } catch (e) {
      console.error("Thumbnail üretilemedi (belge yine de kaydedildi):", e);
    }
  }
  return { tur: "ok", id: belgeId };
}

/** Kalıcı silme (yalnız klinik_admin): satır + disk dosyaları. Satır silinemezse dosyaya dokunulmaz. */
export async function belgeKaliciSil(g: { bag: TenantBaglami; rol: string; belgeId: string }): Promise<boolean> {
  if (g.rol !== "klinik_admin") return false;
  const silinen = await withTenant(g.bag, (tx) =>
    tx.delete(sema.hastaBelge).where(eq(sema.hastaBelge.id, g.belgeId)).returning({ yol: sema.hastaBelge.storagePath, kucuk: sema.hastaBelge.thumbnailPath })
  );
  if (silinen.length === 0) return false;
  for (const s of silinen) {
    await belgeDosyasiSil(s.yol, g.bag.tenantId).catch((e) => console.error("Belge dosyası silinemedi:", e));
    if (s.kucuk) await belgeDosyasiSil(s.kucuk, g.bag.tenantId).catch((e) => console.error("Küçük resim silinemedi:", e));
  }
  return true;
}
