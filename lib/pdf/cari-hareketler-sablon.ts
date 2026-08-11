import { kacir, css, renk } from "@/lib/pdf/form-sablon-cekirdegi";

export type CariHareketlerPdfSatir = {
  tarih: string;
  saat: string;
  islemTuru: string;
  yontemMetni: string | null;
  terapist: string | null;
  tutar: string;
  tutarNegatifMi: boolean;
  bakiye: string;
  negatifMi: boolean;
};

const basHucreOrtak = {
  padding: "8px 10px",
  borderBottom: `1px solid ${renk.cizgi}`,
  fontSize: "10px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  color: renk.metinSoluk,
} as const;

const tabloStil = {
  tablo: css({ width: "100%", borderCollapse: "collapse", fontSize: "11.5px" }),
  basHucre: css({ ...basHucreOrtak, textAlign: "left" }),
  basHucreSag: css({ ...basHucreOrtak, textAlign: "right" }),
  hucre: css({ padding: "7px 10px", borderBottom: "1px solid rgba(0,0,0,0.12)" }),
};

function satirHtml(satir: CariHareketlerPdfSatir): string {
  return `<tr>
    <td style="${tabloStil.hucre}">${kacir(satir.tarih)}</td>
    <td style="${tabloStil.hucre}">${kacir(satir.saat)}</td>
    <td style="${tabloStil.hucre}">${kacir(satir.islemTuru)}${satir.yontemMetni ? ` (${kacir(satir.yontemMetni)})` : ""}</td>
    <td style="${tabloStil.hucre}">${kacir(satir.terapist ?? "—")}</td>
    <td style="${css({ padding: "7px 10px", borderBottom: "1px solid rgba(0,0,0,0.12)", textAlign: "right", color: satir.tutarNegatifMi ? "#b91c1c" : "#047857" })}">${kacir(satir.tutar)}</td>
    <td style="${css({ padding: "7px 10px", borderBottom: "1px solid rgba(0,0,0,0.12)", textAlign: "right", fontWeight: 600, color: satir.negatifMi ? "#b91c1c" : renk.metin })}">${kacir(satir.bakiye)}</td>
  </tr>`;
}

function baslikHtml({
  klinikAdi,
  logoDataUri,
  olusturmaTarihi,
}: {
  klinikAdi: string;
  logoDataUri: string | null;
  olusturmaTarihi: string;
}): string {
  return `<header style="${css({ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "24px" })}">
    <div style="${css({ display: "flex", alignItems: "center", gap: "12px" })}">
      ${logoDataUri ? `<img src="${kacir(logoDataUri)}" alt="" style="${css({ height: "48px", width: "auto", objectFit: "contain" })}" />` : ""}
      <div>
        <p style="${css({ fontSize: "17px", fontWeight: 700 })}">${kacir(klinikAdi)}</p>
        <p style="${css({ fontSize: "12.5px", color: renk.metinSoluk })}">Cari Hareketler</p>
      </div>
    </div>
    <p style="${css({ fontSize: "10.5px", color: renk.metinSoluk })}">Oluşturulma: ${kacir(olusturmaTarihi)}</p>
  </header>`;
}

export function cariHareketlerIcerikHtml({
  klinikAdi,
  logoDataUri,
  hastaAdSoyad,
  guncelBakiyeMetin,
  olusturmaTarihi,
  satirlar,
}: {
  klinikAdi: string;
  logoDataUri: string | null;
  hastaAdSoyad: string;
  guncelBakiyeMetin: string;
  olusturmaTarihi: string;
  satirlar: CariHareketlerPdfSatir[];
}): string {
  const govde =
    satirlar.length === 0
      ? `<p style="${css({ fontSize: "12.5px", color: renk.metinSoluk, marginTop: "16px" })}">Hareket yok.</p>`
      : `<table style="${tabloStil.tablo}">
          <thead>
            <tr>
              <th style="${tabloStil.basHucre}">Tarih</th>
              <th style="${tabloStil.basHucre}">Saat</th>
              <th style="${tabloStil.basHucre}">İşlem Türü</th>
              <th style="${tabloStil.basHucre}">Terapist</th>
              <th style="${tabloStil.basHucreSag}">Tutar</th>
              <th style="${tabloStil.basHucreSag}">Bakiye</th>
            </tr>
          </thead>
          <tbody>${satirlar.map(satirHtml).join("")}</tbody>
        </table>`;

  return `<div style="${css({ width: "100%", color: renk.metin, fontFamily: "'Inter', 'Segoe UI', sans-serif" })}">
    ${baslikHtml({ klinikAdi, logoDataUri, olusturmaTarihi })}
    <div style="${css({ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "16px" })}">
      <p style="${css({ fontSize: "14px", fontWeight: 700 })}">${kacir(hastaAdSoyad)}</p>
      <p style="${css({ fontSize: "12.5px" })}">Güncel Bakiye: <strong>${kacir(guncelBakiyeMetin)}</strong></p>
    </div>
    ${govde}
  </div>`;
}
