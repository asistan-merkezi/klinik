import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hastaAra } from "@/lib/hasta/arama";

// Üst bar global aramasının canlı-sonuç ucu. RLS `hasta` tablosunda
// klinik_id = current_klinik_id() ile sınırlar; burada ekstra bir tenant
// filtresi YAZILMAZ — dönen satırlar daima çağıranın kliniğine aittir.
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const arama = (searchParams.get("q") ?? "").trim();
  if (!arama) {
    return NextResponse.json({ hastalar: [] });
  }

  const { data, error } = await hastaAra(supabase, arama, "id, ad_soyad, telefon, kategori", 8);

  if (error) {
    console.error("Hasta arama başarısız:", error);
    return NextResponse.json({ error: "Arama başarısız." }, { status: 500 });
  }

  return NextResponse.json({ hastalar: data });
}
