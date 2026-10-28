import { NextResponse } from "next/server";
import { getSessionContext, tenantGerekli } from "@/lib/auth/oturum";
import { withTenant } from "@/lib/db";
import { sinirYaniti } from "@/lib/guvenlik/istek-siniri";
import { hastaAra } from "@/lib/hasta/arama";

// Üst bar global aramasının canlı-sonuç ucu. Tenant YALNIZ oturumdan gelir; RLS `hasta` tablosunu klinik_id = current_klinik_id() ile
// sınırlar — burada ekstra bir tenant filtresi YAZILMAZ, dönen satırlar daima çağıranın kliniğine aittir. Yalnız personel (portal hastası değil).
export async function GET(req: Request) {
  const ctx = await getSessionContext(req.headers);
  if (!ctx) {
    return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });
  }
  if (ctx.tur !== "personel" || !ctx.tenantId || ctx.sifreDegistirmeli) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
  }

  const sinir = await sinirYaniti("hastaArama", ctx.userId);
  if (sinir) return sinir;

  const { searchParams } = new URL(req.url);
  const arama = (searchParams.get("q") ?? "").trim().slice(0, 100);
  if (!arama) {
    return NextResponse.json({ hastalar: [] });
  }

  try {
    const satirlar = await withTenant(tenantGerekli(ctx), (tx) => hastaAra(tx, arama, 8));
    return NextResponse.json({ hastalar: satirlar.map((h) => ({ id: h.id, ad_soyad: h.ad_soyad, telefon: h.telefon, kategori: h.kategori })) });
  } catch (hata) {
    console.error("Hasta arama başarısız:", hata);
    return NextResponse.json({ error: "Arama başarısız." }, { status: 500 });
  }
}
