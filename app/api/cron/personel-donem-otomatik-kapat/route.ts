import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hakedisHesapla } from "@/lib/personel/hakedis";
import { ayAraligi } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

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

/**
 * Ayın 1'inde: bir önceki ay için, "Dönem Kapat" butonunun elle yaptığı AYNI
 * iki RPC'yi (personel_puantaj_donem_kapat + personel_hesap_hareket_donem_ekle,
 * bkz. puantaj-cetveli/actions.ts'teki donemKapat) TÜM kliniklerdeki TÜM aktif
 * personel için otomatik çağırır — klinik_admin'in her personel için ayrı ayrı
 * tıklamasına gerek kalmadan maaş hakedişi bakiyeye düşsün diye. Formül tek
 * kaynakta (lib/personel/hakedis.ts) kalmaya devam ediyor, burada tekrar
 * YAZILMIYOR. Bir personelde hata olursa diğerleri etkilenmez (satır bazlı
 * hata toleranslı, arşiv içe aktarmadaki desenle aynı).
 */
export async function GET(request: Request) {
  const yetkiBasligi = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || yetkiBasligi !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  }

  const admin = createAdminClient();
  const guncelAy = ayAraligi();
  const hedefAy = ayAraligi(guncelAy.oncekiParam);
  const [yilStr, ayStr] = hedefAy.param.split("-");
  const yil = Number(yilStr);
  const ay = Number(ayStr);

  const [{ data: personelSatirlari, error: personelHata }, { data: kapaliDonemler, error: donemHata }] = await Promise.all([
    admin
      .from("personel")
      .select("id, maas, ise_giris_tarihi, isten_cikis_tarihi, pozisyon:pozisyon_id(puantaj_modu)")
      .eq("aktif", true)
      .returns<PersonelSatiri[]>(),
    admin
      .from("personel_puantaj_donem")
      .select("personel_id")
      .eq("yil", yil)
      .eq("ay", ay)
      .eq("durum", "kapali"),
  ]);

  if (personelHata || donemHata) {
    console.error("[cron/personel-donem-otomatik-kapat] okuma hatası:", personelHata, donemHata);
    return NextResponse.json({ error: "okuma hatası" }, { status: 500 });
  }

  const zatenKapaliIdler = new Set((kapaliDonemler ?? []).map((d) => d.personel_id));
  const takipEdilecekler = (personelSatirlari ?? []).filter((p) => {
    const pozisyon = Array.isArray(p.pozisyon) ? p.pozisyon[0] : p.pozisyon;
    return pozisyon?.puantaj_modu !== "takipsiz" && !zatenKapaliIdler.has(p.id);
  });

  let kapatildi = 0;
  let zatenKapali = 0;
  let hata = 0;

  for (const personel of takipEdilecekler) {
    const { data: donemSonucu, error: kapatHatasi } = await admin.rpc("personel_puantaj_donem_kapat", {
      p_personel_id: personel.id,
      p_yil: yil,
      p_ay: ay,
    });

    if (kapatHatasi) {
      if (kapatHatasi.message === "donem_zaten_kapali") {
        zatenKapali++;
      } else {
        console.error(`[cron/personel-donem-otomatik-kapat] ${personel.id} kapatılamadı:`, kapatHatasi.message);
        hata++;
      }
      continue;
    }

    const donemId = (donemSonucu as { donem_id: string } | null)?.donem_id;
    if (!donemId) {
      hata++;
      continue;
    }

    const { data: terapist } = await admin
      .from("terapist")
      .select("id, personel_id, maas_hesaplama_modeli, prim_sabit_tutar, baraj_seans_sayisi, baraj_bonus_tutari")
      .eq("personel_id", personel.id)
      .maybeSingle<TerapistSatiri>();

    let seansSayisi = 0;
    if (terapist) {
      const { count } = await admin
        .from("randevu")
        .select("id", { count: "exact", head: true })
        .eq("terapist_id", terapist.id)
        .in("durum", ["geldi", "gecikmeli_geldi", "tamamlandi"])
        .gte("baslangic", hedefAy.baslangic)
        .lt("baslangic", hedefAy.bitis);
      seansSayisi = count ?? 0;
    }

    const hesap = hakedisHesapla({
      personelMaasi: personel.maas,
      fmSaatlikUcret: null,
      terapistAyarlari: terapist
        ? {
            maas_hesaplama_modeli: terapist.maas_hesaplama_modeli,
            prim_sabit_tutar: terapist.prim_sabit_tutar,
            baraj_seans_sayisi: terapist.baraj_seans_sayisi,
            baraj_bonus_tutari: terapist.baraj_bonus_tutari,
          }
        : null,
      tamamlananSeansSayisi: seansSayisi,
      onayliFmSaat: 0,
      ayBaslangicTarih: hedefAy.baslangicTarih,
      ayBitisTarihExclusive: hedefAy.bitisTarih,
      iseGirisTarihi: personel.ise_giris_tarihi,
      istenCikisTarihi: personel.isten_cikis_tarihi,
    });

    const { error: hesapHatasi } = await admin.rpc("personel_hesap_hareket_donem_ekle", {
      p_donem_id: donemId,
      p_hakedis_tutar: hesap.taban,
      p_prim_tutar: hesap.prim,
    });

    if (hesapHatasi && hesapHatasi.message !== "zaten_islendi") {
      console.error(`[cron/personel-donem-otomatik-kapat] ${personel.id} hakediş yazılamadı:`, hesapHatasi.message);
      hata++;
      continue;
    }

    kapatildi++;
  }

  return NextResponse.json({
    donem: hedefAy.param,
    toplam: takipEdilecekler.length,
    kapatildi,
    zatenKapali,
    hata,
  });
}
