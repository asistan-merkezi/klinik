"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { sema, pgHata } from "@/lib/db";
import { anonimRandevuUcCalistir } from "@/lib/guvenlik/anonim-uc";

type SonucDurumu = { success: boolean; message: string } | null;

// Randevu kimliği URL'den (sunucu eylemine bind edilir) gelir; klinik kimliği randevudan tanima şemasıyla çözülür (formdan alınmaz).
const semasi = z
  .object({
    puan: z.union([z.coerce.number().int().min(1).max(5), z.literal("")]).optional(),
    oneri_metni: z.string().trim().max(2000, "Öneri en fazla 2000 karakter olabilir.").optional(),
  })
  .refine((v) => (v.puan !== "" && v.puan !== undefined) || (v.oneri_metni && v.oneri_metni.length > 0), {
    message: "Lütfen bir puan verin veya öneri yazın.",
  });

export async function seansDegerlendirmeOlustur(randevuId: string, _onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const ayristirma = semasi.safeParse({
    puan: formData.get("puan") ?? "",
    oneri_metni: formData.get("oneri_metni") ?? "",
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { puan, oneri_metni } = ayristirma.data;

  // Hız sınırı (FAIL-CLOSED) + `klinik_anonim` ile yazma. Randevunun anket için uygun olması (tamamlanmış/gelmiş) DB politikasında da zorlanır.
  const sonuc = await anonimRandevuUcCalistir({ ucAdi: "seans_anket", randevuId, basliklar: await headers() }, (tx, klinikId) =>
    tx.insert(sema.seansDegerlendirme).values({
      klinikId,
      randevuId,
      // hasta_id randevudan tetikleyiciyle türetilir; yine de NOT NULL tipi için geçici değer vermeden bırakılamaz → tetikleyici BEFORE INSERT'te doldurur
      hastaId: "00000000-0000-0000-0000-000000000000",
      puan: puan === "" || puan === undefined ? null : puan,
      oneriMetni: oneri_metni || null,
    })
  ).catch((e) => {
    const h = pgHata(e);
    console.error("Seans değerlendirmesi oluşturulamadı:", h.mesaj);
    return h.kod === "23505" ? ("zaten" as const) : null;
  });

  if (sonuc === "zaten") return { success: false, message: "Bu seans için zaten bir değerlendirme alındı." };
  if (!sonuc) return { success: false, message: "Gönderilemedi, lütfen tekrar deneyin." };
  if (!sonuc.ok) return { success: false, message: sonuc.mesaj };
  return { success: true, message: "Değerlendirmeniz için teşekkür ederiz." };
}
