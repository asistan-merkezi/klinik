import { describe, expect, it } from "vitest";
import { denetimHastaId, denetimOzetiOlustur } from "./gorunum";

describe("denetimOzetiOlustur", () => {
  it("v2 finans UPDATE: değişen alanları eski → yeni gösterir, tutarı para olarak biçimler", () => {
    const ozet = denetimOzetiOlustur({
      eylem: "update",
      hedef_tablo: "hasta_bakiye_hareket",
      detay: {
        surum: 2,
        degisen_alanlar: ["iskonto_tutari", "updated_at"],
        eski: { iskonto_tutari: 0 },
        yeni: { iskonto_tutari: 50 },
      },
    });
    expect(ozet.degerGizli).toBe(false);
    expect(ozet.satirlar).toHaveLength(1);
    expect(ozet.satirlar[0].alan).toBe("iskonto_tutari");
    expect(ozet.satirlar[0].eski).toContain("0,00");
    expect(ozet.satirlar[0].yeni).toContain("50,00");
  });

  it("v2 finans INSERT: teknik ve *_id alanlarını ve boşları listelemez", () => {
    const ozet = denetimOzetiOlustur({
      eylem: "insert",
      hedef_tablo: "hasta_bakiye_hareket",
      detay: {
        surum: 2,
        yeni: {
          id: "x",
          klinik_id: "k",
          hasta_id: "h",
          tur: "odeme",
          tutar: 1000,
          odeme_yontemi: "nakit",
          aciklama: null,
          created_at: "2026-09-30",
        },
      },
    });
    const alanlar = ozet.satirlar.map((s) => s.alan);
    expect(alanlar).toEqual(["tur", "tutar", "odeme_yontemi"]);
    expect(ozet.satirlar.find((s) => s.alan === "odeme_yontemi")?.yeni).toBe("Nakit");
  });

  it("gürültüyü ve ham değerleri temizler: kaynak gizli, 0 iskonto gizli, tur okunur", () => {
    const ozet = denetimOzetiOlustur({
      eylem: "insert",
      hedef_tablo: "hasta_bakiye_hareket",
      detay: {
        surum: 2,
        yeni: { tur: "iade", tutar: 300, kaynak: "uygulama", iskonto_tutari: 0, odeme_yontemi: "nakit" },
      },
    });
    expect(ozet.satirlar.map((s) => s.alan)).toEqual(["tur", "tutar", "odeme_yontemi"]);
    expect(ozet.satirlar[0].yeni).toBe("İade");
  });

  it("sıfırdan farklı iskonto gösterilir", () => {
    const ozet = denetimOzetiOlustur({
      eylem: "insert",
      hedef_tablo: "hasta_bakiye_hareket",
      detay: { surum: 2, yeni: { tur: "borc", tutar: 500, iskonto_tutari: 50 } },
    });
    expect(ozet.satirlar.map((s) => s.alan)).toContain("iskonto_tutari");
  });

  it("HASSAS tablo: değer asla dönmez, yalnız değişen alan adları", () => {
    const ozet = denetimOzetiOlustur({
      eylem: "update",
      hedef_tablo: "hasta_hassas",
      detay: {
        surum: 2,
        degisen_alanlar: ["kimlik_no", "updated_at"],
        // Tetikleyici 'sadece_alan_adi' ile bunları hiç yazmaz; yazılmış olsa bile gösterilmemeli
        eski: { kimlik_no: "11111111111" },
        yeni: { kimlik_no: "22222222222" },
      },
    });
    expect(ozet.degerGizli).toBe(true);
    expect(ozet.satirlar).toEqual([]);
    expect(ozet.degisenAlanlar).toEqual(["kimlik_no"]);
    expect(JSON.stringify(ozet)).not.toContain("1111");
  });

  it("v1 (eski) anamnez satırı: hiçbir içerik göstermez", () => {
    const ozet = denetimOzetiOlustur({
      eylem: "insert",
      hedef_tablo: "hasta_anamnez",
      detay: { id: "a", hasta_id: "h", sikayet: "bel ağrısı", ilac: "x" },
    });
    expect(ozet.degerGizli).toBe(true);
    expect(ozet.satirlar).toEqual([]);
    expect(JSON.stringify(ozet)).not.toContain("bel ağrısı");
  });

  it("v1 izinli tabloda UPDATE: neyin değiştiği bilinmediği için değer listelemez", () => {
    const ozet = denetimOzetiOlustur({
      eylem: "update",
      hedef_tablo: "personel_hesap_hareket",
      detay: { id: "a", personel_id: "p", tutar: 500 },
    });
    expect(ozet.eskiSurum).toBe(true);
    expect(ozet.satirlar).toEqual([]);
  });

  it("select (belge görüntüleme) hassas tabloda bile gizli uyarısı vermez", () => {
    const ozet = denetimOzetiOlustur({ eylem: "select", hedef_tablo: "hasta_belge", detay: {} });
    expect(ozet.degerGizli).toBe(false);
    expect(ozet.satirlar).toEqual([]);
  });

  it("bozuk/boş detayda patlamaz", () => {
    expect(() => denetimOzetiOlustur({ eylem: "update", hedef_tablo: "fatura", detay: null })).not.toThrow();
    expect(() => denetimOzetiOlustur({ eylem: "insert", hedef_tablo: null, detay: "metin" })).not.toThrow();
  });
});

describe("denetimHastaId", () => {
  it("v2 bağlam alanı önceliklidir", () => {
    expect(denetimHastaId({ hedef_tablo: "hasta_bakiye_hareket", hedef_id: "h1", detay: { hasta_id: "h2" } })).toBe("h2");
  });
  it("hasta / hasta_hassas için hedefin kendisi", () => {
    expect(denetimHastaId({ hedef_tablo: "hasta", hedef_id: "h1", detay: {} })).toBe("h1");
    expect(denetimHastaId({ hedef_tablo: "hasta_hassas", hedef_id: "h1", detay: {} })).toBe("h1");
  });
  it("hastayla ilgisiz kayıtta null", () => {
    expect(denetimHastaId({ hedef_tablo: "klinik_harcama", hedef_id: "g1", detay: {} })).toBeNull();
  });
});

describe("hassas alan maskeleme (maaş, T.C. kimlik, IBAN, sağlık notu)", () => {
  it("değer gösterilen tabloda bile hassas ALAN adlarının değeri düz metin çıkmaz", () => {
    const ozet = denetimOzetiOlustur({
      eylem: "update",
      hedef_tablo: "hasta",
      detay: { surum: 2, degisen_alanlar: ["tc_kimlik_no", "maas", "iban", "agri_oykusu", "telefon"], eski: { tc_kimlik_no: "12345678901", maas: 30000, iban: "TR330006100519786457841326", agri_oykusu: "bel fıtığı", telefon: "5321112233" }, yeni: { tc_kimlik_no: "10987654321", maas: 35000, iban: "TR000000000000000000000001", agri_oykusu: "diz ağrısı", telefon: "5329998877" } },
    });
    const cikti = JSON.stringify(ozet);
    for (const ham of ["12345678901", "10987654321", "30000", "35000", "TR3300", "bel fıtığı", "diz ağrısı"]) expect(cikti).not.toContain(ham);
    expect(cikti).toContain("5321112233"); // masum alan (telefon) olduğu gibi
    expect(ozet.satirlar.filter((s) => s.yeni === "••• gizli")).toHaveLength(4);
  });

  it("masum alan adında geçen T.C./IBAN/kart DESENİ serbest metinde maskelenir", () => {
    const ozet = denetimOzetiOlustur({
      eylem: "insert",
      hedef_tablo: "hasta_bakiye_hareket",
      detay: { surum: 2, yeni: { aciklama: "havale TR33 0006 1005 1978 6457 8413 26 hasta TC 12345678901 kart 4111 1111 1111 1111", tutar: 10 } },
    });
    const cikti = JSON.stringify(ozet);
    for (const ham of ["TR33 0006", "12345678901", "4111"]) expect(cikti).not.toContain(ham);
    expect(cikti).toContain("[IBAN gizli]");
    expect(cikti).toContain("[T.C. gizli]");
    expect(cikti).toContain("[kart gizli]");
  });

  it("destek erişimi kaydı: gerekçe klinik yöneticisine gösterilir", () => {
    const ozet = denetimOzetiOlustur({ eylem: "destek_baglami_ac", hedef_tablo: "klinik", detay: { surum: 2, gerekce: "Randevu çizelgesi hatası incelemesi", dakika: 30, bitis: "2026-11-01T10:00:00Z" } });
    expect(ozet.satirlar.find((s) => s.alan === "gerekce")?.yeni).toBe("Randevu çizelgesi hatası incelemesi");
    expect(ozet.satirlar.find((s) => s.alan === "dakika")?.yeni).toBe("30 dk");
  });
});
