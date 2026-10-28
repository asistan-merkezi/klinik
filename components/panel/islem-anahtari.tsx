"use client";

import { useState } from "react";

/**
 * Mali yazma formlarında çift gönderimi (çift tıklama, ağ yeniden denemesi) sunucuda engelleyen gizli alan (lib/finans/idempotans.ts).
 * Anahtar form açılınca üretilir; aynı form iki kez gönderilirse sunucu ikincisini yazmaz. `sonuc` (form eyleminin son sonucu)
 * değişince — başarıda sıradaki yeni kayıt, hatada yeniden deneme için — yeni anahtar üretilir.
 */
export function IslemAnahtari({ sonuc }: { sonuc?: unknown }) {
  const [durum, setDurum] = useState(() => ({ sonuc, anahtar: crypto.randomUUID() }));
  let anahtar = durum.anahtar;
  if (durum.sonuc !== sonuc) {
    // Render sırasında türetilmiş durum güncellemesi (React'in önerdiği desen); sonuç gelince bir kez yeni anahtar.
    anahtar = crypto.randomUUID();
    setDurum({ sonuc, anahtar });
  }
  return <input type="hidden" name="islem_anahtari" value={anahtar} />;
}
