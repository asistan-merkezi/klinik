// Drizzle sorgu hatalarını sarar (mesaj "Failed query: ..." olur, gerçek pg hatası `cause` içindedir). Kod/mesaj/kısıt adı tek yerden okunur.
export type PgHatasi = { kod: string | null; mesaj: string; kisit: string | null; ayrinti: string | null };

export function pgHata(e: unknown): PgHatasi {
  let h: unknown = e;
  for (let i = 0; i < 4 && h && typeof h === "object" && "cause" in h && (h as { cause?: unknown }).cause; i++) h = (h as { cause: unknown }).cause;
  const o = (h ?? {}) as { code?: string; message?: string; constraint?: string; detail?: string };
  return { kod: o.code ?? null, mesaj: o.message ?? (e instanceof Error ? e.message : String(e)), kisit: o.constraint ?? null, ayrinti: o.detail ?? null };
}
