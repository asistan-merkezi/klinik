"use server";

import { createClient } from "@/lib/supabase/server";

async function yetkiliBaglamGetir(hastaId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, yetkisiz: true as const };
  }

  const { data: kullanici } = await supabase.from("kullanici").select("rol").eq("id", user.id).single();

  if (!kullanici || !["klinik_admin", "resepsiyon", "terapist"].includes(kullanici.rol)) {
    return { supabase, yetkisiz: true as const };
  }

  const { data: hasta } = await supabase.from("hasta").select("id, klinik_id").eq("id", hastaId).single();
  if (!hasta) {
    return { supabase, yetkisiz: true as const };
  }

  return { supabase, userId: user.id, rol: kullanici.rol as string, hasta, yetkisiz: false as const };
}

export async function klinikFotoOnamKaydet(hastaId: string): Promise<{ success: true } | { error: string }> {
  const ctx = await yetkiliBaglamGetir(hastaId);
  if (ctx.yetkisiz) return { error: "Bu işlem için yetkiniz yok." };

  const { error } = await ctx.supabase.from("hasta_onam").insert({
    hasta_id: hastaId,
    onam_tipi: "klinik_foto",
    imzalayan: "hasta",
    imza_storage_path: null,
    olusturan_kullanici_id: ctx.userId,
  });

  if (error) {
    console.error("Klinik foto onamı kaydedilemedi:", error);
    return { error: "Kaydedilemedi, lütfen tekrar deneyin." };
  }
  return { success: true };
}

export async function belgeSil(belgeId: string, hastaId: string): Promise<{ success: true } | { error: string }> {
  const ctx = await yetkiliBaglamGetir(hastaId);
  if (ctx.yetkisiz || ctx.rol === "terapist") {
    return { error: "Bu işlem için yetkiniz yok." };
  }

  const { error } = await ctx.supabase
    .from("hasta_belge")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", belgeId);

  if (error) {
    console.error("Belge silinemedi:", error);
    return { error: "Silinemedi, lütfen tekrar deneyin." };
  }
  return { success: true };
}

export async function belgeKaliciSil(belgeId: string, hastaId: string): Promise<{ success: true } | { error: string }> {
  const ctx = await yetkiliBaglamGetir(hastaId);
  if (ctx.yetkisiz || ctx.rol !== "klinik_admin") {
    return { error: "Bu işlem için yetkiniz yok." };
  }

  const { error } = await ctx.supabase.from("hasta_belge").delete().eq("id", belgeId);

  if (error) {
    console.error("Belge kalıcı silinemedi:", error);
    return { error: "Silinemedi, lütfen tekrar deneyin." };
  }
  return { success: true };
}

export async function belgeThumbnailUrlAl(belgeId: string): Promise<{ url: string | null } | { error: string }> {
  // Liste/galeri görünümündeki rutin thumbnail yüklemeleri audit_log'a
  // yazılmaz (hasta_belge_goruntule RPC'si SADECE gerçek "aç/görüntüle"
  // anı için kullanılır) — burada düz RLS'li SELECT + Signed URL yeterli.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Oturum bulunamadı." };

  const { data: belge, error } = await supabase
    .from("hasta_belge")
    .select("storage_path, thumbnail_path")
    .eq("id", belgeId)
    .single<{ storage_path: string; thumbnail_path: string | null }>();

  if (error || !belge) return { error: "Belge bulunamadı." };
  if (!belge.thumbnail_path) return { url: null };

  const { data: signed, error: signError } = await supabase.storage
    .from("hasta-belge")
    .createSignedUrl(belge.thumbnail_path, 300);

  if (signError || !signed) return { error: "Önizleme oluşturulamadı." };
  return { url: signed.signedUrl };
}

export async function belgeIndir(belgeId: string): Promise<{ url: string; klinikAdi: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Oturum bulunamadı." };

  const { data: belge, error: rpcError } = await supabase
    .rpc("hasta_belge_goruntule", { p_id: belgeId })
    .single<{ id: string; klinik_id: string; storage_path: string }>();

  if (rpcError || !belge) return { error: "Belge bulunamadı veya erişim yetkiniz yok." };

  // İndirme, görüntülemeden ayrı ve daha hassas bir eylem — kendi audit satırı.
  await supabase.from("audit_log").insert({
    klinik_id: belge.klinik_id,
    kullanici_id: user.id,
    eylem: "indirme",
    hedef_tablo: "hasta_belge",
    hedef_id: belge.id,
  });

  const [{ data: signed, error: signError }, { data: klinik }] = await Promise.all([
    supabase.storage.from("hasta-belge").createSignedUrl(belge.storage_path, 300),
    supabase.from("klinik").select("ad").eq("id", belge.klinik_id).single(),
  ]);

  if (signError || !signed) return { error: "İndirme bağlantısı oluşturulamadı." };

  return { url: signed.signedUrl, klinikAdi: klinik?.ad ?? "" };
}
