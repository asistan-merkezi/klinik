// Her 5 dakikada: (1) zamanlanmış randevu hatırlatmalarını kuyruğa yazar, (2) bekleyen mesajları gönderir (e-posta → Resend, SMS/WhatsApp → merkez).
// Klinik başına hız sınırı ve tur sınırı vardır (lib/mesaj/kuyruk-isle.ts). Gönderim (HTTP) hiçbir DB transaction'ının içinde yapılmaz.
import { bakimOturumuAc } from "@/lib/db/bakim";
import { kuyrukSatirlariniAl, satiriGonder, sonucuKaydet } from "@/lib/mesaj/kuyruk-isle";
import { randevuHatirlatmalariniTara } from "@/lib/mesaj/randevu-hatirlatma-tarama";
import { calistir, gunlukYaz } from "./ortak";

const AD = "mesaj-kuyruk-isle";
/** Bir çalışma bu süreyi aşarsa yeni satır alınmaz; kalanlar sonraki çalışmada işlenir (Task Scheduler çakışan örnekleri başlatmaz). */
const SURE_BUTCESI_MS = 4 * 60_000;

await calistir(AD, async () => {
  const baslangic = Date.now();
  const oturum = bakimOturumuAc();
  try {
    const klinikler = await oturum.klinikler();
    let hatirlatma = 0;
    let gonderildi = 0;
    let basarisiz = 0;
    let hata = 0;
    for (const k of klinikler) {
      if (Date.now() - baslangic > SURE_BUTCESI_MS) {
        gunlukYaz(AD, "uyari", "süre bütçesi doldu, kalan klinikler sonraki çalışmaya kaldı");
        break;
      }
      try {
        // Hatırlatma taraması hata verirse kuyruk işleme engellenmez.
        try {
          const t = await oturum.klinikte(k.id, (tx) => randevuHatirlatmalariniTara(tx, k.id));
          hatirlatma += t.reduce((n, x) => n + x.tarananRandevu, 0);
        } catch (e) {
          hata++;
          gunlukYaz(AD, "hata", "hatırlatma taraması başarısız", { klinikId: k.id, hata: e instanceof Error ? e.message : String(e) });
        }
        const satirlar = await oturum.klinikte(k.id, (tx) => kuyrukSatirlariniAl(tx, k.id));
        for (const satir of satirlar) {
          const sonuc = await satiriGonder(satir);
          const durum = await oturum.klinikte(k.id, (tx) => sonucuKaydet(tx, satir, sonuc));
          if (durum === "gonderildi") gonderildi++;
          else basarisiz++;
        }
      } catch (e) {
        hata++;
        gunlukYaz(AD, "hata", "klinik kuyruğu işlenemedi", { klinikId: k.id, hata: e instanceof Error ? e.message : String(e) });
      }
    }
    // Gönderilemeyen (geçici/kalıcı) mesajlar kuyrukta kendi durumuyla durur; betik başarısı bunlara bağlı DEĞİLDİR.
    return { ozet: { klinik: klinikler.length, hatirlatmaTaranan: hatirlatma, gonderildi, basarisizVeyaErtelenen: basarisiz }, hataSayisi: hata };
  } finally {
    await oturum.kapat();
  }
});
