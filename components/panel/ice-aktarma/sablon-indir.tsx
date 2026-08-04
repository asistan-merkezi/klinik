"use client";

import { Button } from "@/components/ui/button";
import type { HedefAlan } from "./sutun-esleme";

// Kullanıcı isteği: sütun adları önceden belli olsun ki eski programdan alınan
// veri buna göre hazırlanabilsin. Sütun başlıkları hedef alan etiketleriyle
// BİREBİR aynı verilirse otomatikEslemeOner (sutun-esleme.tsx) sıfır elle
// müdahaleyle eşleşir. UTF-8 BOM eklendi — BOM'suz CSV, Türkçe Excel'de bozuk
// karakter (mojibake) gösterir.
export function SablonIndir({ hedefAlanlar, dosyaAdi }: { hedefAlanlar: HedefAlan[]; dosyaAdi: string }) {
  function indir() {
    const basliklar = hedefAlanlar.map((a) => a.label).join(";");
    const icerik = "﻿" + basliklar + "\r\n";
    const blob = new Blob([icerik], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = dosyaAdi;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={indir}>
      Boş Şablon İndir (CSV)
    </Button>
  );
}
