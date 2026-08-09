/**
 * Elle doldurulacak PDF formları (Kayıt Formu, İş Başvuru Formu vb.) için
 * ortak düz-HTML-string şablon yardımcıları — bkz. kayit-formu-sablon.ts
 * başındaki not: Puppeteer'a page.setContent() ile verildiği için BİLİNÇLİ
 * OLARAK Tailwind/JSX kullanmıyor.
 */

export const renk = {
  metin: "#000000",
  metinSoluk: "rgba(0,0,0,0.7)",
  metinCokSoluk: "rgba(0,0,0,0.6)",
  cizgi: "rgba(0,0,0,0.4)",
  kutuCizgi: "rgba(0,0,0,0.6)",
};

export const stil = {
  sayfa: {
    width: "100%",
    color: renk.metin,
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    fontSize: "13px",
    lineHeight: 1.4,
  },
  bolum: { marginTop: "28px" },
  ilkBolum: { marginTop: "0" },
  bolumBaslik: {
    fontSize: "12px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    marginBottom: "12px",
  },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "24px", rowGap: "16px" },
  grid3: { display: "grid", gridTemplateColumns: "2fr 1fr 1fr", columnGap: "24px", rowGap: "16px" },
  flexKol: { display: "flex", flexDirection: "column", gap: "16px" },
  // justifyContent:flex-end — grid satırındaki hücreler grid tarafından eşit
  // yüksekliğe (stretch) getiriliyor; bir hücrenin etiketi (örn. "Çalışma
  // Süresi (Başlangıç - Bitiş)") iki satıra sarılıp komşularından uzun
  // olduğunda, alt hizalama olmadan doldurulacak çizgi her hücrede farklı
  // yükseklikte kalıyordu (satır kayması). Alt hizalamayla çizgiler etiket
  // uzunluğundan bağımsız olarak satır boyunca hep aynı seviyede oturuyor.
  alan: { display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: "4px" },
  alanGenis: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-end",
    gap: "4px",
    gridColumn: "1 / -1",
  },
  etiket: { fontSize: "10.5px", color: renk.metinSoluk },
  cizgiSatir: { display: "block", height: "22px", borderBottom: `1px solid ${renk.cizgi}` },
} as const;

export function kacir(metin: string): string {
  return metin
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function css(obj: Record<string, string | number>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}:${v}`)
    .join(";");
}

type BolumDuzeni = "grid2" | "grid3" | "tekSutun";

export function bolum(
  baslik: string,
  govde: string,
  opts: { ilk?: boolean; duzen?: BolumDuzeni } = {}
): string {
  const disStil = css({ ...(opts.ilk ? stil.ilkBolum : stil.bolum), breakInside: "avoid" });
  const icStil = css(
    opts.duzen === "tekSutun" ? stil.flexKol : opts.duzen === "grid3" ? stil.grid3 : stil.grid2
  );
  return `<section class="bolum" style="${disStil}">
    <p style="${css(stil.bolumBaslik)}">${kacir(baslik)}</p>
    <div style="${icStil}">${govde}</div>
  </section>`;
}

export function alan(etiket: string, opts: { genis?: boolean; satir?: number } = {}): string {
  const disStil = css(opts.genis ? stil.alanGenis : stil.alan);
  const satirlar = Array.from({ length: opts.satir ?? 1 })
    .map(() => `<span style="${css(stil.cizgiSatir)}"></span>`)
    .join("");
  return `<div style="${disStil}">
    <span style="${css(stil.etiket)}">${kacir(etiket)}</span>
    ${satirlar}
  </div>`;
}

export function onay(etiket: string, aciklama?: string): string {
  const kutu = css({
    marginTop: "2px",
    width: "14px",
    height: "14px",
    flexShrink: 0,
    border: `1px solid ${renk.kutuCizgi}`,
  });
  const govdeStil = css({ display: "flex", flexDirection: "column", gap: "2px", flex: 1, minWidth: 0 });
  return `<div style="${css({ display: "flex", width: "100%", alignItems: "flex-start", gap: "8px" })}">
    <span style="${kutu}"></span>
    <div style="${govdeStil}">
      <span style="${css({ fontSize: "12.5px", wordBreak: "break-word" })}">${kacir(etiket)}</span>
      ${aciklama ? `<span style="${css({ fontSize: "10.5px", color: renk.metinCokSoluk, wordBreak: "break-word" })}">${kacir(aciklama)}</span>` : ""}
    </div>
  </div>`;
}

export function sayfa(govde: string, sonSayfa: boolean): string {
  const disStil = css({ ...stil.sayfa, breakAfter: sonSayfa ? "auto" : "page" });
  return `<div class="sayfa" style="${disStil}">${govde}</div>`;
}

export function imzaSatiri(): string {
  return `<div style="${css({
    marginTop: "40px",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    borderTop: "1px solid rgba(0,0,0,0.2)",
    paddingTop: "24px",
    fontSize: "12.5px",
    breakInside: "avoid",
  })}">
    <span>Ad Soyad: ________________________________</span>
    <span>İmza: ________________________________</span>
  </div>`;
}

export function formBasligi({
  klinikAdi,
  logoDataUri,
  formAdi,
}: {
  klinikAdi: string;
  logoDataUri: string | null;
  formAdi: string;
}): string {
  return `<header style="${css({ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "24px" })}">
    <div style="${css({ display: "flex", alignItems: "center", gap: "12px" })}">
      ${logoDataUri ? `<img src="${kacir(logoDataUri)}" alt="" style="${css({ height: "48px", width: "auto", objectFit: "contain" })}" />` : ""}
      <div>
        <p style="${css({ fontSize: "17px", fontWeight: 700 })}">${kacir(klinikAdi)}</p>
        <p style="${css({ fontSize: "12.5px", color: renk.metinSoluk })}">${kacir(formAdi)}</p>
      </div>
    </div>
    <p style="${css({ fontSize: "10.5px", color: renk.metinSoluk })}">Tarih: ____ / ____ / ______</p>
  </header>`;
}
