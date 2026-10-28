// Etkin fiyat (kategoriye göre kademeli fiyat + iskonto) kuralının TEK doğruluk kaynağı SQL'dir: `islem_tanimi_etkin_fiyat()` (SECURITY DEFINER).
// Eskiden burada aynı kuralın float'lı bir JS kopyası da vardı (hiçbir yerden çağrılmıyordu) — Modül 4'te kaldırıldı; fiyat/iskonto istemcide HESAPLANMAZ,
// istemci yalnız RPC sonucunu gösterir. Burada yalnız veri şekilleri kaldı.

export type KademeliFiyat = {
  vita_fiyat: number;
  plus_fiyat: number | null;
  elit_fiyat: number | null;
  prime_fiyat: number | null;
};

export type IskontoOranlariYuzde = {
  plus_pct: number;
  elit_pct: number;
  prime_pct: number;
};
