// Modül 2 — randevu eylemleri (app/(app)/panel/randevular/actions.ts) GERÇEK eylem kodu + gerçek Postgres (RLS, RPC'ler, tetikleyiciler).
// Yalnız oturum çözümü taklit edilir (tests/db/oturum-mock.ts). Kapsam: gerçek yazma yolu ("permission denied" yok), başka tenant'ın kimlikleriyle
// yazılamaması, rol bazlı red, durum makinesi, izinli terapist, periyodik seri.
import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { ortamKur, personelKur, superBaglan, tenantdaCalistir } from "./yardimci";
import { oturumAc, oturumKapat, sonrasiniBekle } from "./oturum-durumu";
import {
  iptalTalebiOnayla,
  iptalTalebiReddet,
  periyodikRandevuIptalEt,
  periyodikRandevuOlustur,
  randevuDurumGuncelle,
  randevuErtele,
  randevuGelisIsaretle,
  randevuGuncelle,
  randevuIptalEt,
  randevuIptalGeriAl,
  randevuOlustur,
  randevuSeansiTamamla,
  randevuTalebiReddet,
} from "@/app/(app)/panel/randevular/actions";
import { YETKISIZ_MESAJI } from "@/lib/auth/yetki";

let K1: Record<string, string>;
let K2: Record<string, string>;
let admin1: string, resepsiyon1: string, terapist1: string, muhasebe1: string, admin2: string, resepsiyon2: string;
let gun = 0;

beforeAll(async () => {
  const { ids } = ortamKur();
  K1 = ids.k1;
  K2 = ids.k2;
  admin1 = (await personelKur({ klinikId: K1.klinik, rol: "klinik_admin" })).id;
  resepsiyon1 = (await personelKur({ klinikId: K1.klinik, rol: "resepsiyon" })).id;
  terapist1 = (await personelKur({ klinikId: K1.klinik, rol: "terapist" })).id;
  muhasebe1 = (await personelKur({ klinikId: K1.klinik, rol: "muhasebe" })).id;
  admin2 = (await personelKur({ klinikId: K2.klinik, rol: "klinik_admin" })).id;
  resepsiyon2 = (await personelKur({ klinikId: K2.klinik, rol: "resepsiyon" })).id;
});

const as = (userId: string, klinikId: string, rol: "klinik_admin" | "resepsiyon" | "terapist" | "muhasebe") => oturumAc({ userId, klinikId, rol });
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
/** Her çağrıda ayrı, gelecekte bir gün (çakışma kısıtına takılmamak için). */
const yeniTarih = () => {
  const d = new Date(Date.UTC(2031, 0, 1 + ++gun));
  return d.toISOString().slice(0, 10);
};
const form = (k: Record<string, string>, tarih: string, saat = "10:00", ekstra: Record<string, string> = {}) =>
  fd({ hasta_id: k.hasta, terapist_id: k.terapist, oda_id: k.oda, islem_tanimi_id: k.islem, tarih, saat, sure_dakika: "30", ...ekstra });

async function randevuSatiri(id: string) {
  const sup = await superBaglan();
  try {
    return (await sup.query("select id, klinik_id, durum::text, olusturan_kullanici_id, tamamlayan_kullanici_id, baslangic from randevu where id = $1", [id])).rows[0];
  } finally {
    await sup.end();
  }
}
async function sonRandevu(klinikId: string, tarih: string): Promise<string> {
  const sup = await superBaglan();
  try {
    const r = await sup.query("select id from randevu where klinik_id = $1 and (baslangic at time zone 'Europe/Istanbul')::date = $2::date order by created_at desc limit 1", [klinikId, tarih]);
    return r.rows[0]?.id;
  } finally {
    await sup.end();
  }
}
async function olustur(tarih = yeniTarih(), saat = "10:00") {
  as(resepsiyon1, K1.klinik, "resepsiyon");
  const s = await randevuOlustur(null, form(K1, tarih, saat));
  expect(s?.success, JSON.stringify(s)).toBe(true);
  return sonRandevu(K1.klinik, tarih);
}

describe("randevu oluştur: gerçek yazma yolu, tenant ve rol", () => {
  it("resepsiyon randevu oluşturur (klinik_id oturumdan, olusturan kullanıcı oturumdan)", async () => {
    const tarih = yeniTarih();
    as(resepsiyon1, K1.klinik, "resepsiyon");
    const s = await randevuOlustur(null, form(K1, tarih));
    expect(s).toEqual({ success: true, message: "Randevu oluşturuldu." });
    const r = await randevuSatiri(await sonRandevu(K1.klinik, tarih));
    expect(r).toMatchObject({ klinik_id: K1.klinik, durum: "planlandi", olusturan_kullanici_id: resepsiyon1 });
  });

  it("başka kliniğin hasta/oda/terapist/tedavi kimlikleriyle randevu YAZILAMAZ", async () => {
    as(resepsiyon1, K1.klinik, "resepsiyon");
    for (const [alan, deger, beklenen] of [
      ["hasta_id", K2.hasta, /Hasta bulunamadı/],
      ["oda_id", K2.oda, /Oda bulunamadı/],
      ["terapist_id", K2.terapist, /Terapist bulunamadı/],
      ["islem_tanimi_id", K2.islem, /Tedavi bulunamadı/],
    ] as const) {
      const tarih = yeniTarih();
      const f = form(K1, tarih);
      f.set(alan, deger);
      const s = await randevuOlustur(null, f);
      expect(s?.success, alan).toBe(false);
      expect(s?.message, alan).toMatch(beklenen);
      expect(await sonRandevu(K1.klinik, tarih), alan).toBeUndefined();
    }
  });

  it("muhasebe ve oturumsuz/hasta oturumu randevu oluşturamaz", async () => {
    const tarih = yeniTarih();
    as(muhasebe1, K1.klinik, "muhasebe");
    expect(await randevuOlustur(null, form(K1, tarih))).toEqual({ success: false, message: YETKISIZ_MESAJI });
    oturumAc({ userId: randomUUID(), klinikId: K1.klinik, rol: "hasta", hastaId: K1.hasta });
    expect(await randevuOlustur(null, form(K1, tarih))).toEqual({ success: false, message: YETKISIZ_MESAJI });
    oturumKapat();
    await expect(randevuOlustur(null, form(K1, tarih))).rejects.toThrow(/NEXT_REDIRECT/);
    expect(await sonRandevu(K1.klinik, tarih)).toBeUndefined();
  });

  it("çakışan saat (aynı oda/terapist) reddedilir; geçersiz tarih/saat reddedilir", async () => {
    const tarih = yeniTarih();
    as(resepsiyon1, K1.klinik, "resepsiyon");
    expect((await randevuOlustur(null, form(K1, tarih)))?.success).toBe(true);
    const ikinci = await randevuOlustur(null, form(K1, tarih));
    expect(ikinci).toEqual({ success: false, message: "Seçilen terapist, oda veya cihaz bu saatte dolu." });
    expect((await randevuOlustur(null, form(K1, tarih, "25:99")))?.success).toBe(false);
  });

  it("izinli terapiste randevu yazılamaz (dar uygunluk fonksiyonu, tarih bazlı)", async () => {
    const tarih = yeniTarih();
    const sup = await superBaglan();
    try {
      await sup.query("BEGIN");
      await sup.query("select set_config('app.tenant_id', $1, true)", [K1.klinik]);
      await sup.query("insert into personel_izin_talebi(klinik_id, personel_id, tip, baslangic_tarih, bitis_tarih, gun_sayisi, durum) values ($1, $2, 'yillik', $3, $3, 1, 'onaylandi')", [K1.klinik, K1.personel, tarih]);
      await sup.query("COMMIT");
    } finally {
      await sup.end();
    }
    as(resepsiyon1, K1.klinik, "resepsiyon");
    const s = await randevuOlustur(null, form(K1, tarih));
    expect(s).toEqual({ success: false, message: "Seçilen terapist bu tarihte izinli/raporlu, randevu atanamaz." });
    expect((await randevuOlustur(null, form(K1, yeniTarih())))?.success).toBe(true); // izinsiz gün serbest
  });
});

describe("randevu güncelle / durum geçişleri / iptal", () => {
  it("başka kliniğin kullanıcısı K1 randevusunu güncelleyemez/erteleyemez/iptal edemez; K1 verisi değişmez", async () => {
    const id = await olustur();
    as(resepsiyon2, K2.klinik, "resepsiyon");
    const tarih = yeniTarih();
    expect(await randevuGuncelle(id, null, form(K2, tarih))).toEqual({ success: false, message: "Randevu bulunamadı." });
    expect(await randevuErtele(id, fd({ tarih, saat: "11:00" }))).toEqual({ success: false, message: "Randevu bulunamadı." });
    expect((await randevuIptalEt(id, "x", false))?.success).toBe(false);
    expect((await randevuGelisIsaretle(id, null))?.success).toBe(false);
    expect((await randevuSeansiTamamla(id, "not"))?.success).toBe(false);
    expect((await randevuRow(id)).durum).toBe("planlandi");
  });

  it("geliş → seans tamamla → tekrar tamamlama ve kapalı randevuda işlemler reddedilir; tamamlayan oturumdaki kullanıcı", async () => {
    const id = await olustur();
    as(resepsiyon1, K1.klinik, "resepsiyon");
    expect((await randevuGelisIsaretle(id, null))?.success).toBe(true);
    expect((await randevuRow(id)).durum).toBe("geldi");
    as(terapist1, K1.klinik, "terapist");
    // terapist1 bu randevunun terapisti DEĞİL: RLS kendi-randevu kuralı → tamamlama reddedilir
    const red = await randevuSeansiTamamla(id, "Seans notu");
    expect(red?.success).toBe(false);
    as(admin1, K1.klinik, "klinik_admin");
    const tamam = await randevuSeansiTamamla(id, "Seans notu");
    expect(tamam?.success, JSON.stringify(tamam)).toBe(true);
    const r = await randevuRow(id);
    expect(r).toMatchObject({ durum: "tamamlandi", tamamlayan_kullanici_id: admin1 });
    expect(await randevuSeansiTamamla(id, "tekrar")).toEqual({ success: false, message: "Bu seans zaten tamamlanmış." });
    expect((await randevuGelisIsaretle(id, null))?.message).toMatch(/değiştirilemez|iptal edilmiş ya da tamamlanmış/);
    expect((await randevuIptalEt(id, "x", false))?.success).toBe(false); // tamamlanmış seans iptal edilemez
    expect((await randevuDurumGuncelle(id, "gelmedi"))?.success).toBe(false);
  });

  it("gelmedi, bedelsiz iptal, iptal geri alma (yalnız klinik_admin), terapist bedelli iptal edemez", async () => {
    const id = await olustur();
    as(resepsiyon1, K1.klinik, "resepsiyon");
    expect((await randevuDurumGuncelle(id, "gelmedi"))?.success).toBe(true);
    expect((await randevuRow(id)).durum).toBe("gelmedi");

    const id2 = await olustur();
    as(terapist1, K1.klinik, "terapist");
    const bedelli = await randevuIptalEt(id2, "bedelli", true);
    expect(bedelli?.success).toBe(false); // yetki RPC'de (bedelli iptal yalnız yönetici/resepsiyon)
    as(resepsiyon1, K1.klinik, "resepsiyon");
    expect((await randevuIptalEt(id2, "hasta aradı", false))?.success).toBe(true);
    expect((await randevuRow(id2)).durum).toBe("iptal");
    expect((await randevuIptalGeriAl(id2))?.success).toBe(false); // resepsiyon geri alamaz
    as(admin1, K1.klinik, "klinik_admin");
    expect((await randevuIptalGeriAl(id2))?.success).toBe(true);
    expect((await randevuRow(id2)).durum).not.toBe("iptal");
  });

  it("ertele: aynı randevu yeni saate taşınır ve 'ertelendi' olur; çakışmada reddedilir", async () => {
    const id = await olustur();
    as(resepsiyon1, K1.klinik, "resepsiyon");
    const yeni = yeniTarih();
    const s = await randevuErtele(id, fd({ tarih: yeni, saat: "14:00" }));
    expect(s?.success, JSON.stringify(s)).toBe(true);
    expect((await randevuRow(id)).durum).toBe("ertelendi");
    // başka bir randevu aynı saate → çakışma
    const tarih2 = yeniTarih();
    const id2 = await olustur(tarih2, "14:00");
    const cakisma = await randevuErtele(id2, fd({ tarih: yeni, saat: "14:00" }));
    expect(cakisma).toEqual({ success: false, message: "Seçilen yeni saatte terapist, oda veya cihaz dolu." });
  });

  it("randevuGuncelle: resepsiyon günceller; kapalı (iptal) randevu güncellenemez", async () => {
    const id = await olustur();
    as(resepsiyon1, K1.klinik, "resepsiyon");
    const yeni = yeniTarih();
    expect((await randevuGuncelle(id, null, form(K1, yeni, "11:30")))?.success).toBe(true);
    await randevuIptalEt(id, "iptal", false);
    expect((await randevuGuncelle(id, null, form(K1, yeniTarih())))?.message).toMatch(/iptal edilmiş ya da tamamlanmış/);
  });
});

describe("talepler (iptal / randevu) rol ve tenant", () => {
  it("iptal talebi onay/red yalnız klinik_admin+resepsiyon; terapist/muhasebe/başka klinik reddedilir; onayda randevu iptal olur", async () => {
    const id = await olustur();
    const talepId = randomUUID();
    await tenantdaCalistir(K1.klinik, (c) => c.query("insert into randevu_iptal_talebi(id, klinik_id, randevu_id, hasta_id, aciklama) values ($1, $2, $3, $4, 'portal')", [talepId, K1.klinik, id, K1.hasta]));

    as(terapist1, K1.klinik, "terapist");
    expect(await iptalTalebiOnayla(talepId, id, false)).toEqual({ success: false, message: YETKISIZ_MESAJI });
    expect(await iptalTalebiReddet(talepId)).toEqual({ success: false, message: YETKISIZ_MESAJI });
    as(admin2, K2.klinik, "klinik_admin");
    expect((await iptalTalebiOnayla(talepId, id, false))?.success).toBe(false); // başka klinik: talep görünmez
    expect((await iptalTalebiReddet(talepId))?.success).toBe(false);
    as(resepsiyon1, K1.klinik, "resepsiyon");
    // yanlış randevu ile eşleştirme reddedilir
    expect((await iptalTalebiOnayla(talepId, randomUUID(), false))?.message).toBe("İptal talebi bulunamadı.");
    expect((await iptalTalebiOnayla(talepId, id, false))?.success).toBe(true);
    expect((await randevuRow(id)).durum).toBe("iptal");
    expect((await iptalTalebiOnayla(talepId, id, false))?.message).toMatch(/zaten yanıtlanmış/);
  });

  it("randevu talebi reddi: yönetim rolleri; başka klinik talebi göremez", async () => {
    const talepId = randomUUID();
    await tenantdaCalistir(K1.klinik, (c) => c.query("insert into randevu_talebi(id, klinik_id, hasta_id, islem_tanimi_id, tercih_tarih) values ($1, $2, $3, $4, current_date + 3)", [talepId, K1.klinik, K1.hasta, K1.islem]));
    as(muhasebe1, K1.klinik, "muhasebe");
    expect(await randevuTalebiReddet(talepId)).toEqual({ success: false, message: YETKISIZ_MESAJI });
    as(resepsiyon2, K2.klinik, "resepsiyon");
    expect((await randevuTalebiReddet(talepId))?.success).toBe(false);
    as(resepsiyon1, K1.klinik, "resepsiyon");
    expect((await randevuTalebiReddet(talepId))?.success).toBe(true);
  });
});

describe("periyodik randevu", () => {
  it("seri oluşur (en az bir somut randevu), çakışan günler raporlanır, iptali yalnız yönetim yapar", async () => {
    as(resepsiyon1, K1.klinik, "resepsiyon");
    const f = fd({
      hasta_id: K1.hasta,
      terapist_id: K1.terapist,
      oda_id: K1.oda,
      islem_tanimi_id: K1.islem,
      sure_dakika: "30",
      gunler_json: JSON.stringify([{ gun: 2, saat: "17:00" }]),
    });
    const s = await periyodikRandevuOlustur(null, f);
    expect(s?.success, JSON.stringify(s)).toBe(true);
    expect(s?.message).toMatch(/randevu eklendi/);
    const sup = await superBaglan();
    let periyodikId: string;
    try {
      const r = await sup.query("select p.id, (select count(*)::int from randevu r where r.periyodik_randevu_id = p.id) adet from periyodik_randevu p where p.klinik_id = $1 order by p.created_at desc limit 1", [K1.klinik]);
      periyodikId = r.rows[0].id;
      expect(r.rows[0].adet).toBeGreaterThan(5);
    } finally {
      await sup.end();
    }
    // ikinci seri aynı gün/saat → satırlar çakışır; yine de seri kaydı oluşur ve çakışmalar WhatsApp bağlantısıyla raporlanır
    const ikinci = await periyodikRandevuOlustur(null, f);
    expect(ikinci?.success).toBe(true);
    expect(ikinci?.cakismalar?.length).toBeGreaterThan(0);

    as(terapist1, K1.klinik, "terapist");
    expect(await periyodikRandevuIptalEt(periyodikId, K1.hasta)).toEqual({ success: false, message: YETKISIZ_MESAJI });
    as(resepsiyon2, K2.klinik, "resepsiyon");
    expect((await periyodikRandevuIptalEt(periyodikId, K1.hasta))?.success).toBe(false);
    as(resepsiyon1, K1.klinik, "resepsiyon");
    expect((await periyodikRandevuIptalEt(periyodikId, K1.hasta))?.success).toBe(true);
    await sonrasiniBekle();
  });
});

async function randevuRow(id: string) {
  return randevuSatiri(id);
}
