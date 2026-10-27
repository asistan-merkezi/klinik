// Kodda doğrudan yetkisi olmayan tablolar: yazan yolları listeler, gerçek yazma testlerini çalıştırır, docs/yetki-matrisi.md'ye ekler.
import fs from "node:fs";
import path from "node:path";
import { KOK } from "./kume.mjs";
import { yetkisizTablolar, yazanlariBul, yazmaTestleri } from "../../db/kontrol/yetkisiz-tablo-yazanlar.mjs";

export async function yetkisizRaporu(duzenek) {
  const sup = await duzenek.baglanSuper();
  const tablolar = await yetkisizTablolar(sup);
  const yazanlar = await yazanlariBul(sup, tablolar);
  await sup.end();
  const sonuc = await yazmaTestleri(duzenek);

  const boru = (m) => String(m).split("|").join("/");
  let ek = "\n## Kodda doğrudan yetkisi olmayan tablolar (" + tablolar.length + ") ve onlara yazan yollar\n\n";
  ek += "`klinik_uygulama`nın bu tablolarda hiçbir tablo/kolon yetkisi yok: kodda doğrudan sorgulanmıyorlar. Yazma yalnız aşağıdaki SECURITY DEFINER fonksiyonlar/tetikleyicilerle olur (gövde taraması: `db/kontrol/yetkisiz-tablo-yazanlar.mjs`). ";
  ek += "`odeme` ve `odeme_kalemi` politika bağımlılığı nedeniyle (`islem_tanimi_select_portal`) yalnız SELECT yetkisi alır; yazma yolları RPC'dir. İlk sürümde bu bağımlılık gözden kaçmış, gerçek yazma testi `permission denied for table odeme` ile yakalamıştır.\n\n";
  ek += "| Tablo | Yazan fonksiyon/RPC | Tabloya bağlı tetikleyiciler |\n|---|---|---|\n";
  for (const t of tablolar) {
    const y = yazanlar[t].yazanlar.map((x) => "`" + x.imza + "` (" + x.tur + (x.definer ? ", DEFINER" : "") + ")").join("<br>") || "— (yazan yok: kullanılmayan/gelecek özellik)";
    const tr = yazanlar[t].ustuneTetikleyiciler.map((x) => "`" + x + "`").join(", ") || "—";
    ek += "| " + t + " | " + y + " | " + tr + " |\n";
  }
  ek += "\n**Gerçek yazma testleri** (`scripts/dev/kontrol-calistir.mjs`, `tests/db/anonim-ve-yazma.test.ts`):\n\n| Test | Tablo | Sonuç |\n|---|---|---|\n";
  for (const x of sonuc) ek += "| " + x.ad + " | " + x.tablo + " | " + x.durum + " — " + boru(x.ayrinti) + " |\n";
  ek += "\nNot: klinik oluşturma uygulama özelliği değildir (kodda klinik INSERT yok); sağlama işlemi `klinik_sahip` + `app.tenant_id` ile yapılır. Yazan fonksiyonu olmayan tablolar (egzersiz, checklist, vardiya, hasta_anket, randevu_on_form, islem_kategori) henüz kullanılmayan özelliklerdir; kullanıma alınırken yetkileri kodla birlikte eklenir (`scripts/dev/kullanim-tara.mjs` otomatik yakalar).\n";
  fs.appendFileSync(path.join(KOK, "docs/yetki-matrisi.md"), ek, "utf8");
  return { sonuc, basarisiz: sonuc.some((x) => x.durum === "BAŞARISIZ") };
}
