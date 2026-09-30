import { YONTEM_ETIKETLERI } from "@/types/odeme";

/**
 * Denetim Geçmişi (klinik_admin) gösterim yardımcıları — audit_log satırını
 * insan okur özete çevirir. Saf fonksiyonlar (Supabase'e dokunmaz).
 *
 * İKİ detay şekli var:
 *  - v1 (eski audit_log_yaz): `detay` = tüm satır kopyası (UPDATE'te yalnız YENİ).
 *  - v2 (audit_log_degisiklik_yaz, migration 20260930100000): `surum: 2`,
 *    `degisen_alanlar`, `eski`/`yeni` (yalnız değişenler), üstte `hasta_id` bağlamı.
 */

export type DenetimGrubu = "finans" | "hasta" | "diger";

export const DENETIM_GRUP_ETIKETLERI: Record<DenetimGrubu, string> = {
  finans: "Finans",
  hasta: "Hasta",
  diger: "Personel & Diğer",
};

/** Gruplandırma AÇIK liste — tanımsız bir tablo otomatik "diger" grubuna düşer. */
export const DENETIM_GRUP_TABLOLARI: Record<Exclude<DenetimGrubu, "diger">, string[]> = {
  finans: [
    "hasta_bakiye_hareket",
    "fatura",
    "klinik_harcama",
    "kamusal_odeme",
    "nakit_banka_hareketi",
    "paket_satis",
    "personel_hesap_hareket",
  ],
  hasta: [
    "hasta",
    "hasta_hassas",
    "hasta_anamnez",
    "hasta_olcum",
    "hasta_hedef",
    "hasta_belge",
    "hasta_onam",
    "hasta_vucut_haritasi_isareti",
    "hasta_protokol",
    "ev_egzersiz_takip",
    "randevu_on_form",
  ],
};

export const DENETIM_TABLO_ETIKETLERI: Record<string, string> = {
  hasta_bakiye_hareket: "Cari hareket",
  fatura: "Fatura",
  klinik_harcama: "Gider",
  kamusal_odeme: "Kamusal ödeme",
  nakit_banka_hareketi: "Kasa/Banka hareketi",
  paket_satis: "Paket satışı",
  personel_hesap_hareket: "Personel cari hareketi",
  hasta: "Hasta bilgisi",
  hasta_hassas: "Hasta detay bilgisi",
  hasta_anamnez: "Anamnez",
  hasta_olcum: "Ölçüm",
  hasta_hedef: "Hasta hedefi",
  hasta_belge: "Hasta belgesi",
  hasta_onam: "Onam formu",
  hasta_vucut_haritasi_isareti: "Vücut haritası",
  hasta_protokol: "Hasta protokolü",
  ev_egzersiz_takip: "Ev egzersizi",
  randevu_on_form: "Randevu ön formu",
  personel_puantaj: "Puantaj",
  personel_puantaj_donem: "Puantaj dönemi",
  personel_izin_talebi: "İzin talebi",
  personel_hassas: "Personel kimlik bilgisi",
  personel_vardiya_atama: "Vardiya ataması",
  terapist_izin: "Terapist izni",
};

export const DENETIM_EYLEM_ETIKETLERI: Record<string, string> = {
  insert: "Ekledi",
  update: "Güncelledi",
  delete: "Sildi",
  select: "Görüntüledi",
};

export type EylemTonu = "emerald" | "sky" | "rose" | "slate";
export const DENETIM_EYLEM_TONLARI: Record<string, EylemTonu> = {
  insert: "emerald",
  update: "sky",
  delete: "rose",
  select: "slate",
};

/**
 * Alan DEĞERLERİNİN gösterilebildiği tablolar. VARSAYILAN GİZLİ (izin listesi):
 * anamnez, ölçüm, belge, onam, vücut haritası, kimlik/adres (hasta_hassas,
 * personel_hassas) gibi sağlık/kimlik verisi içeren tablolarda paneli açan
 * kişi de "kim/ne zaman/hangi kayıt"ı görür ama içeriği görmez — audit_log'un
 * ikinci bir sağlık verisi görüntüleme yolu olmasın (KVKK). Yeni bir tablo
 * denetime bağlanırsa değeri GÖSTERİLMEZ, bilinçli olarak buraya eklenmedikçe.
 */
const DEGER_GOSTERILEN_TABLOLAR = new Set([
  "hasta_bakiye_hareket",
  "fatura",
  "klinik_harcama",
  "kamusal_odeme",
  "nakit_banka_hareketi",
  "paket_satis",
  "personel_hesap_hareket",
  "hasta",
]);

const TEKNIK_ALANLAR = new Set(["id", "klinik_id", "created_at", "updated_at"]);

const ALAN_ETIKETLERI: Record<string, string> = {
  tutar: "Tutar",
  iskonto_tutari: "İskonto",
  tur: "Tür",
  aciklama: "Açıklama",
  odeme_yontemi: "Ödeme yöntemi",
  belge_turu: "Belge türü",
  faturali: "Faturalı",
  is_faturali: "Faturalı",
  fatura_no: "Fatura no",
  kategori: "Kategori",
  tarih: "Tarih",
  tedarikci_adi: "Tedarikçi",
  odeme_tipi: "Ödeme tipi",
  kalan_adet: "Kalan adet",
  durum: "Durum",
  tip: "Tip",
  ad_soyad: "Ad soyad",
  telefon: "Telefon",
  eposta: "E-posta",
  dogum_tarihi: "Doğum tarihi",
  kategori_adi: "Kategori",
  aktif: "Aktif",
  risk_bayraklari: "Risk bayrakları",
};

const YONTEM_DEGERLERI: Record<string, string> = {
  ...YONTEM_ETIKETLERI,
  havale: "Havale",
};

export function denetimGrubuBul(tablo: string | null): DenetimGrubu {
  if (!tablo) return "diger";
  if (DENETIM_GRUP_TABLOLARI.finans.includes(tablo)) return "finans";
  if (DENETIM_GRUP_TABLOLARI.hasta.includes(tablo)) return "hasta";
  return "diger";
}

export function alanEtiketi(alan: string): string {
  if (ALAN_ETIKETLERI[alan]) return ALAN_ETIKETLERI[alan];
  const acik = alan.replace(/_/g, " ");
  return acik.charAt(0).toLocaleUpperCase("tr-TR") + acik.slice(1);
}

const paraFormat = (tutar: number) => tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

function tutarAlaniMi(alan: string) {
  return alan === "tutar" || alan.endsWith("_tutari") || alan.endsWith("_tutar");
}

export function degerMetni(alan: string, deger: unknown): string {
  if (deger === null || deger === undefined || deger === "") return "—";
  if (typeof deger === "boolean") return deger ? "Evet" : "Hayır";
  if (typeof deger === "number") return tutarAlaniMi(alan) ? paraFormat(deger) : String(deger);
  if (typeof deger === "string") {
    if (tutarAlaniMi(alan) && !Number.isNaN(Number(deger))) return paraFormat(Number(deger));
    if ((alan === "odeme_yontemi" || alan === "odeme_tipi") && YONTEM_DEGERLERI[deger]) return YONTEM_DEGERLERI[deger];
    return deger.length > 80 ? `${deger.slice(0, 80)}…` : deger;
  }
  const json = JSON.stringify(deger);
  return json.length > 80 ? `${json.slice(0, 80)}…` : json;
}

export type DenetimDetaySatiri = { alan: string; eski?: string; yeni?: string };

export type DenetimOzeti = {
  /** Ekranda gösterilecek alan/değer satırları; boşsa detay yok. */
  satirlar: DenetimDetaySatiri[];
  /** Değer gösterilmeyen tablolarda "şu alanlar değişti" (yalnız alan adları). */
  degisenAlanlar: string[];
  /** Değer gösterimi bilinçli kapalı (hassas tablo). */
  degerGizli: boolean;
  /** Eski (v1) kayıt: UPDATE'te neyin değiştiği bilinmez, yalnız yeni durum vardır. */
  eskiSurum: boolean;
};

type DenetimKaydi = { eylem: string; hedef_tablo: string | null; detay: unknown };

function nesneMi(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function denetimOzetiOlustur(kayit: DenetimKaydi): DenetimOzeti {
  const tablo = kayit.hedef_tablo ?? "";
  const degerGoster = DEGER_GOSTERILEN_TABLOLAR.has(tablo);
  const detay = nesneMi(kayit.detay) ? kayit.detay : {};
  const v2 = detay.surum === 2;

  const bos: DenetimOzeti = { satirlar: [], degisenAlanlar: [], degerGizli: !degerGoster, eskiSurum: !v2 };

  if (kayit.eylem === "select") return { ...bos, degerGizli: false };

  if (v2) {
    const degisenAlanlar = Array.isArray(detay.degisen_alanlar)
      ? (detay.degisen_alanlar as unknown[]).filter((a): a is string => typeof a === "string")
      : [];
    if (!degerGoster) {
      return { ...bos, degisenAlanlar: degisenAlanlar.filter((a) => !TEKNIK_ALANLAR.has(a)) };
    }
    const eski = nesneMi(detay.eski) ? detay.eski : {};
    const yeni = nesneMi(detay.yeni) ? detay.yeni : {};

    if (kayit.eylem === "update") {
      return {
        ...bos,
        satirlar: degisenAlanlar
          .filter((a) => !TEKNIK_ALANLAR.has(a))
          .map((alan) => ({ alan, eski: degerMetni(alan, eski[alan]), yeni: degerMetni(alan, yeni[alan]) })),
      };
    }
    // insert / delete: dolu, teknik olmayan, *_id olmayan alanların özeti
    const kaynak = kayit.eylem === "delete" ? eski : yeni;
    const satirlar = Object.entries(kaynak)
      .filter(([alan, deger]) => !TEKNIK_ALANLAR.has(alan) && !alan.endsWith("_id") && deger !== null && deger !== "")
      .slice(0, 8)
      .map(([alan, deger]) => ({ alan, yeni: degerMetni(alan, deger) }));
    return { ...bos, satirlar };
  }

  // v1: detay tüm satır kopyası. Yalnız izinli tablolarda ve ekleme/silmede özetle;
  // güncellemede neyin değiştiği bilinmediği için değer listelenmez (yanıltıcı olurdu).
  if (degerGoster && kayit.eylem !== "update") {
    const satirlar = Object.entries(detay)
      .filter(([alan, deger]) => !TEKNIK_ALANLAR.has(alan) && !alan.endsWith("_id") && deger !== null && deger !== "")
      .slice(0, 8)
      .map(([alan, deger]) => ({ alan, yeni: degerMetni(alan, deger) }));
    return { ...bos, satirlar };
  }
  return bos;
}

/** Kaydın ait olduğu hastanın id'si (varsa): v2 bağlam alanı, v1 satır kopyası veya hedefin kendisi. */
export function denetimHastaId(kayit: { hedef_tablo: string | null; hedef_id: string | null; detay: unknown }): string | null {
  const detay = nesneMi(kayit.detay) ? kayit.detay : {};
  if (typeof detay.hasta_id === "string") return detay.hasta_id;
  if (kayit.hedef_tablo === "hasta" || kayit.hedef_tablo === "hasta_hassas") return kayit.hedef_id;
  return null;
}
