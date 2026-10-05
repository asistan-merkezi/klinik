"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { isimBasHarfBuyukYap } from "@/lib/utils";
import type { HastaKategori } from "@/types/hasta";

export type HastaAramaSonucu = {
  id: string;
  ad: string;
  kategori: HastaKategori;
};

type ApiHasta = { id: string; ad_soyad: string; telefon: string | null; kategori: HastaKategori };

/**
 * Dropdown yerine yazarak arama: girilen harflerle hasta adı/telefonu SUNUCUDA
 * (`/api/hasta-arama`, RLS ile klinik kapsamlı) aranır, seçilince gizli input'a
 * hasta_id yazılır. Önceden tüm hasta listesi sayfaya gömülüp istemcide
 * süzülüyordu — PostgREST 1000 satır sınırı yüzünden 1000. hastadan sonrakiler
 * listede hiç çıkmıyordu, her sayfa yüklemesinde de binlerce isim taşınıyordu.
 */
export function HastaArama({
  name = "hasta_id",
  id,
  required,
  disabled,
  varsayilanId,
  varsayilanAd,
  onSecim,
  onTemizle,
}: {
  name?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  varsayilanId?: string;
  varsayilanAd?: string;
  /** Bir hasta seçildiğinde satırı (kategori dahil) parent'a bildirir. */
  onSecim?: (hasta: HastaAramaSonucu) => void;
  /** Seçim temizlendiğinde (kullanıcı yazmaya devam ederse) parent'ı bilgilendirir. */
  onTemizle?: () => void;
}) {
  const [sorgu, setSorgu] = useState(varsayilanAd ? isimBasHarfBuyukYap(varsayilanAd) : "");
  const [seciliId, setSeciliId] = useState(varsayilanId ?? "");
  const [acik, setAcik] = useState(false);
  const [sonuclar, setSonuclar] = useState<HastaAramaSonucu[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState(false);
  const kapsayiciRef = useRef<HTMLDivElement>(null);
  const zamanlayiciRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const istekRef = useRef<AbortController | null>(null);

  useEffect(() => {
    function disariTiklandi(e: MouseEvent) {
      if (kapsayiciRef.current && !kapsayiciRef.current.contains(e.target as Node)) {
        setAcik(false);
      }
    }
    document.addEventListener("mousedown", disariTiklandi);
    return () => {
      document.removeEventListener("mousedown", disariTiklandi);
      if (zamanlayiciRef.current) clearTimeout(zamanlayiciRef.current);
      istekRef.current?.abort();
    };
  }, []);

  function ara(deger: string) {
    if (zamanlayiciRef.current) clearTimeout(zamanlayiciRef.current);
    istekRef.current?.abort();
    const q = deger.trim();
    if (!q) {
      setSonuclar([]);
      setYukleniyor(false);
      return;
    }
    setYukleniyor(true);
    zamanlayiciRef.current = setTimeout(async () => {
      const denetleyici = new AbortController();
      istekRef.current = denetleyici;
      try {
        const yanit = await fetch(`/api/hasta-arama?q=${encodeURIComponent(q)}`, { signal: denetleyici.signal });
        if (!yanit.ok) throw new Error(String(yanit.status));
        const govde = (await yanit.json()) as { hastalar?: ApiHasta[] };
        setSonuclar((govde.hastalar ?? []).map((h) => ({ id: h.id, ad: h.ad_soyad, kategori: h.kategori })));
        setHata(false);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setSonuclar([]);
        setHata(true);
      }
      setYukleniyor(false);
    }, 250);
  }

  let durumMetni: string | null = null;
  if (yukleniyor) durumMetni = "Aranıyor…";
  else if (hata) durumMetni = "Arama yapılamadı, tekrar deneyin.";
  else if (sonuclar.length === 0) durumMetni = "Eşleşen hasta yok.";

  return (
    <div ref={kapsayiciRef} className="relative flex flex-col gap-2">
      <input type="hidden" name={name} value={seciliId} required={required} />
      <Input
        id={id}
        value={sorgu}
        disabled={disabled}
        placeholder="Hasta adı veya telefon yazın..."
        autoComplete="off"
        onFocus={() => setAcik(true)}
        onChange={(e) => {
          setSorgu(isimBasHarfBuyukYap(e.target.value));
          setSeciliId("");
          setAcik(true);
          ara(e.target.value);
          onTemizle?.();
        }}
      />
      {acik && sorgu.trim() !== "" && !seciliId && (
        <div className="absolute top-full z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-popover text-sm text-popover-foreground shadow-md">
          {durumMetni ? (
            <p className="px-3 py-2 text-muted-foreground">{durumMetni}</p>
          ) : (
            sonuclar.map((m) => (
              <button
                key={m.id}
                type="button"
                className="flex w-full items-center px-3 py-2 text-left hover:bg-muted"
                onClick={() => {
                  setSorgu(isimBasHarfBuyukYap(m.ad));
                  setSeciliId(m.id);
                  setAcik(false);
                  onSecim?.(m);
                }}
              >
                {isimBasHarfBuyukYap(m.ad)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
