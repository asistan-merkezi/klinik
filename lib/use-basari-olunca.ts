import { useEffect, useRef } from "react";

/**
 * Bir server action (useActionState) başarıyla döndüğünde `geriCagri`yı BİR KEZ çağırır — tipik kullanım:
 * form dialog'unu kapatmak. Geri çağrı çoğu zaman ÜST bileşenin state'ini günceller; bunu render sırasında
 * yapmak ("Cannot update a component while rendering a different component") React hatası üretir, bu yüzden
 * effect'te çalışır. `sonuc` her yeni action sonucunda yeni bir nesnedir; aynı sonuç için yeniden tetiklenmez.
 * Geri çağrının kimliği değişse de (satır içi ok fonksiyonu) effect yeniden çalışmaz: ref ile en güncel hali kullanılır.
 */
export function useBasariOlunca(sonuc: { success: boolean } | null | undefined, geriCagri?: () => void) {
  const geriCagriRef = useRef(geriCagri);
  useEffect(() => {
    geriCagriRef.current = geriCagri;
  });
  useEffect(() => {
    if (sonuc?.success) geriCagriRef.current?.();
  }, [sonuc]);
}
