import type { SupabaseClient } from "@supabase/supabase-js";
import { bugunIstanbulTarihi } from "@/lib/datetime";
import { nagerBayramlariniAyikla, sabitTatiller, tatilAdiBayrami, type Bayram, type BayramOnerisi } from "./kurallar";

const NAGER_URL = "https://date.nager.at/api/v3/PublicHolidays";

export type TatilGuncellemeSonucu = {
  yillar: number[];
  sabitEklenen: number;
  oneriEklenen: number;
  nagerHatasi: string[];
};

async function nagerdenBayramlar(yil: number): Promise<BayramOnerisi[]> {
  const yanit = await fetch(`${NAGER_URL}/${yil}/TR`, {
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!yanit.ok) throw new Error(`HTTP ${yanit.status}`);
  return nagerBayramlariniAyikla(await yanit.json(), yil);
}

/**
 * Bu yıl ve gelecek yıl için:
 *  1) Sabit tatilleri global (klinik_id NULL) kesin tatil olarak yazar (o gün global satır yoksa).
 *  2) Dini bayramları Nager.Date'ten çekip, o yıl o bayram için kesin tatili ya da önerisi OLMAYAN
 *     her kliniğe "bekliyor" öneri olarak yazar. Nager'a ulaşılamazsa yalnız 2. adım atlanır.
 *
 * `admin` servis rolü client'ı olmalı (global satır ve öneri yazımı RLS dışı). `klinikIdleri`
 * verilmezse tüm klinikler işlenir (cron); panelden "şimdi kontrol et" yalnız kendi kliniğini verir.
 * İdempotent: aynı gün tekrar çalışması bir şey eklemez.
 */
export async function resmiTatilleriGuncelle(
  admin: SupabaseClient,
  klinikIdleri?: string[]
): Promise<TatilGuncellemeSonucu> {
  const buYil = Number(bugunIstanbulTarihi().slice(0, 4));
  const yillar = [buYil, buYil + 1];
  const aralikBas = `${buYil}-01-01`;
  const aralikSon = `${buYil + 2}-01-01`;

  const { data: mevcutHam, error: mevcutHata } = await admin
    .from("resmi_tatil")
    .select("klinik_id, tarih, ad")
    .gte("tarih", aralikBas)
    .lt("tarih", aralikSon);
  if (mevcutHata) throw new Error(mevcutHata.message);
  const mevcut = (mevcutHam ?? []) as { klinik_id: string | null; tarih: string; ad: string }[];

  // 1) Sabit tatiller
  const globalTarihler = new Set(mevcut.filter((t) => t.klinik_id === null).map((t) => t.tarih));
  const sabitEksik = yillar.flatMap(sabitTatiller).filter((t) => !globalTarihler.has(t.tarih));
  if (sabitEksik.length > 0) {
    const { error } = await admin
      .from("resmi_tatil")
      .insert(sabitEksik.map((t) => ({ klinik_id: null, tarih: t.tarih, ad: t.ad })));
    if (error) throw new Error(error.message);
  }

  // 2) Dini bayram önerileri
  const nagerHatasi: string[] = [];
  const oneriler = new Map<number, BayramOnerisi[]>();
  for (const yil of yillar) {
    try {
      oneriler.set(yil, await nagerdenBayramlar(yil));
    } catch (hata) {
      nagerHatasi.push(`${yil}: ${hata instanceof Error ? hata.message : String(hata)}`);
    }
  }

  let klinikler = klinikIdleri;
  if (!klinikler) {
    const { data, error } = await admin.from("klinik").select("id");
    if (error) throw new Error(error.message);
    klinikler = (data ?? []).map((k) => k.id as string);
  }

  const { data: oneriHam, error: oneriHata } = await admin
    .from("resmi_tatil_oneri")
    .select("klinik_id, yil, bayram")
    .in("yil", yillar);
  if (oneriHata) throw new Error(oneriHata.message);
  const mevcutOneri = new Set((oneriHam ?? []).map((o) => `${o.klinik_id}|${o.yil}|${o.bayram}`));

  const kapsandi = (klinikId: string, yil: number, bayram: Bayram) =>
    mevcutOneri.has(`${klinikId}|${yil}|${bayram}`) ||
    mevcut.some(
      (t) =>
        (t.klinik_id === null || t.klinik_id === klinikId) &&
        t.tarih.startsWith(`${yil}-`) &&
        tatilAdiBayrami(t.ad) === bayram
    );

  const eklenecek: Record<string, unknown>[] = [];
  for (const klinikId of klinikler) {
    for (const [yil, liste] of oneriler) {
      for (const bayram of ["ramazan", "kurban"] as const) {
        if (kapsandi(klinikId, yil, bayram)) continue;
        for (const o of liste.filter((x) => x.bayram === bayram)) {
          eklenecek.push({ klinik_id: klinikId, yil, bayram, tarih: o.tarih, ad: o.ad, kaynak: "nager" });
        }
      }
    }
  }
  if (eklenecek.length > 0) {
    const { error } = await admin
      .from("resmi_tatil_oneri")
      .upsert(eklenecek, { onConflict: "klinik_id,bayram,tarih", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }

  return { yillar, sabitEklenen: sabitEksik.length, oneriEklenen: eklenecek.length, nagerHatasi };
}
