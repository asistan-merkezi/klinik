import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hakedisHesapla } from "@/lib/personel/hakedis";
import { ayAraligi } from "@/lib/utils";
import { seansSayilariniGetir } from "@/lib/personel/seans-sayisi";
import { tumSayfalariOku } from "@/lib/supabase/sayfali-okuma";
import { cronYetkiliMi } from "@/lib/cron-yetki";

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
 * toplu (sayfalı, parçalı IN()) çekilip JS'te gruplanıyor; RPC çağrıları da (kişi başına 2 tane,
 * atomik olmaları gerektiği için tek tek) ESZAMANLI_ISLEM_LIMITI kadar
 * paralel yürütülüyor — tam sıralı olsaydı personel sayısı arttıkça
 * maxDuration'a takılma riski oluşuyordu.
 */
export async function GET(request: Request) {
  if (!cronYetkiliMi(request)) {
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

  // Tüm klinikler tek sorguda: PostgREST 1000 satır sınırında sessizce kesilmesin
  // diye sayfalı okunur; hata olursa hiçbir dönem kapatılmaz.
  let personelSatirlari: PersonelSatiri[];
  let terapistSatirlari: TerapistSatiri[];
  try {
    [personelSatirlari, terapistSatirlari] = await Promise.all([
      tumSayfalariOku<PersonelSatiri>((bas, son) =>
        admin
          .from("personel")
          .select("id, maas, ise_giris_tarihi, isten_cikis_tarihi, pozisyon:pozisyon_id(puantaj_modu)")
          .eq("aktif", true)
          .order("id")
          .range(bas, son)
          .returns<PersonelSatiri[]>()
      ),
      tumSayfalariOku<TerapistSatiri>((bas, son) =>
        admin
          .from("terapist")
          .select("id, personel_id, maas_hesaplama_modeli, prim_sabit_tutar, baraj_seans_sayisi, baraj_bonus_tutari")
          .order("id")
          .range(bas, son)
          .returns<TerapistSatiri[]>()
      ),
    ]);
  } catch (hata) {
    console.error("[cron/personel-donem-otomatik-kapat] personel/terapist okuma hatası:", hata);
    return NextResponse.json({ error: "okuma hatası" }, { status: 500 });
  }

  const takipEdilebilenler = personelSatirlari.filter((p) => {
    const pozisyon = Array.isArray(p.pozisyon) ? p.pozisyon[0] : p.pozisyon;
    return pozisyon?.puantaj_modu !== "takipsiz";
  });
  const personelById = new Map(takipEdilebilenler.map((p) => [p.id, p]));
  const terapistByPersonelId = new Map(
    terapistSatirlari.filter((t) => personelById.has(t.personel_id)).map((t) => [t.personel_id, t])
  );

  let toplamKapatildi = 0;
  let toplamZatenKapali = 0;
  let toplamHata = 0;
  const ayOzetleri: { donem: string; kapatildi: number; zatenKapali: number; hata: number }[] = [];

  for (const hedefAy of hedefAylar) {
    const [yilStr, ayStr] = hedefAy.param.split("-");
    const yil = Number(yilStr);
    const ay = Number(ayStr);

    // Seans sayımı dönem kapatılmadan ÖNCE yapılır; okunamazsa bu ay atlanır
    // (sonraki çalıştırma geriye dönük tarayıp yakalar) — eksik primle kapatılmaz.
    let zatenKapaliIdler: Set<string>;
    let seansSayisiMap: Map<string, number>;
    try {
      const kapaliDonemler = await tumSayfalariOku<{ personel_id: string }>((bas, son) =>
        admin
          .from("personel_puantaj_donem")
          .select("personel_id")
          .eq("yil", yil)
          .eq("ay", ay)
          .eq("durum", "kapali")
          .order("personel_id")
          .range(bas, son)
      );
      zatenKapaliIdler = new Set(kapaliDonemler.map((d) => d.personel_id));
      const sayilacaklar = takipEdilebilenler.filter((p) => !zatenKapaliIdler.has(p.id) && terapistByPersonelId.has(p.id));
      seansSayisiMap = await seansSayilariniGetir(
        admin,
        sayilacaklar.map((p) => ({
          terapistId: terapistByPersonelId.get(p.id)!.id,
          personelId: p.id,
          istenCikisTarihi: p.isten_cikis_tarihi,
        })),
        hedefAy.param
      );
    } catch (hata) {
      console.error(`[cron/personel-donem-otomatik-kapat] ${hedefAy.param} okuma hatası, ay atlandı:`, hata);
      toplamHata++;
      ayOzetleri.push({ donem: hedefAy.param, kapatildi: 0, zatenKapali: 0, hata: 1 });
      continue;
    }

    const buAyTakipEdilecekler = takipEdilebilenler.filter((p) => !zatenKapaliIdler.has(p.id));

    if (buAyTakipEdilecekler.length === 0) {
      ayOzetleri.push({ donem: hedefAy.param, kapatildi: 0, zatenKapali: 0, hata: 0 });
      continue;
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
