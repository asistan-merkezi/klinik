import { ONAY_ACIKLAMALARI } from "@/lib/onay-metinleri";
import { bolum, alan, onay, sayfa, imzaSatiri, formBasligi, css, kacir, renk, stil } from "@/lib/pdf/form-sablon-cekirdegi";

/**
 * Hasta Kayıt Formu PDF şablonu — Puppeteer'a page.setContent() ile verilir.
 * Ortak düz-HTML-string yardımcıları (css/kacir/bolum/alan/onay/sayfa) artık
 * form-sablon-cekirdegi.ts'te — bkz. oradaki not: JSX/renderToStaticMarkup
 * KULLANILMIYOR (Next.js App Router'ın Turbopack build'i "react-dom/server"
 * import'unu route handler'ların da dahil olduğu server modül grafiğinde
 * reddediyor), ayrıca bu, html2canvas'ın 3 kez art arda başarısız olduğu
 * Tailwind/grid uyumluluk sorunlarından tamamen bağımsız, gerçek Chromium
 * print layout motoruna güveniyor (CLAUDE.md'deki "html2canvas kendi layout
 * motorunu yeniden implemente ediyor" dersi).
 * Ekrandaki önizleme sayfası (`/panel/hastalar/kayit-formu`, Tailwind) bu
 * şablondan bağımsız ayrı bir bileşen ağacı — aynı metin/alan içeriğini
 * paylaşıyor ama render yolları kasıtlı olarak ayrı.
 */

type IkonTuru = "uyari" | "damla";

/**
 * Emoji (⚠ 🩸) yerine — @sparticuz/chromium'un Lambda ortamında emoji
 * font'u yok (sistem fontu minimal), glyph bulunamayıp boş kutu basıyordu.
 * Font gömmek (Noto Color Emoji ~10MB) bundle'ı şişirir ve siyah-beyaz
 * baskıda renkli emoji zaten anlamsız — onun yerine lucide-react'in
 * TriangleAlert/Droplet path verisiyle birebir aynı, inline (harici
 * referans yok) SVG gömülüyor; `stroke="currentColor"` ile çevresindeki
 * metin rengini takip ediyor.
 */
function svgIkon(tur: IkonTuru): string {
  const yol: Record<IkonTuru, string> = {
    uyari:
      '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    damla:
      '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="${css({ flexShrink: 0, verticalAlign: "middle" })}">${yol[tur]}</svg>`;
}

function evetHayirSatiri(etiket: string, aciklamaEtiketi?: string, ikon?: IkonTuru): string {
  const kutuStil = css({ width: "12px", height: "12px", border: `1px solid ${renk.kutuCizgi}`, flexShrink: 0 });
  const etiketIcerik = ikon
    ? `<span style="${css({ display: "flex", alignItems: "center", gap: "6px" })}">${svgIkon(ikon)}${kacir(etiket)}</span>`
    : kacir(etiket);
  return `<div style="${css({ display: "flex", flexDirection: "column", gap: "8px", paddingBottom: "12px", breakInside: "avoid" })}">
    <div style="${css({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" })}">
      <span style="${css({ fontSize: "12.5px" })}">${etiketIcerik}</span>
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

const TIBBI_GECMIS_SATIRLARI: { etiket: string; aciklamaEtiketi: string; ikon?: IkonTuru }[] = [
  { etiket: "Alerji Durumu", aciklamaEtiketi: "İlaç, lateks, lokal/genel anestezi, gıda vb. detaylar", ikon: "uyari" },
  { etiket: "Kan Sulandırıcı Kullanımı", aciklamaEtiketi: "İlaç adı, dozu ve en son ne zaman alındığı", ikon: "damla" },
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
    formBasligi({ klinikAdi, logoDataUri, formAdi: "Yeni Hasta Kayıt Formu — elle doldurulacaktır" }) +
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
      TIBBI_GECMIS_SATIRLARI.map((s) => evetHayirSatiri(s.etiket, s.aciklamaEtiketi, s.ikon)).join(""),
      { ilk: true, duzen: "tekSutun" }
    ),
    false
  );

  const sayfa3 = sayfa(
    bolum("Geliş Sebebi & Klinik Notları", alan("Şikayet / Geliş Sebebi", { satir: 2 }), {
      ilk: true,
      duzen: "tekSutun",
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
        { duzen: "tekSutun" }
      ) +
      imzaSatiri(),
    true
  );

  return sayfa1 + sayfa2 + sayfa3;
}
