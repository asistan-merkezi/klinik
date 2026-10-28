// Otomatik dönem kapama çekirdeği (scripts/bakim/personel-donem-otomatik-kapat). "Dönem Kapat" butonunun elle yaptığı AYNI iki RPC
// (personel_puantaj_donem_kapat + personel_hesap_hareket_donem_ekle) ve AYNI formül (hakedis.ts > hakedisHesapla, donem-maasi.ts > donemMaasi,
// seans-sayisi.ts > seansSayilariniGetirTx) bir kliniğin tüm takipli personeli için çalışır.
// İdempotent: kapalı dönemler "zaten kapalı" sayılır; kapalı ama hakediş satırı OLMAYAN dönemler (önceki çalışma yarıda kalmışsa) yeniden denenir.
// Kişi/ay başına TEK transaction: kapatma ve hakediş birlikte yazılır ya da hiç yazılmaz (yarım dönem bırakmaz); bir kişinin hatası diğerlerini durdurmaz.
import { and, eq, inArray } from "drizzle-orm";
import { sema, rpc, pgHata, type Tx } from "@/lib/db";
import { kurus, kurusMetni } from "@/lib/para";
import { ayAraligi } from "@/lib/utils";
import { hakedisHesapla } from "./hakedis";
import { donemMaasi, maasGecmisiGetirTx } from "./donem-maasi";
import { seansSayilariniGetirTx } from "./seans-sayisi";
import type { MaasHesaplamaModeli } from "@/types/personel";

export const GERIYE_DONUK_AY_SAYISI = 3;

export type DonemKapatSonucu = { donem: string; kapatildi: number; zatenKapali: number; hata: number; atlandi?: string };
export type KlinikTxCalistir = <T>(is: (tx: Tx) => Promise<T>) => Promise<T>;

type Girdi = {
  personel: { id: string; maas: string | null; iseGiris: string | null; istenCikis: string | null };
  terapist: { id: string; model: string; primSabit: string | null; barajSeans: number | null; barajBonus: string | null } | null;
  maas: number | null;
  seans: number;
};

export function hedefAylar(simdi?: string): ReturnType<typeof ayAraligi>[] {
  const guncel = ayAraligi(simdi);
  const sonuc: ReturnType<typeof ayAraligi>[] = [];
  let ay = ayAraligi(guncel.oncekiParam);
  for (let i = 0; i < GERIYE_DONUK_AY_SAYISI; i++) {
    sonuc.push(ay);
    ay = ayAraligi(ay.oncekiParam);
  }
  return sonuc;
}

/** `klinikTx`: o kliniğin bağlamında bir transaction açan fonksiyon (bakim: oturum.klinikte(klinikId, ...)). */
export async function klinikDonemleriniKapat(klinikTx: KlinikTxCalistir, ayParametreleri: string[] = hedefAylar().map((a) => a.param)): Promise<DonemKapatSonucu[]> {
  const sonuclar: DonemKapatSonucu[] = [];

  // Okuma: takipli aktif personel + terapist ayarları + maaş geçmişi (bir kez).
  const temel = await klinikTx(async (tx) => {
    const personeller = await tx
      .select({ id: sema.personel.id, maas: sema.personel.maas, iseGiris: sema.personel.iseGirisTarihi, istenCikis: sema.personel.istenCikisTarihi, puantajModu: sema.pozisyonlar.puantajModu })
      .from(sema.personel)
      .leftJoin(sema.pozisyonlar, eq(sema.pozisyonlar.id, sema.personel.pozisyonId))
      .where(eq(sema.personel.aktif, true))
      .orderBy(sema.personel.id);
    const takipli = personeller.filter((p) => p.puantajModu !== "takipsiz");
    const ids = takipli.map((p) => p.id);
    const terapistler = ids.length
      ? await tx
          .select({ id: sema.terapist.id, personelId: sema.terapist.personelId, model: sema.terapist.maasHesaplamaModeli, primSabit: sema.terapist.primSabitTutar, barajSeans: sema.terapist.barajSeansSayisi, barajBonus: sema.terapist.barajBonusTutari })
          .from(sema.terapist)
          .where(inArray(sema.terapist.personelId, ids))
      : [];
    const gecmis = await maasGecmisiGetirTx(tx, ids);
    return { takipli, terapistler, gecmis };
  });

  for (const ayParam of ayParametreleri) {
    const hedef = ayAraligi(ayParam);
    const [yil, ay] = hedef.param.split("-").map(Number);
    let kapaliDonemler: { id: string; personelId: string }[];
    let hakedisli: Set<string>;
    try {
      ({ kapaliDonemler, hakedisli } = await klinikTx(async (tx) => {
        const d = await tx
          .select({ id: sema.personelPuantajDonem.id, personelId: sema.personelPuantajDonem.personelId })
          .from(sema.personelPuantajDonem)
          .where(and(eq(sema.personelPuantajDonem.yil, yil), eq(sema.personelPuantajDonem.ay, ay), eq(sema.personelPuantajDonem.durum, "kapali")));
        const h = d.length
          ? await tx.select({ kaynak: sema.personelHesapHareket.kaynakId }).from(sema.personelHesapHareket).where(and(eq(sema.personelHesapHareket.tur, "hakedis"), inArray(sema.personelHesapHareket.kaynakId, d.map((x) => x.id))))
          : [];
        return { kapaliDonemler: d, hakedisli: new Set(h.map((x) => x.kaynak as string)) };
      }));
    } catch (e) {
      sonuclar.push({ donem: hedef.param, kapatildi: 0, zatenKapali: 0, hata: 1, atlandi: `okuma: ${pgHata(e).mesaj}` });
      continue;
    }

    const kapaliPersonel = new Map(kapaliDonemler.map((d) => [d.personelId, d.id]));
    const ozet: DonemKapatSonucu = { donem: hedef.param, kapatildi: 0, zatenKapali: 0, hata: 0 };

    // İşe girişten önceki ve işten çıkıştan sonraki aylar kapatılmaz (Puantaj Cetveli'yle aynı filtre).
    const adaylar = temel.takipli.filter((p) => (!p.iseGiris || p.iseGiris < hedef.bitisTarih) && (!p.istenCikis || p.istenCikis >= hedef.baslangicTarih));

    for (const p of adaylar) {
      const mevcutDonem = kapaliPersonel.get(p.id);
      if (mevcutDonem && hakedisli.has(mevcutDonem)) {
        ozet.zatenKapali++;
        continue;
      }
      const terapist = temel.terapistler.find((t) => t.personelId === p.id) ?? null;
      try {
        const sonuc = await klinikTx(async (tx) => {
          let seans = 0;
          if (terapist) {
            // Okunamazsa FIRLATIR: eksik sayımla dönem kapatmak geri alınamaz şekilde eksik prim yazar (bu kişi/ay atlanır, sonraki çalışma yakalar).
            seans = (await seansSayilariniGetirTx(tx, [{ terapistId: terapist.id, personelId: p.id, istenCikisTarihi: p.istenCikis }], hedef.param)).get(p.id) ?? 0;
          }
          const girdi: Girdi = { personel: { id: p.id, maas: p.maas, iseGiris: p.iseGiris, istenCikis: p.istenCikis }, terapist, maas: donemMaasi(temel.gecmis.get(p.id), p.maas === null ? null : Number(p.maas), hedef.bitisTarih), seans };
          let donemId = mevcutDonem;
          if (!donemId) {
            const r = await rpc<{ personel_puantaj_donem_kapat: { donem_id: string } | null }>(tx, "personel_puantaj_donem_kapat", { p_personel_id: p.id, p_yil: yil, p_ay: ay });
            donemId = r[0]?.personel_puantaj_donem_kapat?.donem_id;
          }
          if (!donemId) throw new Error("donem_id_yok");
          const hesap = hesapla(girdi, hedef);
          await rpc(tx, "personel_hesap_hareket_donem_ekle", { p_donem_id: donemId, p_hakedis_tutar: kurusMetni(kurus(hesap.taban) ?? 0), p_prim_tutar: kurusMetni(kurus(hesap.prim) ?? 0) });
          return "kapatildi" as const;
        });
        if (sonuc === "kapatildi") ozet.kapatildi++;
      } catch (e) {
        const m = pgHata(e).mesaj;
        if (m.includes("donem_zaten_kapali") || m.includes("zaten_islendi")) ozet.zatenKapali++;
        else {
          ozet.hata++;
          console.error(`[personel-donem] ${hedef.param} ${p.id} kapatılamadı: ${m}`);
        }
      }
    }
    sonuclar.push(ozet);
  }
  return sonuclar;
}

/** Saf hesap: elle "Dönem Kapat" (puantaj-cetveli/actions.ts) ile birebir aynı girdi eşlemesi. */
export function hesapla(g: Girdi, hedef: ReturnType<typeof ayAraligi>) {
  return hakedisHesapla({
    personelMaasi: g.maas,
    fmSaatlikUcret: null,
    terapistAyarlari: g.terapist
      ? {
          maas_hesaplama_modeli: g.terapist.model as MaasHesaplamaModeli,
          prim_sabit_tutar: g.terapist.primSabit === null ? null : Number(g.terapist.primSabit),
          baraj_seans_sayisi: g.terapist.barajSeans,
          baraj_bonus_tutari: g.terapist.barajBonus === null ? null : Number(g.terapist.barajBonus),
        }
      : null,
    tamamlananSeansSayisi: g.seans,
    onayliFmSaat: 0,
    ayBaslangicTarih: hedef.baslangicTarih,
    ayBitisTarihExclusive: hedef.bitisTarih,
    iseGirisTarihi: g.personel.iseGiris,
    istenCikisTarihi: g.personel.istenCikis,
  });
}
