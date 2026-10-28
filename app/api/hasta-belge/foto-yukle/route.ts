import { NextResponse } from "next/server";
import { getSessionContext, tenantGerekli } from "@/lib/auth/oturum";
import { ayniKokenMi, caprazKokenYaniti } from "@/lib/guvenlik/origin";
import { sinirYaniti } from "@/lib/guvenlik/istek-siniri";
import { belgeYukle } from "@/lib/belge/servis";
import type { BelgeAsama, BelgeKategori, BelgeTuru } from "@/types/hasta-belge";

// sharp native binary gerektirdiği için Node runtime zorunlu (Edge'de çalışmaz).
export const runtime = "nodejs";

function bosIseNull(deger: FormDataEntryValue | null): string | null {
  if (deger == null) return null;
  const s = String(deger).trim();
  return s === "" ? null : s;
}

// Beklenmeyen form alanı = reddedilir (strict): istemci yalnız bu alanları gönderebilir; yol/klinik/kullanıcı gibi alanlar SUNUCUDA üretilir.
const IZINLI_ALANLAR = new Set(["file", "hastaId", "kategori", "belgeTuru", "cekimTarihi", "bolge", "karsilastirmaGrubuId", "asama", "onamId", "not", "cekenKurum"]);
const KATEGORILER: readonly string[] = ["radyoloji", "klinik_foto", "dokuman"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tek POST'ta: yetki kontrolü + diske yükleme (içerik imzası doğrulanır) + hasta_belge satırı + thumbnail üretimi.
// Tenant YALNIZ oturumdan gelir; dosya yolu sunucuda üretilir (istemci yol veremez).
export async function POST(req: Request) {
  if (!ayniKokenMi(req)) return caprazKokenYaniti();
  const ctx = await getSessionContext(req.headers);
  if (!ctx) return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });
  if (ctx.tur !== "personel" || !ctx.tenantId || ctx.sifreDegistirmeli) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
  }

  const sinir = await sinirYaniti("dosyaYukle", ctx.userId);
  if (sinir) return sinir;

  const formData = await req.formData();
  for (const k of formData.keys()) if (!IZINLI_ALANLAR.has(k)) return NextResponse.json({ error: "Geçersiz veri." }, { status: 400 });
  const file = formData.get("file");
  const hastaId = formData.get("hastaId");
  const kategori = formData.get("kategori") as BelgeKategori | null;
  const belgeTuru = formData.get("belgeTuru") as BelgeTuru | null;
  const cekimTarihi = formData.get("cekimTarihi");

  if (!(file instanceof File) || typeof hastaId !== "string" || !kategori || !belgeTuru || typeof cekimTarihi !== "string") {
    return NextResponse.json({ error: "Eksik veri." }, { status: 400 });
  }
  if (!UUID.test(hastaId) || !KATEGORILER.includes(kategori) || !/^\d{4}-\d{2}-\d{2}$/.test(cekimTarihi)) {
    return NextResponse.json({ error: "Geçersiz veri." }, { status: 400 });
  }
  const onamId = bosIseNull(formData.get("onamId"));
  const karsilastirmaGrubuId = bosIseNull(formData.get("karsilastirmaGrubuId"));
  if ((onamId && !UUID.test(onamId)) || (karsilastirmaGrubuId && !UUID.test(karsilastirmaGrubuId))) {
    return NextResponse.json({ error: "Geçersiz veri." }, { status: 400 });
  }

  const sonuc = await belgeYukle({
    bag: tenantGerekli(ctx),
    rol: ctx.rol,
    girdi: {
      hastaId,
      kategori: kategori as "radyoloji" | "klinik_foto" | "dokuman",
      belgeTuru,
      cekimTarihi,
      bolge: bosIseNull(formData.get("bolge")),
      karsilastirmaGrubuId,
      asama: bosIseNull(formData.get("asama")) as BelgeAsama | null,
      onamId,
      not: bosIseNull(formData.get("not")),
      cekenKurum: bosIseNull(formData.get("cekenKurum")),
      mime: file.type,
      veri: Buffer.from(await file.arrayBuffer()),
    },
  });
  if (sonuc.tur === "hata") return NextResponse.json({ error: sonuc.mesaj }, { status: sonuc.durum });
  return NextResponse.json({ id: sonuc.id });
}
