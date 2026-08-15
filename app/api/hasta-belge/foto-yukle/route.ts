import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { MAX_DOSYA_BOYUTU_BYTE, type BelgeAsama, type BelgeKategori, type BelgeTuru } from "@/types/hasta-belge";

// sharp native binary gerektirdiği için Node runtime zorunlu (Edge'de çalışmaz).
export const runtime = "nodejs";

function bosIseNull(deger: FormDataEntryValue | null): string | null {
  if (deger == null) return null;
  const s = String(deger).trim();
  return s === "" ? null : s;
}

// Tek POST'ta: yetki kontrolü + Storage'a yükleme + hasta_belge satırı +
// thumbnail üretimi. Öncesinde bu 3 adım (belgeYuklemeBaslat signed-URL +
// client'tan doğrudan Storage'a yükleme + belgeKaydet) ayrı ayrı, üç round-
// trip'te yapılıyordu; thumbnail için de dosya Storage'dan tekrar indirilip
// okunuyordu. Burada dosya zaten bellekte olduğu için o indirme adımı da
// kalktı.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });
  }

  const { data: kullanici } = await supabase.from("kullanici").select("rol").eq("id", user.id).single();
  if (!kullanici || !["klinik_admin", "resepsiyon", "terapist"].includes(kullanici.rol)) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  const hastaId = formData.get("hastaId");
  const kategori = formData.get("kategori") as BelgeKategori | null;
  const belgeTuru = formData.get("belgeTuru") as BelgeTuru | null;
  const cekimTarihi = formData.get("cekimTarihi");

  if (!(file instanceof File) || typeof hastaId !== "string" || !kategori || !belgeTuru || typeof cekimTarihi !== "string") {
    return NextResponse.json({ error: "Eksik veri." }, { status: 400 });
  }
  if (file.size > MAX_DOSYA_BOYUTU_BYTE) {
    return NextResponse.json({ error: "Dosya boyutu çok büyük." }, { status: 400 });
  }

  // RLS klinik_id = current_klinik_id() ile sınırlar; satır dönerse kendi kliniğindendir.
  const { data: hasta } = await supabase.from("hasta").select("id, klinik_id").eq("id", hastaId).single();
  if (!hasta) {
    return NextResponse.json({ error: "Hasta bulunamadı." }, { status: 404 });
  }

  const bolge = bosIseNull(formData.get("bolge"));
  const karsilastirmaGrubuId = bosIseNull(formData.get("karsilastirmaGrubuId"));
  const asama = bosIseNull(formData.get("asama")) as BelgeAsama | null;
  const onamId = bosIseNull(formData.get("onamId"));
  const not = bosIseNull(formData.get("not"));
  const cekenKurum = bosIseNull(formData.get("cekenKurum"));

  const belgeId = randomUUID();
  const uzanti = file.name.split(".").pop()?.toLowerCase() || (file.type === "application/pdf" ? "pdf" : "webp");
  const path = `${hasta.klinik_id}/${hastaId}/${kategori}/${belgeId}.${uzanti}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: yuklemeHatasi } = await supabase.storage
    .from("hasta-belge")
    .upload(path, buffer, { contentType: file.type });

  if (yuklemeHatasi) {
    console.error("Belge yüklenemedi:", yuklemeHatasi);
    return NextResponse.json({ error: "Yükleme başarısız, lütfen tekrar deneyin." }, { status: 500 });
  }

  const metadata: Record<string, unknown> = {};
  if (not) metadata.not = not;
  if (cekenKurum) metadata.ceken_kurum = cekenKurum;

  const { data: belge, error: kayitHatasi } = await supabase
    .from("hasta_belge")
    .insert({
      id: belgeId,
      hasta_id: hastaId,
      kategori,
      belge_turu: belgeTuru,
      bolge,
      cekim_tarihi: cekimTarihi,
      karsilastirma_grubu_id: karsilastirmaGrubuId,
      asama,
      onam_id: onamId,
      storage_path: path,
      dosya_mime: file.type,
      dosya_boyut_byte: file.size,
      yukleyen_kullanici_id: user.id,
      metadata,
    })
    .select("id")
    .single();

  if (kayitHatasi || !belge) {
    console.error("Belge kaydedilemedi:", kayitHatasi);
    return NextResponse.json({ error: "Belge kaydedilemedi, lütfen tekrar deneyin." }, { status: 500 });
  }

  // Thumbnail sadece görseller için üretilir — PDF rasterize etmek sharp'ın
  // kapsamı dışında, PDF'ler görüntülemede generic ikonla gösterilir.
  if (file.type !== "application/pdf") {
    try {
      const kucukResim = await sharp(buffer).rotate().resize(300, 300, { fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
      const thumbPath = path.replace(/(\.[^./]+)$/, "_thumb.jpg");
      const { error: thumbHatasi } = await supabase.storage
        .from("hasta-belge")
        .upload(thumbPath, kucukResim, { contentType: "image/jpeg", upsert: true });
      if (!thumbHatasi) {
        await supabase.from("hasta_belge").update({ thumbnail_path: thumbPath }).eq("id", belge.id);
      }
    } catch (e) {
      console.error("Thumbnail üretilemedi (belge yine de kaydedildi):", e);
    }
  }

  return NextResponse.json({ id: belge.id });
}
