import { bolum, alan, onay, sayfa, imzaSatiri, formBasligi } from "@/lib/pdf/form-sablon-cekirdegi";

/**
 * İş Başvuru Formu PDF şablonu — Personel Listesi'nden resepsiyonun,
 * kapıya gelip elle form doldurmak isteyen bir adaya bastırıp verdiği boş
 * form. Kayıt Formu ile aynı desen (bkz. kayit-formu-sablon.ts) — ortak
 * yardımcılar form-sablon-cekirdegi.ts'te. Doldurulan form panelde bir
 * yere KAYDEDİLMİYOR (bu turda kapsam dışı) — QR ile self-servis
 * `is_basvurusu` akışından farklı olarak sadece kağıt üzerinde kalıyor,
 * resepsiyon isterse Personel > Yeni Personel formuna elle aktarır.
 */

function deneyimSatiri(): string {
  return alan("Şirket Adı") + alan("Görev") + alan("Çalışma Süresi (Başlangıç - Bitiş)");
}

function referansSatiri(): string {
  return alan("Ad Soyad") + alan("Telefon") + alan("Bağlantı (Yönetici, İş Arkadaşı vb.)");
}

export function isBasvuruFormuIcerikHtml({
  klinikAdi,
  logoDataUri,
}: {
  klinikAdi: string;
  logoDataUri: string | null;
}): string {
  const govde =
    formBasligi({ klinikAdi, logoDataUri, formAdi: "İş Başvuru Formu — elle doldurulacaktır" }) +
    bolum(
      "Kişisel Bilgiler",
      alan("Ad Soyad", { genis: true }) +
        alan("Doğum Tarihi") +
        alan("T.C. Kimlik No") +
        alan("Telefon") +
        alan("E-posta") +
        alan("Adres", { genis: true, satir: 2 }),
      { ilk: true }
    ) +
    bolum(
      "Başvuru Bilgileri",
      alan("Başvurulan Pozisyon", { genis: true }) +
        alan("Bizi Nereden Duydunuz?") +
        alan("Çalışmaya Başlayabileceğiniz Tarih") +
        alan("Tercih Edilen Çalışma Şekli (Tam Zamanlı / Yarı Zamanlı)") +
        alan("Beklenen Ücret (opsiyonel)")
    ) +
    bolum(
      "Eğitim Bilgisi",
      alan("Son Mezun Olunan Okul / Bölüm", { genis: true }) +
        alan("Mezuniyet Yılı") +
        alan("Sahip Olunan Sertifika / Belgeler (Uzmanlık, Meslek Odası vb.)", { genis: true })
    ) +
    bolum("İş Deneyimi (varsa, son 3 iş yeri)", deneyimSatiri() + deneyimSatiri() + deneyimSatiri(), {
      duzen: "grid3",
    }) +
    bolum("Referanslar", referansSatiri() + referansSatiri(), { duzen: "grid3" }) +
    bolum(
      "Onay",
      onay(
        "Bu formda paylaştığım kişisel verilerin, iş başvurumun değerlendirilmesi ve mülakat süreçlerinin yürütülmesi amacıyla işlenmesini kabul ediyorum.",
        "6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında; başvurunuzun olumsuz sonuçlanması halinde bu formdaki bilgiler değerlendirme süreci sona erdikten sonra imha edilir, olumlu sonuçlanırsa özlük dosyası oluşturulması amacıyla saklanmaya devam eder."
      ),
      { duzen: "tekSutun" }
    ) +
    imzaSatiri();

  return sayfa(govde, true);
}
