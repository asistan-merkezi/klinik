import fs from "node:fs";
import path from "node:path";

/**
 * Entegrasyon betikleri GERÇEK Supabase projesine (.env.local) yazar: "ZZENT" önekli geçici klinik kurar ve
 * işi bitince siler (klinik CASCADE). Yanlışlıkla çalışmasın diye ENTEGRASYON_ONAY=1 şart.
 */
export function ortamiHazirla() {
  if (process.env.ENTEGRASYON_ONAY !== "1") {
    throw new Error(
      "Entegrasyon testleri canlı veritabanına geçici veri yazar. Bilerek çalıştırmak için: ENTEGRASYON_ONAY=1 npm run test:entegrasyon"
    );
  }
  const dosya = path.resolve(process.cwd(), ".env.local");
  for (const satir of fs.readFileSync(dosya, "utf8").split(/\r?\n/)) {
    const m = satir.replace("﻿", "").match(/^([A-Z_0-9]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

/** Supabase sonucunu doğrular: hata varsa fırlatır. `.single()` sonuçlarında data dolu olduğundan null'sız tipe daraltılır. */
export function beklenen<T>(sonuc: { data: T; error: { message: string } | null }, etiket: string): NonNullable<T> {
  if (sonuc.error) throw new Error(`${etiket}: ${sonuc.error.message}`);
  return sonuc.data as NonNullable<T>;
}

export type GeciciKlinik = Awaited<ReturnType<typeof geciciKlinikKur>>;

/** Klinik + hasta + oda + terapist + tedavi (+ isteğe bağlı aktif mesaj kuralları). `temizle()` her şeyi siler. */
export async function geciciKlinikKur(opsiyon: { kurallar?: string[]; whatsappAcik?: boolean; hastaWhatsappIzni?: boolean } = {}) {
  ortamiHazirla();
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const sb = createAdminClient();
  const klinik = beklenen(await sb.from("klinik").insert({ ad: `ZZENT ${Date.now().toString(36)}` }).select().single(), "klinik");

  const temizle = async () => {
    await sb.from("klinik").delete().eq("id", klinik.id);
  };

  try {
    const hasta = beklenen(
      await sb
        .from("hasta")
        .insert({
          klinik_id: klinik.id,
          ad_soyad: "Ayşe Entegrasyon",
          telefon: "05551112233",
          whatsapp_izin_durumu: opsiyon.hastaWhatsappIzni ?? false,
        })
        .select()
        .single(),
      "hasta"
    );
    const oda = beklenen(await sb.from("oda").insert({ klinik_id: klinik.id, ad: "Oda 1" }).select().single(), "oda");
    const personel = beklenen(
      await sb.from("personel").insert({ klinik_id: klinik.id, ad_soyad: "Dr Entegrasyon", gorev: "Fizyoterapist" }).select().single(),
      "personel"
    );
    const terapist = beklenen(await sb.from("terapist").insert({ klinik_id: klinik.id, personel_id: personel.id }).select().single(), "terapist");
    const kategori = await sb.from("islem_kategori").insert({ klinik_id: klinik.id, ad: "Genel" }).select().single();
    const islem = beklenen(
      await sb
        .from("islem_tanimi")
        .insert({
          klinik_id: klinik.id,
          ad: "Manuel Terapi",
          vita_fiyat: 500,
          kdv_orani: 20,
          sure_dakika: 30,
          ...(kategori.data ? { islem_kategori_id: kategori.data.id } : {}),
        })
        .select()
        .single(),
      "islem"
    );

    // Sessiz saat (21:00-08:00) gece çalıştırılırsa diğer senaryoları bozmasın diye varsayılan KAPALI;
    // sessiz saati sınayan senaryo kendi aralığını yazar.
    beklenen(
      await sb.from("klinik_ayarlar").upsert({ klinik_id: klinik.id, ayarlar: { mesaj_sessiz_saat: { kapali: true } } }, { onConflict: "klinik_id" }),
      "klinik_ayarlar"
    );

    for (const kod of opsiyon.kurallar ?? []) {
      beklenen(
        await sb.from("mesaj_kurallari").insert({
          klinik_id: klinik.id,
          tetikleyici_kodu: kod,
          aktif: true,
          sms_aktif: true,
          whatsapp_aktif: opsiyon.whatsappAcik ?? false,
          mail_aktif: false,
          mesaj_metni: "",
        }),
        `kural ${kod}`
      );
    }

    const randevuEkle = async (baslangicMs: number, olusturulduMs: number = Date.now()) =>
      beklenen(
        await sb
          .from("randevu")
          .insert({
            klinik_id: klinik.id,
            hasta_id: hasta.id,
            terapist_id: terapist.id,
            oda_id: oda.id,
            islem_tanimi_id: islem.id,
            baslangic: new Date(baslangicMs).toISOString(),
            bitis: new Date(baslangicMs + 30 * 60_000).toISOString(),
            created_at: new Date(olusturulduMs).toISOString(),
          })
          .select("id")
          .single(),
        "randevu"
      );

    const kuyruk = async (kod?: string) => {
      let q = sb.from("mesaj_kuyrugu").select("tetikleyici_kodu, kanal, gonderilecek_metin, planlanan_zaman").eq("klinik_id", klinik.id);
      if (kod) q = q.eq("tetikleyici_kodu", kod);
      return beklenen(await q.order("tetikleyici_kodu").order("kanal"), "kuyruk");
    };

    return { sb, klinik, hasta, oda, terapist, islem, randevuEkle, kuyruk, temizle };
  } catch (hata) {
    await temizle();
    throw hata;
  }
}
