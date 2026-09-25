import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hakedisHesapla } from "@/lib/personel/hakedis";
import { ayAraligi } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 300;

const GERIYE_DONUK_AY_SAYISI = 3;
const ESZAMANLI_ISLEM_LIMITI = 8;

type PersonelSatiri = {
  id: string;
  maas: number | null;
  ise_giris_tarihi: string | null;
  isten_cikis_tarihi: string | null;
  pozisyon: { puantaj_modu?: string } | { puantaj_modu?: string }[] | null;
};

type TerapistSatiri = {
  id: string;
  personel_id: string;
  maas_hesaplama_modeli: "sabit" | "islem_basi_prim" | "barajli_prim";
  prim_sabit_tutar: number | null;
  baraj_seans_sayisi: number | null;
  baraj_bonus_tutari: number | null;
};

/** items üzerinde en fazla `limit` kadar eşzamanlı worker çalıştırır (tüm DB bağlantı havuzunu tek seferde doldurmadan paralelleştirmek için). */
async function sinirliEszamanliCalistir<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  async function calisan() {
    while (index < items.length) {
      const i = index++;
      await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, calisan));
}

/**
 * Ayın 1'inde: bir önceki ay için, "Dönem Kapat" butonunun elle yaptığı AYNI
 * iki RPC'yi (personel_puantaj_donem_kapat + personel_hesap_hareket_donem_ekle,
 * bkz. puantaj-cetveli/actions.ts'teki donemKapat) TÜM kliniklerdeki TÜM aktif
 * personel için otomatik çağırır — klinik_admin'in her personel için ayrı ayrı
 * tıklamasına gerek kalmadan maaş hakedişi bakiyeye düşsün diye. Formül tek
 * kaynakta (lib/personel/hakedis.ts) kalmaya devam ediyor, burada tekrar
 * YAZILMIYOR. Bir personelde hata olursa diğerleri etkilenmez (satır bazlı
 * hata toleranslı, arşiv içe aktarmadaki desenle aynı).
 *
 * Sadece "geçen ay"a bakmıyor — son GERIYE_DONUK_AY_SAYISI ayı da tarıyor,
 * böylece bir önceki çalıştırma timeout/hata yüzünden bir personeli
 * kapatamadıysa, sonraki çalıştırma o ayı da otomatik yakalar (RPC idempotent
 * olduğu için zaten kapalı aylar için tekrar çağrı ucuz bir no-op).
 * Kişi/ay başına ayrı sorgu atmak yerine terapist ayarları ve seans sayıları
 * toplu (IN()) çekilip JS'te gruplanıyor; RPC çağrıları da (kişi başına 2 tane,
 * atomik olmaları gerektiği için tek tek) ESZAMANLI_ISLEM_LIMITI kadar
 * paralel yürütülüyor — tam sıralı olsaydı personel sayısı arttıkça
 * maxDuration'a takılma riski oluşuyordu.
 */
export async function GET(request: Request) {
  const yetkiBasligi = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || yetkiBasligi !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  }

  const admin = createAdminClient();
  const guncelAy = ayAraligi();

  const hedefAylar: ReturnType<typeof ayAraligi>[] = [];
  let yururkenAy = ayAraligi(guncelAy.oncekiParam);
  for (let i = 0; i < GERIYE_DONUK_AY_SAYISI; i++) {
    hedefAylar.push(yururkenAy);
    yururkenAy = ayAraligi(yururkenAy.oncekiParam);
  }

  const { data: personelSatirlari, error: personelHata } = await admin
    .from("personel")
    .select("id, maas, ise_giris_tarihi, isten_cikis_tarihi, pozisyon:pozisyon_id(puantaj_modu)")
    .eq("aktif", true)
    .returns<PersonelSatiri[]>();

  if (personelHata) {
    console.error("[cron/personel-donem-otomatik-kapat] personel okuma hatası:", personelHata);
    return NextResponse.json({ error: "okuma hatası" }, { status: 500 });
  }

  const takipEdilebilenler = (personelSatirlari ?? []).filter((p) => {
    const pozisyon = Array.isArray(p.pozisyon) ? p.pozisyon[0] : p.pozisyon;
    return pozisyon?.puantaj_modu !== "takipsiz";
  });
  const personelById = new Map(takipEdilebilenler.map((p) => [p.id, p]));

  const { data: terapistSatirlari } = await admin
    .from("terapist")
    .select("id, personel_id, maas_hesaplama_modeli, prim_sabit_tutar, baraj_seans_sayisi, baraj_bonus_tutari")
    .in("personel_id", takipEdilebilenler.length > 0 ? takipEdilebilenler.map((p) => p.id) : ["00000000-0000-0000-0000-000000000000"])
    .returns<TerapistSatiri[]>();

  const terapistByPersonelId = new Map((terapistSatirlari ?? []).map((t) => [t.personel_id, t]));
  const terapistIdToPersonelId = new Map((terapistSatirlari ?? []).map((t) => [t.id, t.personel_id]));
  const terapistIdleri = [...terapistIdToPersonelId.keys()];

  let toplamKapatildi = 0;
  let toplamZatenKapali = 0;
  let toplamHata = 0;
  const ayOzetleri: { donem: string; kapatildi: number; zatenKapali: number; hata: number }[] = [];

  for (const hedefAy of hedefAylar) {
    const [yilStr, ayStr] = hedefAy.param.split("-");
    const yil = Number(yilStr);
    const ay = Number(ayStr);

    const { data: kapaliDonemler, error: donemHata } = await admin
      .from("personel_puantaj_donem")
      .select("personel_id")
      .eq("yil", yil)
      .eq("ay", ay)
      .eq("durum", "kapali");

    if (donemHata) {
      console.error(`[cron/personel-donem-otomatik-kapat] ${hedefAy.param} dönem okuma hatası:`, donemHata);
      toplamHata++;
      continue;
    }

    const zatenKapaliIdler = new Set((kapaliDonemler ?? []).map((d) => d.personel_id));
    const buAyTakipEdilecekler = takipEdilebilenler.filter((p) => !zatenKapaliIdler.has(p.id));

    if (buAyTakipEdilecekler.length === 0) {
      ayOzetleri.push({ donem: hedefAy.param, kapatildi: 0, zatenKapali: 0, hata: 0 });
      continue;
    }

    // Bu ay için tüm terapistlerin seans sayısını TEK sorguda topla (N+1 yerine).
    // İşten çıkış tarihinden SONRAKİ seanslar prime hiç katılmasın (normal
    // şartlarda öyle bir randevu oluşamaz — terapistAtanabilirMi kontrolü,
    // bkz. lib/personel/atanabilir-terapistler.ts — ama ek güvenlik).
    const seansSayisiMap = new Map<string, number>();
    if (terapistIdleri.length > 0) {
      const { data: randevuSonucu } = await admin
        .from("randevu")
        .select("terapist_id, baslangic")
        .in("terapist_id", terapistIdleri)
        .in("durum", ["geldi", "gecikmeli_geldi", "tamamlandi"])
        .gte("baslangic", hedefAy.baslangic)
        .lt("baslangic", hedefAy.bitis);
      for (const r of randevuSonucu ?? []) {
        const personelId = terapistIdToPersonelId.get(r.terapist_id);
        if (!personelId) continue;
        const cikisTarihi = personelById.get(personelId)?.isten_cikis_tarihi;
        if (cikisTarihi && r.baslangic.slice(0, 10) > cikisTarihi) continue;
        seansSayisiMap.set(personelId, (seansSayisiMap.get(personelId) ?? 0) + 1);
      }
    }

    let kapatildi = 0;
    let zatenKapali = 0;
    let hata = 0;

    await sinirliEszamanliCalistir(buAyTakipEdilecekler, ESZAMANLI_ISLEM_LIMITI, async (personel) => {
      const { data: donemSonucu, error: kapatHatasi } = await admin.rpc("personel_puantaj_donem_kapat", {
        p_personel_id: personel.id,
        p_yil: yil,
        p_ay: ay,
      });

      if (kapatHatasi) {
        if (kapatHatasi.message === "donem_zaten_kapali") {
          zatenKapali++;
        } else {
          console.error(`[cron/personel-donem-otomatik-kapat] ${hedefAy.param} ${personel.id} kapatılamadı:`, kapatHatasi.message);
          hata++;
        }
        return;
      }

      const donemId = (donemSonucu as { donem_id: string } | null)?.donem_id;
      if (!donemId) {
        hata++;
        return;
      }

      const terapist = terapistByPersonelId.get(personel.id);
      const guncelPersonel = personelById.get(personel.id) ?? personel;

      const hesap = hakedisHesapla({
        personelMaasi: guncelPersonel.maas,
        fmSaatlikUcret: null,
        terapistAyarlari: terapist
          ? {
              maas_hesaplama_modeli: terapist.maas_hesaplama_modeli,
              prim_sabit_tutar: terapist.prim_sabit_tutar,
              baraj_seans_sayisi: terapist.baraj_seans_sayisi,
              baraj_bonus_tutari: terapist.baraj_bonus_tutari,
            }
          : null,
        tamamlananSeansSayisi: seansSayisiMap.get(personel.id) ?? 0,
        onayliFmSaat: 0,
        ayBaslangicTarih: hedefAy.baslangicTarih,
        ayBitisTarihExclusive: hedefAy.bitisTarih,
        iseGirisTarihi: guncelPersonel.ise_giris_tarihi,
        istenCikisTarihi: guncelPersonel.isten_cikis_tarihi,
      });

      const { error: hesapHatasi } = await admin.rpc("personel_hesap_hareket_donem_ekle", {
        p_donem_id: donemId,
        p_hakedis_tutar: hesap.taban,
        p_prim_tutar: hesap.prim,
      });

      if (hesapHatasi && hesapHatasi.message !== "zaten_islendi") {
        console.error(`[cron/personel-donem-otomatik-kapat] ${hedefAy.param} ${personel.id} hakediş yazılamadı:`, hesapHatasi.message);
        hata++;
        return;
      }

      kapatildi++;
    });

    toplamKapatildi += kapatildi;
    toplamZatenKapali += zatenKapali;
    toplamHata += hata;
    ayOzetleri.push({ donem: hedefAy.param, kapatildi, zatenKapali, hata });
  }

  return NextResponse.json({
    taranan_aylar: hedefAylar.map((a) => a.param),
    ay_ozetleri: ayOzetleri,
    kapatildi: toplamKapatildi,
    zatenKapali: toplamZatenKapali,
    hata: toplamHata,
  });
}
