import { ONAY_ACIKLAMALARI } from "@/lib/onay-metinleri";

/**
 * Hasta Kayıt Formu PDF şablonu — Puppeteer'a page.setContent() ile verilir.
 * setContent ile göreli yollar/harici stylesheet çalışmadığı için BİLİNÇLİ
 * OLARAK Tailwind kullanmıyor, düz HTML string + inline style üretiyor.
 * JSX/renderToStaticMarkup KULLANILMIYOR — Next.js App Router'ın Turbopack
 * build'i "react-dom/server" import'unu route handler'ların da dahil olduğu
 * server modül grafiğinde reddediyor ("react-server" koşulu çakışması), bu
 * yüzden düz string üretimi tercih edildi; ayrıca bu, html2canvas'ın 3 kez
 * art arda başarısız olduğu Tailwind/grid uyumluluk sorunlarından tamamen
 * bağımsız, gerçek Chromium print layout motoruna güveniyor (CLAUDE.md'deki
 * "html2canvas kendi layout motorunu yeniden implemente ediyor" dersi).
 * Ekrandaki önizleme sayfası (`/panel/hastalar/kayit-formu`, Tailwind) bu
 * şablondan bağımsız ayrı bir bileşen ağacı — aynı metin/alan içeriğini
 * paylaşıyor ama render yolları kasıtlı olarak ayrı.
 *
 * Dinamik metin (klinik adı) `kacir()` ile HTML-escape edilmeden asla
 * şablona gömülmüyor — string concatenation React'in otomatik escape'ini
 * karşılamadığı için burada elle yapılması zorunlu.
 */

function kacir(metin: string): string {
  return metin
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function css(obj: Record<string, string | number>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}:${v}`)
    .join(";");
}

const renk = {
  metin: "#000000",
  metinSoluk: "rgba(0,0,0,0.7)",
  metinCokSoluk: "rgba(0,0,0,0.6)",
  cizgi: "rgba(0,0,0,0.4)",
  kutuCizgi: "rgba(0,0,0,0.6)",
};

const stil = {
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
  flexKol: { display: "flex", flexDirection: "column", gap: "16px" },
  alan: { display: "flex", flexDirection: "column", gap: "4px" },
  alanGenis: { display: "flex", flexDirection: "column", gap: "4px", gridColumn: "1 / -1" },
  etiket: { fontSize: "10.5px", color: renk.metinSoluk },
  cizgiSatir: { display: "block", height: "22px", borderBottom: `1px solid ${renk.cizgi}` },
} as const;

function bolum(baslik: string, govde: string, opts: { ilk?: boolean; tekSutun?: boolean } = {}): string {
  const disStil = css({ ...(opts.ilk ? stil.ilkBolum : stil.bolum), breakInside: "avoid" });
  const icStil = css(opts.tekSutun ? stil.flexKol : stil.grid2);
  return `<section class="bolum" style="${disStil}">
    <p style="${css(stil.bolumBaslik)}">${kacir(baslik)}</p>
    <div style="${icStil}">${govde}</div>
  </section>`;
}

function alan(etiket: string, opts: { genis?: boolean; satir?: number } = {}): string {
  const disStil = css(opts.genis ? stil.alanGenis : stil.alan);
  const satirlar = Array.from({ length: opts.satir ?? 1 })
    .map(() => `<span style="${css(stil.cizgiSatir)}"></span>`)
    .join("");
  return `<div style="${disStil}">
    <span style="${css(stil.etiket)}">${kacir(etiket)}</span>
    ${satirlar}
  </div>`;
}

function onay(etiket: string, aciklama?: string): string {
  const kutu = css({ marginTop: "2px", width: "14px", height: "14px", flexShrink: 0, border: `1px solid ${renk.kutuCizgi}` });
  const govdeStil = css({ display: "flex", flexDirection: "column", gap: "2px", flex: 1, minWidth: 0 });
  return `<div style="${css({ display: "flex", width: "100%", alignItems: "flex-start", gap: "8px" })}">
    <span style="${kutu}"></span>
    <div style="${govdeStil}">
      <span style="${css({ fontSize: "12.5px", wordBreak: "break-word" })}">${kacir(etiket)}</span>
      ${aciklama ? `<span style="${css({ fontSize: "10.5px", color: renk.metinCokSoluk, wordBreak: "break-word" })}">${kacir(aciklama)}</span>` : ""}
    </div>
  </div>`;
}

function evetHayirSatiri(etiket: string, aciklamaEtiketi?: string): string {
  const kutuStil = css({ width: "12px", height: "12px", border: `1px solid ${renk.kutuCizgi}`, flexShrink: 0 });
  return `<div style="${css({ display: "flex", flexDirection: "column", gap: "8px", paddingBottom: "12px", breakInside: "avoid" })}">
    <div style="${css({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" })}">
      <span style="${css({ fontSize: "12.5px" })}">${kacir(etiket)}</span>
      <div style="${css({ display: "flex", alignItems: "center", gap: "16px", fontSize: "10.5px" })}">
        <span style="${css({ display: "flex", alignItems: "center", gap: "4px" })}"><span style="${kutuStil}"></span> Evet</span>
        <span style="${css({ display: "flex", alignItems: "center", gap: "4px" })}"><span style="${kutuStil}"></span> Hayır</span>
      </div>
    </div>
    <div style="${css(stil.alan)}">
      <span style="${css(stil.etiket)}">${kacir(aciklamaEtiketi ?? "Açıklama")}</span>
      <span style="${css(stil.cizgiSatir)}"></span>
    </div>
  </div>`;
}

function sayfa(govde: string, sonSayfa: boolean): string {
  const disStil = css({ ...stil.sayfa, breakAfter: sonSayfa ? "auto" : "page" });
  return `<div class="sayfa" style="${disStil}">${govde}</div>`;
}

const TIBBI_GECMIS_SATIRLARI: { etiket: string; aciklamaEtiketi: string }[] = [
  { etiket: "⚠ Alerji Durumu", aciklamaEtiketi: "İlaç, lateks, lokal/genel anestezi, gıda vb. detaylar" },
  { etiket: "🩸 Kan Sulandırıcı Kullanımı", aciklamaEtiketi: "İlaç adı, dozu ve en son ne zaman alındığı" },
  { etiket: "Kronik Hastalıklar", aciklamaEtiketi: "Hipertansiyon, diyabet, kalp, astım vb. detayı" },
  { etiket: "Sürekli Kullanılan İlaçlar", aciklamaEtiketi: "Düzenli alınan tüm ilaçların adları" },
  { etiket: "Geçirilmiş Ameliyatlar", aciklamaEtiketi: "Ameliyat türü ve yılları" },
  { etiket: "Bulaşıcı / Enfeksiyöz Hastalık", aciklamaEtiketi: "Hepatit, HIV, tüberküloz vb. detayı" },
  { etiket: "Protez / Kalp Pili / İmplant", aciklamaEtiketi: "Vücutta bulunan protez veya tıbbi cihazlar" },
  { etiket: "Hamilelik / Emzirme Durumu (kadın hastalar için)", aciklamaEtiketi: "Hafta/ay bilgisi veya özel durumlar" },
  { etiket: "Sigara / Alkol / Madde Kullanımı", aciklamaEtiketi: "Tüketim sıklığı ve miktarı" },
];

export function kayitFormuIcerikHtml({
  klinikAdi,
  logoDataUri,
}: {
  klinikAdi: string;
  logoDataUri: string | null;
}): string {
  const sayfa1 = sayfa(
    `<header style="${css({ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "24px" })}">
      <div style="${css({ display: "flex", alignItems: "center", gap: "12px" })}">
        ${logoDataUri ? `<img src="${kacir(logoDataUri)}" alt="" style="${css({ height: "48px", width: "auto", objectFit: "contain" })}" />` : ""}
        <div>
          <p style="${css({ fontSize: "17px", fontWeight: 700 })}">${kacir(klinikAdi)}</p>
          <p style="${css({ fontSize: "12.5px", color: renk.metinSoluk })}">Yeni Hasta Kayıt Formu — elle doldurulacaktır</p>
        </div>
      </div>
      <p style="${css({ fontSize: "10.5px", color: renk.metinSoluk })}">Tarih: ____ / ____ / ______</p>
    </header>` +
      bolum(
        "Kimlik & İletişim Bilgileri",
        alan("Ad Soyad", { genis: true }) +
          alan("Doğum Tarihi") +
          alan("Cinsiyet (K / E / Belirtmek istemiyorum)") +
          alan("Telefon") +
          alan("E-posta (opsiyonel)") +
          alan("T.C. Kimlik No / Pasaport No") +
          alan("Adres", { genis: true, satir: 2 }) +
          alan("Bizi Nereden Duydunuz?", { genis: true }),
        { ilk: true }
      ) +
      bolum(
        "Veli Bilgisi (18 yaş altı hasta için)",
        alan("Anne Adı") +
          alan("Anne Telefonu") +
          alan("Baba Adı") +
          alan("Baba Telefonu") +
          alan("Diğer Yakını Ad Soyad") +
          alan("Diğer Yakını Telefonu") +
          alan("Diğer Yakını Yakınlık Derecesi (Teyze, Amca, Dede...)", { genis: true })
      ) +
      bolum("Acil Durum Kişisi", alan("Ad Soyad") + alan("Yakınlığı") + alan("Telefon")),
    false
  );

  const sayfa2 = sayfa(
    bolum(
      "Tıbbi Ön Geçmiş",
      TIBBI_GECMIS_SATIRLARI.map((s) => evetHayirSatiri(s.etiket, s.aciklamaEtiketi)).join(""),
      { ilk: true, tekSutun: true }
    ),
    false
  );

  const sayfa3 = sayfa(
    bolum("Geliş Sebebi & Klinik Notları", alan("Şikayet / Geliş Sebebi", { satir: 2 }), {
      ilk: true,
      tekSutun: true,
    }) +
      bolum(
        "Onaylar",
        onay(
          "KVKK Aydınlatma Metni'ni okudum, kişisel verilerimin işlenmesini onaylıyorum.",
          ONAY_ACIKLAMALARI.kvkk.metin
        ) +
          onay(
            "Sağlık verilerimin (tıbbi geçmiş) tedavi amacıyla işlenmesine açık rıza veriyorum.",
            ONAY_ACIKLAMALARI.saglik.metin
          ) +
          onay(
            "Randevu/paket/bakiye bilgilendirmesi için WhatsApp mesajı almak istiyorum.",
            ONAY_ACIKLAMALARI.whatsapp.metin
          ) +
          onay(
            "Kampanya ve bilgilendirme amaçlı SMS/e-posta almak istiyorum.",
            ONAY_ACIKLAMALARI.ticari.metin
          ),
        { tekSutun: true }
      ) +
      `<div style="${css({
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
      </div>`,
    true
  );

  return sayfa1 + sayfa2 + sayfa3;
}
