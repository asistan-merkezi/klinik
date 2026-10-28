// Modül 5 — personel / izin / puantaj / dönem kapatma / QR puantaj: gerçek eylem kodu + gerçek Postgres (FORCE RLS) + gerçek kimlik havuzu.
import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { sql as drizzleSql } from "drizzle-orm";
import { ortamKur, personelKur, hastaKur, superBaglan, tenantBaglami, tenantdaCalistir, reddedilmeli } from "./yardimci";
import { oturumAc } from "./oturum-durumu";
import { rpc, sema, withTenant } from "@/lib/db";
import { YETKISIZ_MESAJI } from "@/lib/auth/yetki";
import { pozisyonAktifDurumDegistir } from "@/app/(app)/panel/ayarlar/personel-tanimlama/actions";
import { basvuruDurumGuncelle } from "@/app/(app)/panel/personel/basvurular/actions";
import { personelBilgileriGuncelle, personelHesabiOlustur, topluHesapHareketiEkle } from "@/app/(app)/panel/personel/actions";
import { hesapHareketiEkle, maasAyarlariGuncelle } from "@/app/(app)/panel/personel/[id]/actions";
import { izinTalebiOnayla, izinTalebiReddet, izinTalebiYoneticiIptalEt, manuelRaporEkle } from "@/app/(app)/panel/personel/izinler/actions";
import { izinTalebiIptalEt, izinTalebiOlustur } from "@/app/(app)/panel/personel/izinlerim/actions";
import { izinCakisanlariGetir, izinIsGunuSayisi } from "@/app/(app)/panel/personel/izin-veri-actions";
import { donemKapat, donemYenidenAc, gunKaydet } from "@/app/(app)/panel/personel/puantaj-cetveli/actions";
import { puantajKendiKaydet } from "@/app/(app)/puantaj/[kisaKod]/[tur]/actions";

let P: string; // test kliniği
let K2: Record<string, string>;
let admin: string, muhasebe: string, resepsiyon: string, terapistU1: string, terapistU2: string, admin2: string;
let PT1: string, PT2: string, PADMIN: string, TER1: string, ODA: string, POZ: string;
const KISA_KOD = "personeldeneme";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
type Rol = "klinik_admin" | "resepsiyon" | "terapist" | "muhasebe";
const as = (id: string, k: string, rol: Rol) => oturumAc({ userId: id, klinikId: k, rol });
async function sql<T = Record<string, unknown>>(q: string, p: unknown[] = []): Promise<T[]> {
  const c = await superBaglan();
  try {
    return (await c.query(q, p)).rows as T[];
  } finally {
    await c.end();
  }
}
const yaz = (q: string, p: unknown[] = []) => tenantdaCalistir(P, (c) => c.query(q, p));
const tx = (kullanici: string) => tenantBaglami({ klinik: P, kullanici });

beforeAll(async () => {
  const o = ortamKur();
  K2 = o.ids.k2;
  P = randomUUID();
  await tenantdaCalistir(P, (c) => c.query("insert into klinik(id, ad, qr_kisa_kod, cumartesi_baslangic, pazar_baslangic) values ($1, 'personel-deneme', $2, null, null)", [P, KISA_KOD]));
  admin = (await personelKur({ klinikId: P, rol: "klinik_admin" })).id;
  muhasebe = (await personelKur({ klinikId: P, rol: "muhasebe" })).id;
  resepsiyon = (await personelKur({ klinikId: P, rol: "resepsiyon" })).id;
  terapistU1 = (await personelKur({ klinikId: P, rol: "terapist" })).id;
  terapistU2 = (await personelKur({ klinikId: P, rol: "terapist" })).id;
  admin2 = (await personelKur({ klinikId: K2.klinik, rol: "klinik_admin" })).id;

  POZ = (await sql<{ id: string }>("select id from pozisyonlar where klinik_id = $1 and ad = 'Fizyoterapist' limit 1", [P]))[0].id;
  await yaz("update pozisyonlar set aktif = true where id = $1", [POZ]);

  [PT1, PT2, PADMIN, TER1, ODA] = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  await yaz("insert into personel(id, klinik_id, kullanici_id, ad_soyad, gorev, maas, pozisyon_id) values ($1, $2, $3, 'Terapist Bir', 'Fizyoterapist', 30000, $4)", [PT1, P, terapistU1, POZ]);
  await yaz("insert into personel(id, klinik_id, kullanici_id, ad_soyad, gorev, maas, ise_giris_tarihi, pozisyon_id) values ($1, $2, $3, 'Terapist Iki', 'Fizyoterapist', 12000, '2026-09-16', $4)", [PT2, P, terapistU2, POZ]);
  await yaz("insert into personel(id, klinik_id, kullanici_id, ad_soyad, gorev, pozisyon_id) values ($1, $2, $3, 'Yönetici', 'Fizyoterapist', $4)", [PADMIN, P, admin, POZ]);
  await yaz("insert into terapist(id, klinik_id, personel_id, prim_sabit_tutar) values ($1, $2, $3, 12.35)", [TER1, P, PT1]);
  await yaz("insert into oda(id, klinik_id, ad) values ($1, $2, 'O')", [ODA, P]);
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
describe("tenant izolasyonu ve rol kapıları", () => {
  it("başka kliniğin yöneticisi bu kliniğin personel/izin/puantaj/hesap verisini GÖRMEZ ve yazamaz", async () => {
    const baska = tenantBaglami({ klinik: K2.klinik, kullanici: admin2 });
    for (const tablo of [sema.personel, sema.personelPuantaj, sema.personelIzinTalebi, sema.personelHesapHareket, sema.personelUcret, sema.terapist]) {
      expect(await withTenant(baska, (t) => t.select().from(tablo)), "okuma").not.toContainEqual(expect.objectContaining({ klinikId: P }));
    }
    const g = await withTenant(baska, (t) => t.update(sema.personel).set({ maas: "1" }).where(drizzleSql`id = ${PT1}`).returning({ id: sema.personel.id }));
    expect(g).toHaveLength(0);
    as(admin2, K2.klinik, "klinik_admin");
    expect((await gunKaydet(PT1, "2026-10-05", null, fd({ durum: "calisti" })))?.message).toBe("Personel bulunamadı.");
    expect((await maasAyarlariGuncelle(PT1, TER1, null, fd({ maas: "1" })))?.success).toBe(false);
    expect((await sql<{ maas: string }>("select maas::text from personel where id = $1", [PT1]))[0].maas).toBe("30000.00");
  });

  it("terapist / resepsiyon yönetim eylemlerini yapamaz; muhasebe izin onayı ve personel yönetimi yapamaz", async () => {
    for (const [id, rol] of [[terapistU1, "terapist"], [resepsiyon, "resepsiyon"], [muhasebe, "muhasebe"]] as const) {
      as(id, P, rol);
      expect((await gunKaydet(PT1, "2026-10-05", null, fd({})))?.message, rol).toBe(YETKISIZ_MESAJI);
      expect((await izinTalebiOnayla(randomUUID()))?.message, rol).toBe(YETKISIZ_MESAJI);
      expect((await izinTalebiReddet(randomUUID(), "x"))?.message, rol).toBe(YETKISIZ_MESAJI);
      expect((await maasAyarlariGuncelle(PT1, TER1, null, fd({ maas: "1" })))?.message, rol).toBe(YETKISIZ_MESAJI);
      expect((await hesapHareketiEkle(PT1, null, fd({ tur: "avans", tutar: "1", tarih: "2026-10-05" })))?.message, rol).toBe(YETKISIZ_MESAJI);
      expect((await personelBilgileriGuncelle(PT1, null, fd({})))?.message, rol).toBe(YETKISIZ_MESAJI);
      expect((await personelHesabiOlustur(null, null, fd({})))?.message, rol).toBe(YETKISIZ_MESAJI);
      expect((await basvuruDurumGuncelle(randomUUID(), "olumsuz"))?.message, rol).toBe(YETKISIZ_MESAJI);
      expect((await pozisyonAktifDurumDegistir(POZ, false))?.message, rol).toBe(YETKISIZ_MESAJI);
      expect((await manuelRaporEkle(null, fd({})))?.message, rol).toBe(YETKISIZ_MESAJI);
      expect((await topluHesapHareketiEkle(null, fd({})))?.message, rol).toBe(YETKISIZ_MESAJI);
    }
  });

  it("DEFINER izin_bildirim_alicilari: yalnız yönetici+muhasebe iletişimi, yalnız kendi klinik; hasta ve anonim reddedilir", async () => {
    const alicilar = await withTenant(tx(terapistU1), (t) => rpc<{ personel_id: string }>(t, "izin_bildirim_alicilari", {}));
    expect(alicilar.map((a) => a.personel_id)).toEqual([PADMIN]); // muhasebe/terapist/resepsiyon kullanıcılarının personel kaydı yok → yalnız yönetici
    const baska = await withTenant(tenantBaglami({ klinik: K2.klinik, kullanici: admin2 }), (t) => rpc<{ personel_id: string }>(t, "izin_bildirim_alicilari", {}));
    expect(baska.map((a) => a.personel_id)).not.toContain(PADMIN);
    const c = await superBaglan();
    try {
      await c.query("BEGIN");
      await c.query("SET LOCAL ROLE klinik_anonim");
      await expect(c.query("select * from izin_bildirim_alicilari()")).rejects.toThrow(/permission denied/);
    } finally {
      await c.query("ROLLBACK").catch(() => {});
      await c.end();
    }
    const hasta = await hastaKur({ klinikId: P });
    await reddedilmeli(withTenant(tenantBaglami({ klinik: P, kullanici: hasta.kullaniciId }), (t) => rpc(t, "izin_bildirim_alicilari", {})), /yetkisiz/);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
describe("izin durum makinesi, çakışma ve iş günü", () => {
  const talep = (bas: string, bit: string, tip = "mazeret") => fd({ tip, baslangic_tarih: bas, bitis_tarih: bit, gerekce: "test" });
  const durumu = async (id: string) => (await sql<{ durum: string }>("select durum from personel_izin_talebi where id = $1", [id]))[0].durum;
  const sonTalep = async (personel: string) => (await sql<{ id: string }>("select id from personel_izin_talebi where personel_id = $1 order by created_at desc limit 1", [personel]))[0].id;

  it("iş günü sayacı: hafta sonu ve resmi tatil sayılmaz", async () => {
    as(terapistU1, P, "terapist");
    expect(await izinIsGunuSayisi("2027-03-01", "2027-03-07")).toBe(5); // Pzt-Paz, hafta sonu kapalı
    await yaz("insert into resmi_tatil(klinik_id, tarih, ad) values ($1, '2027-03-03', 'Test Tatili')", [P]);
    expect(await izinIsGunuSayisi("2027-03-01", "2027-03-07")).toBe(4);
    expect(await izinIsGunuSayisi("bozuk", "2027-03-07")).toBeNull();
  });

  it("talep → onay: iş günlerine 'izinli' puantaj yazılır; ikinci onay ve onaylıyı reddetme geçersiz geçiş", async () => {
    as(terapistU1, P, "terapist");
    expect((await izinTalebiOlustur(null, talep("2027-04-05", "2027-04-07")))?.success).toBe(true); // Pzt-Çar
    const id = await sonTalep(PT1);
    expect(await durumu(id)).toBe("beklemede");
    as(admin, P, "klinik_admin");
    expect((await izinTalebiOnayla(id))?.success).toBe(true);
    expect(await durumu(id)).toBe("onaylandi");
    const gunler = await sql<{ tarih: string; durum: string; kaynak: string }>("select tarih::text, durum, kaynak from personel_puantaj where izin_talep_id = $1 order by tarih", [id]);
    expect(gunler).toEqual([
      { tarih: "2027-04-05", durum: "izinli", kaynak: "izin_talebi" },
      { tarih: "2027-04-06", durum: "izinli", kaynak: "izin_talebi" },
      { tarih: "2027-04-07", durum: "izinli", kaynak: "izin_talebi" },
    ]);
    expect((await izinTalebiOnayla(id))?.message).toMatch(/artık onaylanamaz/);
    expect((await izinTalebiReddet(id, "geç"))?.message).toMatch(/artık reddedilemez/);
    // izin kaynaklı günün üzerine rapor yazılamaz
    expect((await manuelRaporEkle(null, fd({ personel_id: PT1, baslangic_tarih: "2027-04-05", bitis_tarih: "2027-04-06" })))?.message).toMatch(/onaylı izin/);
  });

  it("onaylı gelecek izin yönetici tarafından iptal edilir: puantaj satırları geri alınır; tekrar iptal geçersiz", async () => {
    const id = await sonTalep(PT1);
    as(admin, P, "klinik_admin");
    expect((await izinTalebiYoneticiIptalEt(id))?.success).toBe(true);
    expect(await durumu(id)).toBe("iptal");
    expect((await sql("select 1 from personel_puantaj where izin_talep_id = $1", [id])).length).toBe(0);
    expect((await izinTalebiYoneticiIptalEt(id))?.success).toBe(false);
  });

  it("ret gerekçesi zorunlu; red terminal (sonra onaylanamaz); talep sahibi beklemedeki talebini iptal eder, başkası edemez, onaylıyı edemez", async () => {
    as(terapistU1, P, "terapist");
    expect((await izinTalebiOlustur(null, talep("2027-05-03", "2027-05-04")))?.success).toBe(true);
    const id = await sonTalep(PT1);
    as(admin, P, "klinik_admin");
    expect((await izinTalebiReddet(id, "   "))?.message).toBe("Red gerekçesi zorunlu.");
    expect((await izinTalebiReddet(id, "yoğun dönem"))?.success).toBe(true);
    expect(await durumu(id)).toBe("reddedildi");
    expect((await izinTalebiOnayla(id))?.success).toBe(false);

    as(terapistU1, P, "terapist");
    expect((await izinTalebiOlustur(null, talep("2027-05-10", "2027-05-11")))?.success).toBe(true);
    const id2 = await sonTalep(PT1);
    as(terapistU2, P, "terapist");
    expect((await izinTalebiIptalEt(id2))?.success).toBe(false); // başkasının talebi
    expect(await durumu(id2)).toBe("beklemede");
    as(terapistU1, P, "terapist");
    expect((await izinTalebiIptalEt(id2))?.success).toBe(true);
    expect(await durumu(id2)).toBe("iptal");
    // onaylı talebi sahibi iptal edemez
    const r17 = await izinTalebiOlustur(null, talep("2027-05-24", "2027-05-25"));
    expect(r17?.success, r17?.message).toBe(true);
    const id3 = await sonTalep(PT1);
    as(admin, P, "klinik_admin");
    await izinTalebiOnayla(id3);
    as(terapistU1, P, "terapist");
    expect((await izinTalebiIptalEt(id3))?.success).toBe(false);
    expect(await durumu(id3)).toBe("onaylandi");
  });

  it("çakışan talepler listelenir; muhasebe başka personel adına talep açabilir ama onaylayamaz", async () => {
    as(muhasebe, P, "muhasebe");
    const a = await izinTalebiOlustur(null, fd({ personel_id: PT2, tip: "mazeret", baslangic_tarih: "2027-06-07", bitis_tarih: "2027-06-09", gerekce: "a" }));
    expect(a?.success, a?.message).toBe(true);
    const idA = await sonTalep(PT2);
    as(admin, P, "klinik_admin");
    expect((await izinTalebiOnayla(idA))?.success).toBe(true); // çakışma yalnız ONAYLI izinlerle aranır
    as(terapistU1, P, "terapist");
    await izinTalebiOlustur(null, talep("2027-06-08", "2027-06-10"));
    const idB = await sonTalep(PT1);
    as(admin, P, "klinik_admin");
    const cakisan = await izinCakisanlariGetir(idB);
    expect(cakisan.map((c) => c.personel_id)).toContain(PT2);
    expect((await izinCakisanlariGetir(randomUUID()))).toEqual([]);
    as(terapistU1, P, "terapist");
    expect(await izinCakisanlariGetir(idB)).toEqual([]); // yalnız yönetici
    as(muhasebe, P, "muhasebe");
    expect((await izinTalebiOnayla(idB))?.message).toBe(YETKISIZ_MESAJI);
  });

  it("kapalı dönemde izin onayı reddedilir (hiçbir kısmi yazma olmaz)", async () => {
    as(terapistU1, P, "terapist");
    await izinTalebiOlustur(null, talep("2026-07-06", "2026-07-07"));
    const id = await sonTalep(PT1);
    as(admin, P, "klinik_admin");
    expect((await donemKapat(PT1, 2026, 7))?.success).toBe(true);
    const r = await izinTalebiOnayla(id);
    expect(r?.success).toBe(false);
    expect(r?.message).toMatch(/dönemi kapalı/);
    expect((await sql("select 1 from personel_puantaj where izin_talep_id = $1", [id])).length).toBe(0);
    expect(await durumu(id)).toBe("beklemede");
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
describe("dönem kapatma, hakediş (kuruş), idempotency", () => {
  const hareketler = (personel: string) => sql<{ tur: string; tutar: string }>("select tur, tutar::text from personel_hesap_hareket where personel_id = $1 and tur in ('hakedis','prim') and kaynak_id in (select id from personel_puantaj_donem where personel_id = $1 and yil = 2026 and ay = 9) order by tur", [personel]);

  beforeAll(async () => {
    const hasta = (await hastaKur({ klinikId: P })).hastaId;
    for (const gun of ["01", "02", "03"]) {
      await yaz("insert into randevu(klinik_id, hasta_id, terapist_id, oda_id, baslangic, bitis, durum) values ($1, $2, $3, $4, $5::timestamptz, $5::timestamptz + interval '30 minutes', 'tamamlandi')", [P, hasta, TER1, ODA, `2026-09-${gun} 10:00+03`]);
    }
  });

  it("kapatma: taban 30.000,00 + prim 3 × 12,35 = 37,05 yazılır; ikinci kapatma reddedilir ve satırlar çoğalmaz", async () => {
    as(admin, P, "klinik_admin");
    const s = await donemKapat(PT1, 2026, 9);
    expect(s?.success, s?.message).toBe(true);
    expect(await hareketler(PT1)).toEqual([{ tur: "hakedis", tutar: "30000.00" }, { tur: "prim", tutar: "37.05" }]);
    const ikinci = await donemKapat(PT1, 2026, 9);
    expect(ikinci?.success).toBe(false);
    expect(ikinci?.message).toBe("Bu dönem zaten kapalı.");
    expect((await hareketler(PT1)).length).toBe(2);
  });

  it("yeniden açma kapanış satırlarını siler; tekrar kapatma tek hakediş yazar (aynı sonuç)", async () => {
    as(admin, P, "klinik_admin");
    expect((await donemYenidenAc(PT1, 2026, 9))?.success).toBe(true);
    expect(await hareketler(PT1)).toEqual([]);
    expect((await donemKapat(PT1, 2026, 9))?.success).toBe(true);
    expect(await hareketler(PT1)).toEqual([{ tur: "hakedis", tutar: "30000.00" }, { tur: "prim", tutar: "37.05" }]);
  });

  it("kısmi ay: 12.000 × 15/30 gün = 6.000,00; dönem kapalıyken puantaj günü düzenlenemez", async () => {
    as(admin, P, "klinik_admin");
    expect((await donemKapat(PT2, 2026, 9))?.success).toBe(true);
    expect((await hareketler(PT2)).find((h) => h.tur === "hakedis")?.tutar).toBe("6000.00");
    const g = await gunKaydet(PT2, "2026-09-20", null, fd({ durum: "calisti" }));
    expect(g?.success).toBe(false);
    expect(g?.message).toMatch(/dönemi kapalı/);
  });

  it("kapalı dönemi olmayan günde puantaj kaydedilir; aynı gün tekrar kaydetmek günceller (tek satır)", async () => {
    as(admin, P, "klinik_admin");
    expect((await gunKaydet(PT2, "2026-11-03", null, fd({ giris_saat: "09:00", cikis_saat: "18:00", mola_dakika: "60" })))?.success).toBe(true);
    expect((await gunKaydet(PT2, "2026-11-03", null, fd({ giris_saat: "09:30", cikis_saat: "18:00", mola_dakika: "30", durum: "calisti" })))?.success).toBe(true);
    const r = await sql<{ n: string; net: number }>("select count(*)::text n, max(net_calisma_dakika) net from personel_puantaj where personel_id = $1 and tarih = '2026-11-03'", [PT2]);
    expect(r[0]).toEqual({ n: "1", net: 480 });
  });

  it("maaş değişimi geçmişe yazılır (önce eski maaş, sonra yeni); aynı maaş yeniden kaydedilirse yeni satır eklenmez", async () => {
    as(admin, P, "klinik_admin");
    const s = await maasAyarlariGuncelle(PT1, TER1, null, fd({ maas: "33000,50", prim_sabit_tutar: "12.35", fm_saatlik_ucret: "" }));
    expect(s?.success, s?.message).toBe(true);
    expect((await sql<{ maas: string }>("select maas::text from personel_ucret where personel_id = $1 order by maas", [PT1])).map((r) => r.maas)).toEqual(["30000.00", "33000.50"]);
    expect((await maasAyarlariGuncelle(PT1, TER1, null, fd({ maas: "33000.50", prim_sabit_tutar: "12.35" })))?.success).toBe(true);
    expect((await sql("select 1 from personel_ucret where personel_id = $1", [PT1])).length).toBe(2);
    expect((await maasAyarlariGuncelle(PT1, TER1, null, fd({ maas: "10.005" })))?.success).toBe(false); // 3 ondalık
    expect((await maasAyarlariGuncelle(PT1, randomUUID(), null, fd({ maas: "5" })))?.success).toBe(false); // başka terapist kimliği
    expect((await sql<{ maas: string }>("select maas::text from personel where id = $1", [PT1]))[0].maas).toBe("33000.50");
  });

  it("cari hesap: 0,10 + 0,20 = 0,30 (float yok); çift gönderim tek kayıt; negatif/3 ondalık reddedilir; toplu ödeme kalem başına tek kayıt", async () => {
    as(admin, P, "klinik_admin");
    const bakiyeOnce = (await sql<{ b: string | null }>("select bakiye::text b from v_personel_hesap_bakiye where personel_id = $1", [PT2]))[0]?.b ?? "0";
    for (const t of ["0.10", "0,20"]) expect((await hesapHareketiEkle(PT2, null, fd({ tur: "prim", tutar: t, tarih: "2026-11-05" })))?.success).toBe(true);
    const bakiyeSonra = (await sql<{ b: string }>("select bakiye::text b from v_personel_hesap_bakiye where personel_id = $1", [PT2]))[0].b;
    expect(Math.round((Number(bakiyeSonra) - Number(bakiyeOnce)) * 100)).toBe(30);

    const anahtar = randomUUID();
    const f = () => hesapHareketiEkle(PT2, null, fd({ tur: "yol", tutar: "7.00", tarih: "2026-11-05", islem_anahtari: anahtar }));
    await Promise.all([f(), f()]);
    expect((await sql("select 1 from personel_hesap_hareket where personel_id = $1 and tur = 'yol'", [PT2])).length).toBe(1);

    expect((await hesapHareketiEkle(PT2, null, fd({ tur: "prim", tutar: "-1", tarih: "2026-11-05" })))?.success).toBe(false);
    expect((await hesapHareketiEkle(PT2, null, fd({ tur: "prim", tutar: "1.005", tarih: "2026-11-05" })))?.success).toBe(false);
    expect((await hesapHareketiEkle(PT2, null, fd({ tur: "hakedis", tutar: "5", tarih: "2026-11-05" })))?.success).toBe(false); // hakediş elle eklenemez

    const k = randomUUID();
    const toplu = () => topluHesapHareketiEkle(null, fd({ tur: "avans", tarih: "2026-11-06", kalemler_json: JSON.stringify([{ personelId: PT1, tutar: 100 }, { personelId: PT2, tutar: 50.25 }]), islem_anahtari: k }));
    await Promise.all([toplu(), toplu()]);
    expect((await sql<{ n: string }>("select count(*)::text n from personel_hesap_hareket where tur = 'avans' and tarih = '2026-11-06' and personel_id in ($1, $2)", [PT1, PT2]))[0].n).toBe("2");
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
describe("hesap oluşturma, geri alma, işten çıkış", () => {
  const eposta = () => `yeni-${randomUUID()}@deneme.test`;
  const form = (e: string, ek: Record<string, string> = {}) =>
    fd({ ad_soyad: "Yeni Personel", gsm: "0555" + String(Math.floor(1000000 + Math.random() * 8999999)), pozisyon_id: POZ, rol: "terapist", eposta: e, ...ek });
  const kimlik = (e: string) => sql<{ id: string }>("select id from kimlik_kullanici where eposta = $1", [e.toLowerCase()]);

  it("başarılı oluşturma: kimlik hesabı + kullanici + personel + terapist kaydı, geçici şifre döner; başvuru personele bağlanır ve ikinci aktarım reddedilir", async () => {
    const b = randomUUID();
    await yaz("insert into is_basvurusu(id, klinik_id, ad_soyad, telefon) values ($1, $2, 'Aday', '05550000000')", [b, P]);
    as(admin, P, "klinik_admin");
    const e = eposta();
    const s = await personelHesabiOlustur(b, null, form(e, { acil_ad_soyad: "Yakın", acil_yakinlik: "Eş", acil_telefon: "05551234567", egitim_json: JSON.stringify([{ derece: "Lisans", okul: "X", bolum: "Y", yil: "2015" }]) }));
    expect(s?.success, s?.message).toBe(true);
    expect(s?.geciciSifre).toBeTruthy();
    const [k] = await kimlik(e);
    expect(k).toBeTruthy();
    const p = (await sql<{ id: string; kullanici_id: string }>("select id, kullanici_id from personel where eposta = $1", [e]))[0];
    expect(p.kullanici_id).toBe(k.id);
    expect((await sql("select 1 from kullanici where id = $1 and klinik_id = $2 and rol = 'terapist'", [k.id, P])).length).toBe(1);
    expect((await sql("select 1 from terapist where personel_id = $1", [p.id])).length).toBe(1);
    expect((await sql("select 1 from personel_acil_kisi where personel_id = $1", [p.id])).length).toBe(1);
    expect((await sql("select 1 from personel_egitim where personel_id = $1", [p.id])).length).toBe(1);
    const bas = (await sql<{ durum: string; personel_id: string }>("select durum, personel_id from is_basvurusu where id = $1", [b]))[0];
    expect(bas).toEqual({ durum: "olumlu", personel_id: p.id });
    const tekrar = await personelHesabiOlustur(b, null, form(eposta()));
    expect(tekrar?.message).toBe("Bu başvuru zaten bir personele aktarılmış.");
  });

  it("geçersiz girdiler reddedilir ve HİÇBİR hesap oluşmaz: geçersiz TC, kötü e-posta, pasif/başka klinik pozisyonu, başka kliniğin başvurusu", async () => {
    as(admin, P, "klinik_admin");
    const e = eposta();
    expect((await personelHesabiOlustur(null, null, form(e, { tc_kimlik_no: "12345678901" })))?.message).toBe("T.C. Kimlik No geçersiz.");
    expect((await personelHesabiOlustur(null, null, form("eposta-degil")))?.message).toBe("Geçersiz kurumsal e-posta.");
    const yabanciPoz = (await sql<{ id: string }>("select id from pozisyonlar where klinik_id = $1 limit 1", [K2.klinik]))[0]?.id ?? randomUUID();
    expect((await personelHesabiOlustur(null, null, form(e, { pozisyon_id: yabanciPoz })))?.message).toBe("Seçilen pozisyon bulunamadı ya da pasif.");
    expect((await personelHesabiOlustur(randomUUID(), null, form(e)))?.message).toBe("Başvuru bulunamadı.");
    expect(await kimlik(e)).toHaveLength(0);
  });

  it("tenant yazımı düşerse kimlik hesabı dahil HİÇBİR yarım kayıt kalmaz (geri alma)", async () => {
    const c = await superBaglan();
    await c.query(`create or replace function pg_temp.dummy() returns void language sql as 'select 1'`).catch(() => undefined);
    await c.end();
    await sql(`create or replace function zz_test_terapist_hata() returns trigger language plpgsql as $$ begin if exists (select 1 from personel where id = new.personel_id and ad_soyad = 'ZZ-HATA') then raise exception 'zz_test_hata'; end if; return new; end $$`);
    await sql("create trigger zz_test_terapist_hata before insert on terapist for each row execute function zz_test_terapist_hata()");
    try {
      as(admin, P, "klinik_admin");
      const e = eposta();
      const s = await personelHesabiOlustur(null, null, form(e, { ad_soyad: "ZZ-HATA" }));
      expect(s?.success).toBe(false);
      expect(await kimlik(e)).toHaveLength(0); // kimlik hesabı geri silindi
      expect((await sql("select 1 from personel where eposta = $1", [e])).length).toBe(0); // personel/kullanici/terapist geri alındı
      expect((await sql("select 1 from kullanici where ad_soyad = 'ZZ-HATA'")).length).toBe(0);
    } finally {
      await sql("drop trigger if exists zz_test_terapist_hata on terapist");
      await sql("drop function if exists zz_test_terapist_hata()");
    }
  });

  it("işten çıkış tarihi girilince kimlik hesabı devre dışı kalır, silinince yeniden açılır; son yönetici rolü düşürülemez", async () => {
    as(admin, P, "klinik_admin");
    const e = eposta();
    const ol = await personelHesabiOlustur(null, null, form(e, { rol: "resepsiyon" }));
    expect(ol?.success, ol?.message).toBe(true);
    const p = (await sql<{ id: string; kullanici_id: string }>("select id, kullanici_id from personel where eposta = $1", [e]))[0];
    const tel = (await sql<{ telefon: string }>("select telefon from kullanici where id = $1", [p.kullanici_id]))[0].telefon;
    const devreDisi = async () => (await sql<{ devre_disi: boolean }>("select devre_disi from kimlik_kullanici where id = $1", [p.kullanici_id]))[0].devre_disi;
    expect(await devreDisi()).toBe(false);

    const guncelle = (ek: Record<string, string>) => personelBilgileriGuncelle(p.id, null, fd({ ad_soyad: "Yeni Personel", gsm: tel, pozisyon_id: POZ, rol: "resepsiyon", ...ek }));
    const cikis = await guncelle({ isten_cikis_tarihi: "2026-10-01" });
    expect(cikis?.success, cikis?.message).toBe(true);
    expect(cikis?.message).toMatch(/Giriş erişimi iptal edildi/);
    expect(await devreDisi()).toBe(true);
    expect((await guncelle({ isten_cikis_tarihi: "" }))?.success).toBe(true);
    expect(await devreDisi()).toBe(false);

    // son yönetici
    const son = await personelBilgileriGuncelle(PADMIN, null, fd({ ad_soyad: "Yönetici", gsm: "05551112299", pozisyon_id: POZ, rol: "resepsiyon" }));
    expect(son?.success).toBe(false);
    expect(son?.message).toMatch(/son yöneticinin rolü/);
    expect((await sql<{ rol: string }>("select rol::text from kullanici where id = $1", [admin]))[0].rol).toBe("klinik_admin");
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
describe("QR puantaj (kısa kod → klinik, oturumdaki kişi)", () => {
  const bugun = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());

  it("geçersiz kod, başka kliniğin personeli, hasta oturumu ve kapalı QR reddedilir", async () => {
    as(terapistU1, P, "terapist");
    expect((await puantajKendiKaydet("yok-boyle-kod", "giris", null, fd({})))?.message).toBe("Geçersiz bağlantı.");
    expect((await puantajKendiKaydet(KISA_KOD, "bozuk", null, fd({})))?.message).toBe("Geçersiz işlem.");

    as(admin2, K2.klinik, "klinik_admin");
    expect((await puantajKendiKaydet(KISA_KOD, "giris", null, fd({})))?.message).toBe("Bu QR kodu sizin kliniğinize ait değil.");

    oturumAc({ userId: randomUUID(), klinikId: P, rol: "hasta", hastaId: randomUUID() });
    expect((await puantajKendiKaydet(KISA_KOD, "giris", null, fd({})))?.message).toMatch(/Oturumunuz bulunamadı/);

    await yaz(`insert into klinik_ayarlar(klinik_id, ayarlar) values ($1, '{"qr_kodlari":{"puantaj_giris":{"aktif":false}}}') on conflict (klinik_id) do update set ayarlar = excluded.ayarlar`, [P]);
    as(terapistU2, P, "terapist");
    expect((await puantajKendiKaydet(KISA_KOD, "giris", null, fd({})))?.message).toBe("Bu puantaj bağlantısı artık aktif değil.");
    await yaz("update klinik_ayarlar set ayarlar = '{}' where klinik_id = $1", [P]);
    expect(await sql("select 1 from personel_puantaj where personel_id = $1 and tarih = $2", [PT2, bugun])).toHaveLength(0);
  });

  it("giriş → çift giriş reddi → çıkış → çift çıkış reddi; saat sunucuda, kişi oturumdan (kaynak self_qr)", async () => {
    as(terapistU2, P, "terapist");
    const g = await puantajKendiKaydet(KISA_KOD, "giris", null, fd({ personel_id: PT1, giris_saat: "03:00" })); // istemci alanları yok sayılır
    expect(g?.success, g?.message).toBe(true);
    expect(g?.adSoyad).toBe("Terapist Iki");
    const satir = (await sql<{ personel_id: string; kaynak: string; giris_saat: string }>("select personel_id, kaynak, giris_saat::text from personel_puantaj where personel_id in ($1, $2) and tarih = $3", [PT1, PT2, bugun]));
    expect(satir.map((s) => [s.personel_id, s.kaynak])).toEqual([[PT2, "self_qr"]]);
    expect((await puantajKendiKaydet(KISA_KOD, "giris", null, fd({})))?.message).toBe("Bugün için giriş zaten kaydedilmiş.");
    expect((await puantajKendiKaydet(KISA_KOD, "cikis", null, fd({})))?.success).toBe(true);
    expect((await puantajKendiKaydet(KISA_KOD, "cikis", null, fd({})))?.message).toBe("Bugün için çıkış zaten kaydedilmiş.");
  });

  it("hesabı bağlı personel kaydı olmayan kullanıcı (muhasebe) kayıt açamaz", async () => {
    as(muhasebe, P, "muhasebe");
    expect((await puantajKendiKaydet(KISA_KOD, "giris", null, fd({})))?.message).toBe("Hesabınıza bağlı aktif bir personel kaydı bulunamadı.");
  });
});
