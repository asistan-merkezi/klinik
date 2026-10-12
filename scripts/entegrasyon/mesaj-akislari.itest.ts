/**
 * Mesajlaşma tetikleyicilerinin uçtan uca (gerçek DB) doğrulaması — `ENTEGRASYON_ONAY=1 npm run test:entegrasyon`.
 * Her senaryo kendi geçici kliniğini kurar ve siler. Gerçek mesaj GÖNDERİLMEZ (yalnız mesaj_kuyrugu'na yazılır).
 */
import { afterEach, describe, expect, it } from "vitest";
import { formatInTimeZone } from "date-fns-tz";
import { beklenen, geciciKlinikKur, type GeciciKlinik } from "./yardimci";

const SAAT = 3_600_000;
let aktif: GeciciKlinik | null = null;

afterEach(async () => {
  await aktif?.temizle();
  aktif = null;
});

describe("randevu mesajları", () => {
  it("hatırlatmalar yalnız doğru pencerede ve yeterince önceden alınmış randevuya gider; tekrar taramada mükerrer olmaz", async () => {
    aktif = await geciciKlinikKur({ kurallar: ["randevu_hatirlatma_1gun", "randevu_hatirlatma_2saat"], hastaWhatsappIzni: false });
    const k = aktif;
    const { randevuHatirlatmalariniTara } = await import("@/lib/mesaj/randevu-mesaji");
    const simdi = Date.now();

    await k.randevuEkle(simdi + 23.5 * SAAT, simdi - 2 * 24 * SAAT); // 1 gün hatırlatması alır
    await k.randevuEkle(simdi + 1.5 * SAAT, simdi - 24 * SAAT); // 2 saat hatırlatması alır
    await k.randevuEkle(simdi + 4.2 * SAAT, simdi); // pencerede değil
    await k.randevuEkle(simdi + 1.4 * SAAT + 30 * SAAT, simdi - SAAT); // pencerede değil

    await randevuHatirlatmalariniTara(k.sb);
    await randevuHatirlatmalariniTara(k.sb); // ikinci tarama mükerrer üretmemeli

    const satirlar = await k.kuyruk();
    expect(satirlar.map((s) => s.tetikleyici_kodu).sort()).toEqual(["randevu_hatirlatma_1gun", "randevu_hatirlatma_2saat"]);
    expect(satirlar.every((s) => s.kanal === "sms")).toBe(true); // whatsapp izni yok
  });

  it("2 saatten az kala alınan randevuya '2 saat kaldı' gitmez", async () => {
    aktif = await geciciKlinikKur({ kurallar: ["randevu_hatirlatma_2saat"] });
    const simdi = Date.now();
    await aktif.randevuEkle(simdi + 1.5 * SAAT, simdi - 10 * 60_000);
    const { randevuHatirlatmalariniTara } = await import("@/lib/mesaj/randevu-mesaji");
    await randevuHatirlatmalariniTara(aktif.sb);
    expect(await aktif.kuyruk()).toHaveLength(0);
  });

  it("onay/gelmedi randevu başına tek; iptal ve erteleme ayrı mesaj; doldurulmamış değişken kalmaz", async () => {
    aktif = await geciciKlinikKur({ kurallar: ["randevu_onay", "randevu_iptal", "randevu_gelmedi"] });
    const k = aktif;
    const { randevuOlayMesajiTetikle } = await import("@/lib/mesaj/randevu-mesaji");
    const simdi = Date.now();
    const a = await k.randevuEkle(simdi + 30 * SAAT);
    const b = await k.randevuEkle(simdi + 40 * SAAT);
    const c = await k.randevuEkle(simdi + 50 * SAAT);

    await randevuOlayMesajiTetikle(a.id, "randevu_onay");
    await randevuOlayMesajiTetikle(a.id, "randevu_onay");
    await randevuOlayMesajiTetikle(a.id, "randevu_gelmedi");
    await randevuOlayMesajiTetikle(a.id, "randevu_gelmedi");

    await k.sb.from("randevu").update({ durum: "iptal", iptal_tarihi: new Date().toISOString() }).eq("id", b.id);
    await randevuOlayMesajiTetikle(b.id, "randevu_iptal");

    const eski = new Date(simdi + 50 * SAAT).toISOString();
    await k.sb.from("randevu").update({ durum: "ertelendi", baslangic: new Date(simdi + 52 * SAAT).toISOString(), bitis: new Date(simdi + 52.5 * SAAT).toISOString() }).eq("id", c.id);
    await randevuOlayMesajiTetikle(c.id, "randevu_iptal", { eskiBaslangic: eski });

    const sayim = (kod: string) => k.kuyruk(kod).then((x) => x.length);
    expect(await sayim("randevu_onay")).toBe(1);
    expect(await sayim("randevu_gelmedi")).toBe(1);
    expect(await sayim("randevu_iptal")).toBe(2);
    const hepsi = await k.kuyruk();
    expect(hepsi.some((s) => s.gonderilecek_metin.includes("{{"))).toBe(false);
    expect(hepsi.some((s) => s.gonderilecek_metin.includes("ertelendi"))).toBe(true);
  });
});

describe("hasta mesajları", () => {
  it("hoş geldin ve ödeme alındı: tek mesaj, izinli hastaya sms+whatsapp, tutar biçimli", async () => {
    aktif = await geciciKlinikKur({ kurallar: ["hasta_kayit_hosgeldin", "muhasebe_odeme_alindi"], whatsappAcik: true, hastaWhatsappIzni: true });
    const k = aktif;
    const { hastaHosgeldinTetikle, odemeAlindiMesajiTetikle } = await import("@/lib/mesaj/hasta-mesaji");

    await hastaHosgeldinTetikle(k.hasta.id);
    await hastaHosgeldinTetikle(k.hasta.id);
    await odemeAlindiMesajiTetikle(k.hasta.id, 750.5, { hareketId: "11111111-1111-1111-1111-111111111111" });
    await odemeAlindiMesajiTetikle(k.hasta.id, 750.5, { hareketId: "11111111-1111-1111-1111-111111111111" });
    await odemeAlindiMesajiTetikle(k.hasta.id, 100, { randevuId: "22222222-2222-2222-2222-222222222222" });

    expect(await k.kuyruk("hasta_kayit_hosgeldin")).toHaveLength(2); // sms + whatsapp
    const odeme = await k.kuyruk("muhasebe_odeme_alindi");
    expect(odeme).toHaveLength(4); // iki ayrı ödeme × iki kanal
    expect(odeme.some((s) => s.gonderilecek_metin.includes("750,50"))).toBe(true);
  });

  it("paket satış özeti: taze satış tek mesaj, eski satış mesaj üretmez", async () => {
    aktif = await geciciKlinikKur({ kurallar: ["hasta_paket_satis_ozet"] });
    const k = aktif;
    const { paketSatisOzetiMesajiTetikle } = await import("@/lib/mesaj/hasta-mesaji");
    const paket = beklenen(
      await k.sb.from("paket").insert({ klinik_id: k.klinik.id, islem_tanimi_id: k.islem.id, ad: "10'lu Paket", seans_sayisi: 10, fiyat: 3000 }).select().single(),
      "paket"
    );
    beklenen(
      await k.sb.from("paket_satis").insert({ klinik_id: k.klinik.id, hasta_id: k.hasta.id, paket_id: paket.id, kalan_adet: 4, created_at: new Date(Date.now() - 3 * 24 * SAAT).toISOString() }),
      "eski satış"
    );
    await paketSatisOzetiMesajiTetikle(k.hasta.id, [paket.id]);
    expect(await k.kuyruk()).toHaveLength(0);

    beklenen(await k.sb.from("paket_satis").insert({ klinik_id: k.klinik.id, hasta_id: k.hasta.id, paket_id: paket.id, kalan_adet: 10 }), "taze satış");
    await paketSatisOzetiMesajiTetikle(k.hasta.id, [paket.id, paket.id]);
    await paketSatisOzetiMesajiTetikle(k.hasta.id, [paket.id]);
    const satirlar = await k.kuyruk();
    expect(satirlar).toHaveLength(1);
    expect(satirlar[0].gonderilecek_metin).toBe("Merhaba Ayşe Entegrasyon, 10'lu Paket paketiniz tanımlandı (10 seans).");
  });
});

describe("sessiz saat", () => {
  it("sessiz aralıkta ertelenir, iptal muaftır, ertelenen zaman sınırı aşarsa mesaj atlanır", async () => {
    aktif = await geciciKlinikKur({ kurallar: ["hasta_kayit_hosgeldin", "randevu_iptal", "randevu_onay", "randevu_gelmedi"] });
    const k = aktif;
    const { anlikMesajTetikle } = await import("@/lib/mesaj/anlik-tetikle");

    // "Şu an"ı kapsayan sessiz aralık: [saat-1, saat+2) İstanbul
    const saat = Number(formatInTimeZone(new Date(), "Europe/Istanbul", "H"));
    const hhmm = (n: number) => `${String((n + 24) % 24).padStart(2, "0")}:00`;
    beklenen(
      await k.sb.from("klinik_ayarlar").upsert({ klinik_id: k.klinik.id, ayarlar: { mesaj_sessiz_saat: { baslangic: hhmm(saat - 1), bitis: hhmm(saat + 2) } } }, { onConflict: "klinik_id" }),
      "sessiz saat ayarı"
    );

    const ortak = {
      klinikId: k.klinik.id,
      aliciTipi: "hasta" as const,
      aliciId: k.hasta.id,
      adres: { telefon: "05551234567", eposta: null, whatsappIzni: false },
      degiskenler: { hasta_adi: "T", klinik_adi: "K", randevu_tarihi: "x", randevu_durumu: "iptal edildi" },
    };
    await anlikMesajTetikle(k.sb, { ...ortak, tetikleyiciKodu: "hasta_kayit_hosgeldin", idempotencyTemeli: "e:1" });
    await anlikMesajTetikle(k.sb, { ...ortak, tetikleyiciKodu: "randevu_iptal", idempotencyTemeli: "e:2" });
    await anlikMesajTetikle(k.sb, { ...ortak, tetikleyiciKodu: "randevu_onay", idempotencyTemeli: "e:3", enGecGonderimZamani: new Date(Date.now() + 10 * 60_000) });
    await anlikMesajTetikle(k.sb, { ...ortak, tetikleyiciKodu: "randevu_gelmedi", idempotencyTemeli: "e:4", enGecGonderimZamani: new Date(Date.now() + 6 * SAAT) });

    const hosgeldin = await k.kuyruk("hasta_kayit_hosgeldin");
    expect(hosgeldin).toHaveLength(1);
    expect(new Date(hosgeldin[0].planlanan_zaman).getTime()).toBeGreaterThan(Date.now() + SAAT); // ertelendi
    const iptal = await k.kuyruk("randevu_iptal");
    expect(new Date(iptal[0].planlanan_zaman).getTime()).toBeLessThan(Date.now() + 60_000); // muaf: hemen
    expect(await k.kuyruk("randevu_onay")).toHaveLength(0); // ertelenen zaman sınırı aşıyor → atlandı
    expect(await k.kuyruk("randevu_gelmedi")).toHaveLength(1); // sınır yeterince geç → ertelenerek yazıldı
  });
});
