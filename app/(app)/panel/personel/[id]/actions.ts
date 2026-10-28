"use server";

import { bugunIstanbulTarihi, formatDateForInput } from "@/lib/datetime";
import { bankaHesabiHatasiniCevir, havaleHesapEksikMi, HAVALE_HESAP_GEREKLI_MESAJI } from "@/lib/finans/banka-hesabi-kurali";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, count, eq } from "drizzle-orm";
import { pgHata, rpc, sema, withTenant } from "@/lib/db";
import { eylemYetkisi, YETKISIZ_MESAJI } from "@/lib/auth/yetki";
import { islemAnahtariniKaydet, islemAnahtariniOku } from "@/lib/finans/idempotans";
import { negatifOlmayanTutarKurus, pozitifTutarKurus } from "@/lib/finans/tutar";
import { kurus, kurusMetni } from "@/lib/para";

type SonucDurumu = { success: boolean; message: string } | null;

function bosIseNull(deger: FormDataEntryValue | null) {
  if (deger == null) return null;
  const s = String(deger).trim();
  return s === "" ? null : s;
}

/** Boş = değer yok (null); dolu ise negatif olmayan tutar (kuruş). */
const opsiyonelTutar = (mesaj: string) => z.union([z.null(), negatifOlmayanTutarKurus(mesaj)]);

// Hesaplama Modeli artık ayrı seçtirilmiyor — Çalışma Tipi (İş Bilgileri)
// ile aynı bilgiyi tekrar sormak kullanıcı kararıyla kaldırıldı: "prim_usulu"
// çalışma tipi ise İşlem Başı Prim, aksi halde Sabit maaş uygulanır (bkz.
// calismaTipindenHesaplamaModeli). Barajlı Prim modu bu yüzden UI'dan
// erişilemez hale geldi — mevcut barajlı terapistlerin verisi DB'de duruyor
// ama Maaş Ayarları kaydedildiğinde üzerine yazılır.
const maasAyarSemasi = z.object({
  maas: opsiyonelTutar("Maaş 0'dan küçük olamaz."),
  prim_sabit_tutar: opsiyonelTutar("Prim tutarı 0'dan küçük olamaz."),
  fm_saatlik_ucret: opsiyonelTutar("Fazla mesai ücreti 0'dan küçük olamaz."),
});

function calismaTipindenHesaplamaModeli(calismaTipi: string | null): "sabit" | "islem_basi_prim" {
  return calismaTipi === "prim_usulu" ? "islem_basi_prim" : "sabit";
}

const hesapHareketSemasi = z.object({
  tur: z.enum(["prim", "yol", "yemek", "mesai", "avans", "kesinti", "odeme"]),
  tutar: pozitifTutarKurus(),
  tarih: z.string().min(1, "Tarih seçilmeli."),
  aciklama: z.string().trim().optional(),
  odeme_tipi: z.enum(["nakit", "havale"]).optional().or(z.literal("")),
  banka_hesap_id: z.string().trim().optional(),
});

/** Personel maaş / cari hesap işlemleri yalnız klinik_admin (RPC ve RLS içeride aynı kuralı zorlar). */
async function adminOturumu() {
  const y = await eylemYetkisi(["klinik_admin"]);
  if (!y.yetkili || !y.bag || !y.klinikId || y.ctx.rol !== "klinik_admin") return null;
  return { bag: y.bag, klinikId: y.klinikId, kullaniciId: y.ctx.userId };
}

const UUID = z.string().uuid();

export async function maasAyarlariGuncelle(
  personelId: string,
  terapistId: string,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return { success: false, message: YETKISIZ_MESAJI };
  if (!UUID.safeParse(personelId).success || !UUID.safeParse(terapistId).success) {
    return { success: false, message: "Personel bulunamadı." };
  }

  const ayristirma = maasAyarSemasi.safeParse({
    maas: bosIseNull(formData.get("maas")),
    prim_sabit_tutar: bosIseNull(formData.get("prim_sabit_tutar")),
    fm_saatlik_ucret: bosIseNull(formData.get("fm_saatlik_ucret")),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { maas, prim_sabit_tutar, fm_saatlik_ucret } = ayristirma.data;
  const tl = (k: number | null) => (k === null ? null : kurusMetni(k));

  try {
    // Personel + terapist ayarı + maaş geçmişi TEK transaction (eskiden bağımsız çağrılardı, geçmiş hatası yutuluyordu).
    const hata = await withTenant(o.bag, async (tx) => {
      const eski = (
        await tx
          .select({ maas: sema.personel.maas, calismaTipi: sema.personel.calismaTipi, iseGiris: sema.personel.iseGirisTarihi, createdAt: sema.personel.createdAt })
          .from(sema.personel)
          .where(eq(sema.personel.id, personelId))
          .limit(1)
      )[0];
      if (!eski) return "Personel bulunamadı.";
      const terapist = await tx.select({ id: sema.terapist.id }).from(sema.terapist).where(and(eq(sema.terapist.id, terapistId), eq(sema.terapist.personelId, personelId))).limit(1);
      if (terapist.length === 0) return "Terapist kaydı bulunamadı.";

      await tx.update(sema.personel).set({ maas: tl(maas), fmSaatlikUcret: tl(fm_saatlik_ucret) }).where(eq(sema.personel.id, personelId));
      await tx
        .update(sema.terapist)
        .set({ maasHesaplamaModeli: calismaTipindenHesaplamaModeli(eski.calismaTipi), primSabitTutar: tl(prim_sabit_tutar) })
        .where(eq(sema.terapist.id, terapistId));

      // Maaş fiilen değiştiyse geçmişe bir satır düşülür (prim ayarı değişse bile maaş aynıysa gereksiz satır eklenmez).
      // Geçerlilik tarihi her zaman bugün (İstanbul).
      if (maas !== null && maas !== (kurus(eski.maas) ?? null)) {
        // Geçmişte hiç satır yoksa eski maaş da (işe girişten geçerli) kaydedilir — yoksa hakediş hesabı zamdan önceki ayları da yeni maaşla hesaplardı.
        if (eski.maas !== null) {
          const [{ n }] = await tx.select({ n: count() }).from(sema.personelUcret).where(eq(sema.personelUcret.personelId, personelId));
          if (n === 0) {
            await tx.insert(sema.personelUcret).values({
              klinikId: o.klinikId,
              personelId,
              maas: eski.maas,
              gecerlilikTarihi: eski.iseGiris ?? formatDateForInput(eski.createdAt),
              ekleyenKullaniciId: o.kullaniciId,
            });
          }
        }
        await tx.insert(sema.personelUcret).values({
          klinikId: o.klinikId,
          personelId,
          maas: kurusMetni(maas),
          gecerlilikTarihi: bugunIstanbulTarihi(),
          ekleyenKullaniciId: o.kullaniciId,
        });
      }
      return null;
    });
    if (hata) return { success: false, message: hata };
  } catch (e) {
    console.error("Maaş ayarları güncellenemedi:", pgHata(e).mesaj);
    return { success: false, message: "Maaş ayarları güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath(`/panel/personel/${personelId}`);
  return { success: true, message: "Maaş ayarları güncellendi." };
}

/**
 * Cari hesap defterine manuel hareket — 'hakedis' HARİÇ (o sadece dönem
 * kapanışında otomatik yazılır, bkz. personel_hesap_hareket_ekle RPC'sinin
 * kendi reddi — burada da aynı kural zod enum'unda tekrarlanıyor, çift katman).
 * Çift gönderim koruması: istek anahtarı hareketle AYNI transaction'da (lib/finans/idempotans.ts).
 */
export async function hesapHareketiEkle(
  personelId: string,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return { success: false, message: YETKISIZ_MESAJI };
  if (!UUID.safeParse(personelId).success) return { success: false, message: "Personel bulunamadı." };

  const ayristirma = hesapHareketSemasi.safeParse({
    tur: formData.get("tur"),
    tutar: formData.get("tutar"),
    tarih: formData.get("tarih"),
    aciklama: formData.get("aciklama") ?? "",
    odeme_tipi: formData.get("odeme_tipi") ?? "",
    banka_hesap_id: formData.get("banka_hesap_id") ?? "",
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { tur, tutar, tarih, aciklama, odeme_tipi, banka_hesap_id } = ayristirma.data;
  if (havaleHesapEksikMi(odeme_tipi, banka_hesap_id)) {
    return { success: false, message: HAVALE_HESAP_GEREKLI_MESAJI };
  }
  if (odeme_tipi === "havale" && !UUID.safeParse(banka_hesap_id).success) {
    return { success: false, message: HAVALE_HESAP_GEREKLI_MESAJI };
  }

  const anahtar = islemAnahtariniOku(formData);
  try {
    await withTenant(o.bag, async (tx) => {
      if (!(await islemAnahtariniKaydet(tx, o.klinikId, anahtar, "personel_hesap_hareketi", o.kullaniciId))) return;
      // RPC rol + tenant + personel sahipliği + hesap bütünlüğünü kendisi doğrular.
      await rpc(tx, "personel_hesap_hareket_ekle", {
        p_personel_id: personelId,
        p_tur: tur,
        p_tutar: kurusMetni(tutar),
        p_tarih: tarih,
        p_aciklama: aciklama ? aciklama : null,
        p_odeme_tipi: odeme_tipi ? odeme_tipi : null,
        p_banka_hesap_id: odeme_tipi === "havale" && banka_hesap_id ? banka_hesap_id : null,
      });
    });
  } catch (e) {
    const m = pgHata(e).mesaj;
    console.error("Hesap hareketi eklenemedi:", m);
    return { success: false, message: bankaHesabiHatasiniCevir(m) ?? "Hareket eklenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath(`/panel/personel/${personelId}`);
  return { success: true, message: "Hareket eklendi." };
}
