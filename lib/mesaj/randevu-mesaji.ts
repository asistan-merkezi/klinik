import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/datetime";
import { anlikMesajTetikle } from "./anlik-tetikle";
import {
  HATIRLATMA_KURALLARI,
  hatirlatmaGerekliMi,
  hatirlatmaPenceresi,
  randevuMesajAnahtari,
  type RandevuHatirlatmaKodu,
  type RandevuOlayKodu,
} from "./randevu-hatirlatma-kurali";

type AdminClient = ReturnType<typeof createAdminClient>;

type RandevuMesajSatiri = {
  id: string;
  klinik_id: string;
  baslangic: string;
  created_at: string;
  durum: string;
  iptal_tarihi: string | null;
  hasta: {
    id: string;
    ad_soyad: string;
    telefon: string | null;
    eposta: string | null;
    whatsapp_izin_durumu: boolean;
  } | null;
  terapist: { personel: { ad_soyad: string } | { ad_soyad: string }[] | null } | null;
};

const RANDEVU_MESAJ_SELECT =
  "id, klinik_id, baslangic, created_at, durum, iptal_tarihi, " +
  "hasta:hasta_id(id, ad_soyad, telefon, eposta, whatsapp_izin_durumu), " +
  "terapist:terapist_id(personel:personel_id(ad_soyad))";

function terapistAdi(r: RandevuMesajSatiri): string {
  const p = r.terapist?.personel;
  const personel = Array.isArray(p) ? p[0] : p;
  return personel?.ad_soyad ?? "";
}

async function klinikAdlariniGetir(admin: AdminClient, klinikIdler: string[]): Promise<Map<string, string>> {
  const benzersiz = [...new Set(klinikIdler)];
  if (benzersiz.length === 0) return new Map();
  const { data } = await admin.from("klinik").select("id, ad").in("id", benzersiz);
  return new Map((data ?? []).map((k) => [k.id as string, (k.ad as string) ?? ""]));
}

async function satiriKuyrugaYaz(
  admin: AdminClient,
  kod: RandevuOlayKodu,
  r: RandevuMesajSatiri,
  klinikAdi: string,
  ekDegiskenler: Record<string, string> = {},
  /** Anahtar için ayrı durum/başlangıç gerekirse (ör. ertelemede yeni saat). */
  anahtarSatiri?: { baslangic: string; durum?: string | null; iptal_tarihi?: string | null }
): Promise<void> {
  if (!r.hasta) return;
  await anlikMesajTetikle(admin, {
    klinikId: r.klinik_id,
    tetikleyiciKodu: kod,
    aliciTipi: "hasta",
    aliciId: r.hasta.id,
    adres: {
      telefon: r.hasta.telefon,
      eposta: r.hasta.eposta,
      whatsappIzni: r.hasta.whatsapp_izin_durumu,
    },
    degiskenler: {
      hasta_adi: r.hasta.ad_soyad,
      randevu_tarihi: formatDateTime(r.baslangic),
      terapist_adi: terapistAdi(r),
      klinik_adi: klinikAdi,
      ...ekDegiskenler,
    },
    idempotencyTemeli: randevuMesajAnahtari(kod, { id: r.id, ...(anahtarSatiri ?? r) }),
  });
}

/**
 * Bir randevu OLAYI (oluşturma/iptal/erteleme/gelmedi) sonrası hastaya hizmet mesajını kuyruğa yazar.
 * Best-effort: hata asla çağıran işlemi (randevu zaten kaydedildi) bozmaz, yalnız loglanır.
 * Kural yoksa/pasifse (`mesaj_kurallari`) ya da hastanın adresi yoksa sessizce atlanır.
 *
 * `erteleme`: yeni başlangıç verilirse mesaj "ertelendi" olarak, ESKİ tarih + yeni tarihle gider.
 */
export async function randevuOlayMesajiTetikle(
  randevuId: string,
  kod: "randevu_onay" | "randevu_iptal" | "randevu_gelmedi",
  secenekler: { eskiBaslangic?: string } = {}
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("randevu")
      .select(RANDEVU_MESAJ_SELECT)
      .eq("id", randevuId)
      .maybeSingle<RandevuMesajSatiri>();
    if (!data) return;

    const klinikler = await klinikAdlariniGetir(admin, [data.klinik_id]);
    const klinikAdi = klinikler.get(data.klinik_id) ?? "";

    if (kod === "randevu_iptal") {
      const ertelendi = data.durum === "ertelendi" && secenekler.eskiBaslangic;
      await satiriKuyrugaYaz(
        admin,
        kod,
        { ...data, baslangic: ertelendi ? secenekler.eskiBaslangic! : data.baslangic },
        klinikAdi,
        { randevu_durumu: ertelendi ? `${formatDateTime(data.baslangic)} tarihine ertelendi` : "iptal edildi" },
        // Anahtar: erteleme için YENİ saat (her erteleme ayrı bildirim), iptal için iptal zamanı.
        { baslangic: data.baslangic, durum: data.durum, iptal_tarihi: data.iptal_tarihi }
      );
      return;
    }

    await satiriKuyrugaYaz(admin, kod, data, klinikAdi);
  } catch (hata) {
    console.error(`[mesaj] randevu mesajı kuyruğa yazılamadı (${kod}, randevu ${randevuId}):`, hata);
  }
}

/**
 * Zamanlanmış hatırlatmalar (1 gün / 2 saat önce): pencerede olan, hâlâ 'planlandi' ve yeterince önceden
 * alınmış randevular için kuyruğa yazar. mesaj-kuyruk-isle cron'unun (5 dk) başında çağrılır; aynı randevu
 * için tekrar çağrılsa da idempotency anahtarı tek mesaj bırakır. Kural pasifse hiç sorgu atılmaz.
 */
export async function randevuHatirlatmalariniTara(
  admin: AdminClient,
  simdi: Date = new Date()
): Promise<{ kod: RandevuHatirlatmaKodu; tarananRandevu: number }[]> {
  const sonuclar: { kod: RandevuHatirlatmaKodu; tarananRandevu: number }[] = [];

  for (const kod of Object.keys(HATIRLATMA_KURALLARI) as RandevuHatirlatmaKodu[]) {
    // Aktif kural yoksa hiçbir klinik için yapılacak iş yok.
    const { data: kurallar } = await admin
      .from("mesaj_kurallari")
      .select("klinik_id")
      .eq("tetikleyici_kodu", kod)
      .eq("aktif", true);
    const klinikIdler = (kurallar ?? []).map((k) => k.klinik_id as string);
    if (klinikIdler.length === 0) {
      sonuclar.push({ kod, tarananRandevu: 0 });
      continue;
    }

    const pencere = hatirlatmaPenceresi(kod, simdi);
    const { data: randevular, error } = await admin
      .from("randevu")
      .select(RANDEVU_MESAJ_SELECT)
      .in("klinik_id", klinikIdler)
      .eq("durum", "planlandi")
      .gt("baslangic", pencere.alt)
      .lte("baslangic", pencere.ust)
      .limit(500)
      .returns<RandevuMesajSatiri[]>();

    if (error) {
      console.error(`[mesaj] hatırlatma taraması başarısız (${kod}):`, error.message);
      continue;
    }

    const uygun = (randevular ?? []).filter((r) => hatirlatmaGerekliMi(kod, r));
    const klinikler = await klinikAdlariniGetir(admin, uygun.map((r) => r.klinik_id));
    for (const r of uygun) {
      try {
        await satiriKuyrugaYaz(admin, kod, r, klinikler.get(r.klinik_id) ?? "");
      } catch (hata) {
        console.error(`[mesaj] hatırlatma yazılamadı (${kod}, randevu ${r.id}):`, hata);
      }
    }
    sonuclar.push({ kod, tarananRandevu: uygun.length });
  }

  return sonuclar;
}
