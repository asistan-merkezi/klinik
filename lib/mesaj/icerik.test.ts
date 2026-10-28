import { describe, expect, it } from "vitest";
import { GENEL_MESAJ_METNI, IZINLI_DEGISKENLER, metniDoldur, sablonuDogrula } from "./icerik";
import { TETIKLEYICILER } from "./tetikleyiciler";
import { TOKEN_KALIBI } from "./baglanti-coz";
import { tokenHashle } from "./baglanti";

describe("mesaj içerik kuralı (docs/kvkk-aktarim.md): yalnız klinik adı + bağlantı", () => {
  it("katalogdaki 28 tetikleyicinin HEPSİ kurala uyar: izinli değişkenler + kişisel veri desenli metin yok", () => {
    expect(TETIKLEYICILER).toHaveLength(28);
    for (const t of TETIKLEYICILER) {
      expect([...t.gecerliDegiskenler].sort(), t.kod).toEqual([...IZINLI_DEGISKENLER].sort());
      expect(t.varsayilanMesajMetni, t.kod).toBe(GENEL_MESAJ_METNI);
      expect(sablonuDogrula(t.varsayilanMesajMetni), t.kod).toEqual({ gecerli: true });
      expect(t.varsayilanMesajMetni, t.kod).not.toMatch(/hasta_adi|tutar|paket|terapist|randevu_tarihi|personel_adi/);
    }
  });

  it("doldurma: klinik adı ve bağlantı yerleşir, başka yer tutucu dokunulmaz", () => {
    expect(metniDoldur(GENEL_MESAJ_METNI, { klinikAdi: "Deneme Klinik", baglanti: "https://x.test/b/abc" })).toBe("Deneme Klinik size bir bildirim gönderdi. Görüntülemek için: https://x.test/b/abc");
  });

  it("kliniğin yazdığı serbest şablon: bilinmeyen değişken ve kimlik/IBAN/kart/telefon/e-posta deseni reddedilir", () => {
    expect(sablonuDogrula("Merhaba {{klinik_adi}}, {{baglanti}}").gecerli).toBe(true);
    expect(sablonuDogrula("Sayın {{hasta_adi}}")).toMatchObject({ gecerli: false, neden: "bilinmeyen_degisken", ayrinti: ["hasta_adi"] });
    for (const kotu of ["TC 12345678901", "IBAN TR330006100519786457841326", "kart 4111 1111 1111 1111", "ara 0532 111 22 33", "yaz a.b@firma.com"]) {
      expect(sablonuDogrula(`${kotu} {{baglanti}}`), kotu).toMatchObject({ gecerli: false, neden: "kisisel_veri_deseni" });
    }
  });

  it("bağlantı jetonu: sha256 hex özeti 64 karakter; üretilen jeton biçimi çözümleyicinin kalıbına uyar", () => {
    expect(tokenHashle("x")).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHashle("a")).not.toBe(tokenHashle("b"));
    expect("A".repeat(32)).toMatch(TOKEN_KALIBI);
    expect("../etc/passwd".padEnd(40, "a")).not.toMatch(TOKEN_KALIBI);
    expect("kisa").not.toMatch(TOKEN_KALIBI);
  });
});
