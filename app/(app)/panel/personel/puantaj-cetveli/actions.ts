"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { pgHata, rpc, sema, withTenant } from "@/lib/db";
import { eylemYetkisi, YETKISIZ_MESAJI } from "@/lib/auth/yetki";
import { donemMaasi, maasGecmisiGetirTx } from "@/lib/personel/donem-maasi";
import { hakedisHesapla } from "@/lib/personel/hakedis";
import { seansSayilariniGetirTx } from "@/lib/personel/seans-sayisi";
import { kurus, kurusMetni } from "@/lib/para";
import { toUTC } from "@/lib/datetime";
import { sonrakiGun } from "@/lib/puantaj";
import { ayAraligi } from "@/lib/utils";
import type { MaasHesaplamaModeli } from "@/types/personel";

type SonucDurumu = { success: boolean; message: string } | null;

/** Puantaj yazma / dönem işlemleri yalnız klinik_admin (RLS + RPC'ler içeride aynı kuralı zorlar). */
async function adminOturumu() {
  const y = await eylemYetkisi(["klinik_admin"]);
  if (!y.yetkili || !y.bag || !y.klinikId || y.ctx.rol !== "klinik_admin") return null;
  return { bag: y.bag, klinikId: y.klinikId };
}

const UUID = z.string().uuid();

function bosIseUndefined(deger: FormDataEntryValue | null): string | undefined {
  if (deger == null) return undefined;
  const s = String(deger).trim();
  return s === "" ? undefined : s;
}

const gunSemasi = z.object({
  giris_saat: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  cikis_saat: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  mola_dakika: z.coerce.number().int().min(0, "Mola 0'dan küçük olamaz."),
  durum: z.enum(["calisti", "izinli", "raporlu", "gelmedi", "resmi_tatil"]).optional(),
  not_metni: z.string().trim().optional(),
});

export async function gunKaydet(
  personelId: string,
  tarih: string,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return { success: false, message: YETKISIZ_MESAJI };
  if (!UUID.safeParse(personelId).success || !/^\d{4}-\d{2}-\d{2}$/.test(tarih)) {
    return { success: false, message: "Personel bulunamadı." };
  }

  const durumHam = bosIseUndefined(formData.get("durum"));

  const ayristirma = gunSemasi.safeParse({
    giris_saat: bosIseUndefined(formData.get("giris_saat")),
    cikis_saat: bosIseUndefined(formData.get("cikis_saat")),
    mola_dakika: formData.get("mola_dakika") || 0,
    // "otomatik" -> undefined: DB'ye hiç gönderilmez, INSERT'te trigger izinden
    // tespit eder, UPDATE'te mevcut değer dokunulmadan kalır.
    durum: durumHam === "otomatik" ? undefined : durumHam,
    not_metni: bosIseUndefined(formData.get("not_metni")),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { giris_saat, cikis_saat, mola_dakika, durum, not_metni } = ayristirma.data;

  if (giris_saat && cikis_saat && cikis_saat === giris_saat) {
    return { success: false, message: "Giriş ve çıkış saati aynı olamaz." };
  }

  const girisIso = giris_saat ? toUTC(`${tarih}T${giris_saat}:00`) : null;
  let cikisIso: string | null = null;
  if (cikis_saat) {
    // Gece vardiyası: çıkış saati giriş saatinden erkense ertesi güne sarkmış kabul edilir.
    const cikisTarih = giris_saat && cikis_saat < giris_saat ? sonrakiGun(tarih) : tarih;
    cikisIso = toUTC(`${cikisTarih}T${cikis_saat}:00`);
  }

  const degerler = { girisSaat: girisIso, cikisSaat: cikisIso, molaDakika: mola_dakika, notMetni: not_metni ?? null };
  try {
    await withTenant(o.bag, async (tx) => {
      // Personel bu kliniğin mi (RLS başka kliniğinkini göstermez).
      const p = await tx.select({ id: sema.personel.id }).from(sema.personel).where(eq(sema.personel.id, personelId)).limit(1);
      if (p.length === 0) throw new Error("personel_bulunamadi");
      // `durum` verilmezse INSERT'te tetikleyici izinden tespit eder, UPDATE'te mevcut değer korunur.
      await tx
        .insert(sema.personelPuantaj)
        .values({ klinikId: o.klinikId, personelId, tarih, ...degerler, ...(durum ? { durum } : {}) } as typeof sema.personelPuantaj.$inferInsert)
        .onConflictDoUpdate({ target: [sema.personelPuantaj.personelId, sema.personelPuantaj.tarih], set: { ...degerler, ...(durum ? { durum } : {}) } });
    });
  } catch (e) {
    const h = pgHata(e);
    console.error("Puantaj günü kaydedilemedi:", h.mesaj);
    if (h.mesaj.includes("personel_bulunamadi")) return { success: false, message: "Personel bulunamadı." };
    if (h.kod === "42501" || h.mesaj.includes("row-level security")) {
      return { success: false, message: "Bu ay dönemi kapalı olduğu için düzenlenemiyor." };
    }
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/personel/puantaj-cetveli");
  revalidatePath(`/panel/personel/${personelId}`);
  return { success: true, message: "Gün kaydedildi." };
}

export async function fmOnayGuncelle(
  personelId: string,
  puantajId: string,
  yeniDurum: "onaylandi" | "reddedildi" | "bekliyor"
): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return { success: false, message: YETKISIZ_MESAJI };
  if (!UUID.safeParse(puantajId).success || !["onaylandi", "reddedildi", "bekliyor"].includes(yeniDurum)) {
    return { success: false, message: "Kayıt bulunamadı." };
  }

  try {
    const g = await withTenant(o.bag, (tx) => tx.update(sema.personelPuantaj).set({ fmOnayDurumu: yeniDurum }).where(eq(sema.personelPuantaj.id, puantajId)).returning({ id: sema.personelPuantaj.id }));
    if (g.length === 0) return { success: false, message: "Kayıt bulunamadı." };
  } catch (e) {
    console.error("FM onay durumu güncellenemedi:", pgHata(e).mesaj);
    return { success: false, message: "Güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/personel/puantaj-cetveli");
  revalidatePath(`/panel/personel/${personelId}`);
  return { success: true, message: "FM onay durumu güncellendi." };
}

export async function donemKapat(personelId: string, yil: number, ay: number): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return { success: false, message: YETKISIZ_MESAJI };
  if (!UUID.safeParse(personelId).success || !Number.isInteger(yil) || !Number.isInteger(ay) || ay < 1 || ay > 12) {
    return { success: false, message: "Geçersiz dönem." };
  }

  // Hakediş girdileri dönem KAPATILMADAN önce okunur: seans sayımı başarısız olursa
  // dönem kapanıp eksik prim yazılmasın (kapanış geri alınamıyor).
  const ayParam = `${yil}-${String(ay).padStart(2, "0")}`;
  const donemAyi = ayAraligi(ayParam);

  let girdi;
  try {
    girdi = await withTenant(o.bag, async (tx) => {
      const personel = (
        await tx
          .select({ maas: sema.personel.maas, iseGiris: sema.personel.iseGirisTarihi, istenCikis: sema.personel.istenCikisTarihi })
          .from(sema.personel)
          .where(eq(sema.personel.id, personelId))
          .limit(1)
      )[0];
      if (!personel) return null;
      const terapist = (
        await tx
          .select({ id: sema.terapist.id, model: sema.terapist.maasHesaplamaModeli, primSabit: sema.terapist.primSabitTutar, barajSeans: sema.terapist.barajSeansSayisi, barajBonus: sema.terapist.barajBonusTutari })
          .from(sema.terapist)
          .where(eq(sema.terapist.personelId, personelId))
          .limit(1)
      )[0];
      // Hakediş o ayın maaşıyla (ayın son günü itibarıyla geçerli) — personel.maas güncel değerdir.
      const guncelMaas = personel.maas === null ? null : Number(personel.maas);
      const gecmis = await maasGecmisiGetirTx(tx, [personelId]);
      const maas = donemMaasi(gecmis.get(personelId), guncelMaas, donemAyi.bitisTarih);
      let seans = 0;
      if (terapist) {
        const sayilar = await seansSayilariniGetirTx(tx, [{ terapistId: terapist.id, personelId, istenCikisTarihi: personel.istenCikis }], ayParam);
        seans = sayilar.get(personelId) ?? 0;
      }
      return { personel, terapist, maas, seans };
    });
  } catch (hata) {
    console.error("Dönem kapatma: hakediş girdileri okunamadı:", pgHata(hata).mesaj);
    return { success: false, message: "Maaş geçmişi/seans sayısı okunamadı, dönem kapatılmadı. Lütfen tekrar deneyin." };
  }
  if (!girdi) return { success: false, message: "Personel bulunamadı." };
  const { personel, terapist } = girdi;

  let donemId: string | undefined;
  try {
    const r = await withTenant(o.bag, (tx) =>
      rpc<{ personel_puantaj_donem_kapat: { donem_id: string } | null }>(tx, "personel_puantaj_donem_kapat", { p_personel_id: personelId, p_yil: yil, p_ay: ay })
    );
    donemId = r[0]?.personel_puantaj_donem_kapat?.donem_id;
  } catch (e) {
    const m = pgHata(e).mesaj;
    console.error("Dönem kapatılamadı:", m);
    return { success: false, message: m.includes("donem_zaten_kapali") ? "Bu dönem zaten kapalı." : "Dönem kapatılamadı, lütfen tekrar deneyin." };
  }

  // Taban hakediş (+varsa prim) — formül lib/personel/hakedis.ts'te TEK yerde, SQL'de tekrarlanmıyor; burada hesaplanıp dar kapsamlı
  // (kayıt + idempotency) ikinci bir RPC'ye parametre olarak geçirilir. Tutarlar kuruşa yuvarlanmış iki ondalıklı metin.
  if (donemId) {
    const hesap = hakedisHesapla({
      personelMaasi: girdi.maas,
      fmSaatlikUcret: null, // mesai tutarı RPC'nin kendisinde ayrıca (fm_saatlik_ucret ile) hesaplanıyor, burada 0 sayılıyor.
      terapistAyarlari: terapist
        ? {
            maas_hesaplama_modeli: terapist.model as MaasHesaplamaModeli,
            prim_sabit_tutar: terapist.primSabit === null ? null : Number(terapist.primSabit),
            baraj_seans_sayisi: terapist.barajSeans,
            baraj_bonus_tutari: terapist.barajBonus === null ? null : Number(terapist.barajBonus),
          }
        : null,
      tamamlananSeansSayisi: girdi.seans,
      onayliFmSaat: 0,
      ayBaslangicTarih: donemAyi.baslangicTarih,
      ayBitisTarihExclusive: donemAyi.bitisTarih,
      iseGirisTarihi: personel.iseGiris,
      istenCikisTarihi: personel.istenCikis,
    });

    let hesapHatasi: string | null = null;
    try {
      await withTenant(o.bag, (tx) =>
        rpc(tx, "personel_hesap_hareket_donem_ekle", { p_donem_id: donemId, p_hakedis_tutar: kurusMetni(kurus(hesap.taban) ?? 0), p_prim_tutar: kurusMetni(kurus(hesap.prim) ?? 0) })
      );
    } catch (e) {
      hesapHatasi = pgHata(e).mesaj;
    }

    revalidatePath("/panel/personel/puantaj-cetveli");
    revalidatePath(`/panel/personel/${personelId}`);

    // 'zaten_islendi' beklenen bir durum (dönem yeniden kapatılırsa) — sessizce yok sayılır. GERÇEK bir hata ise dönem yine de kapandı
    // ama hakediş yazılmamış olabilir — kullanıcıya açıkça bildirilir.
    if (hesapHatasi && !hesapHatasi.includes("zaten_islendi")) {
      console.error("Dönem hakedişi işlenemedi:", hesapHatasi);
      return {
        success: true,
        message:
          "Dönem kapatıldı ama hakediş satırı yazılamadı. Dönemi \"Yeniden Aç\" ile açıp tekrar kapatın (hakediş elle eklenemez).",
      };
    }
  } else {
    revalidatePath("/panel/personel/puantaj-cetveli");
    revalidatePath(`/panel/personel/${personelId}`);
  }

  return { success: true, message: "Dönem kapatıldı." };
}

export async function donemYenidenAc(personelId: string, yil: number, ay: number): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return { success: false, message: YETKISIZ_MESAJI };
  if (!UUID.safeParse(personelId).success || !Number.isInteger(yil) || !Number.isInteger(ay) || ay < 1 || ay > 12) {
    return { success: false, message: "Geçersiz dönem." };
  }

  try {
    await withTenant(o.bag, (tx) => rpc(tx, "personel_puantaj_donem_yeniden_ac", { p_personel_id: personelId, p_yil: yil, p_ay: ay }));
  } catch (e) {
    console.error("Dönem yeniden açılamadı:", pgHata(e).mesaj);
    return { success: false, message: "Dönem yeniden açılamadı, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/personel/puantaj-cetveli");
  revalidatePath(`/panel/personel/${personelId}`);
  return { success: true, message: "Dönem yeniden açıldı." };
}
