import type { createAdminClient } from "@/lib/supabase/admin";
import { TETIKLEYICILER } from "./tetikleyiciler";
import type { MesajKanal } from "@/types/mesajlasma";

type AdminClient = ReturnType<typeof createAdminClient>;

type AliciAdres = { telefon: string | null; eposta: string | null };

/**
 * "anlik" tetikleme tipindeki bir olay gerçekleştiğinde mesaj_kuyrugu'na satır
 * ekler — Faz 4'ün (projede daha önce hiç yazılmamış) olay-tetikleme kod
 * yoluna ait TEK ortak fonksiyon. `hasta_belge_goruntule` deseniyle aynı ruh:
 * Postgres'te "bir şey oldu, dışarı bildir" için trigger yeterli değil (mesaj
 * göndermek bir yan etki, DB transaction'ının parçası olmamalı), bu yüzden
 * TS katmanında, RPC başarıyla döndükten SONRA çağrılır.
 *
 * Aktif değilse (kural yok veya aktif=false) veya adres eksikse SESSİZCE atlar
 * — bu "hata" değil, mesajlaşma modülünün Faz 1'den beri kurallı davranışı
 * (bkz. lib/mesaj/kural-cozumle.ts'teki "kayıt yoksa pasif" ilkesi).
 */
export async function anlikMesajTetikle(
  admin: AdminClient,
  params: {
    klinikId: string;
    tetikleyiciKodu: string;
    aliciTipi: "personel";
    aliciId: string;
    adres: AliciAdres;
    degiskenler: Record<string, string>;
  }
): Promise<void> {
  const tanim = TETIKLEYICILER.find((t) => t.kod === params.tetikleyiciKodu);
  if (!tanim) {
    console.error(`[mesaj] bilinmeyen tetikleyici kodu: ${params.tetikleyiciKodu}`);
    return;
  }

  const { data: kural } = await admin
    .from("mesaj_kurallari")
    .select("aktif, sms_aktif, whatsapp_aktif, mail_aktif, mesaj_metni")
    .eq("klinik_id", params.klinikId)
    .eq("tetikleyici_kodu", params.tetikleyiciKodu)
    .maybeSingle();

  if (!kural || !kural.aktif) return;

  const metinDoldur = (sablon: string) =>
    sablon.replace(/\{\{(\w+)\}\}/g, (tam, ad) => params.degiskenler[ad] ?? tam);

  const metin = metinDoldur(kural.mesaj_metni || tanim.varsayilanMesajMetni);

  const kanallar: { kanal: MesajKanal; aktif: boolean; adres: string | null }[] = [
    { kanal: "sms", aktif: kural.sms_aktif, adres: params.adres.telefon },
    { kanal: "whatsapp", aktif: kural.whatsapp_aktif, adres: params.adres.telefon },
    { kanal: "mail", aktif: kural.mail_aktif, adres: params.adres.eposta },
  ];

  for (const k of kanallar) {
    if (!k.aktif || !k.adres) continue;

    const idempotencyAnahtari = `${params.tetikleyiciKodu}:${params.aliciId}:${k.kanal}:${Date.now()}`;

    const { error } = await admin.from("mesaj_kuyrugu").insert({
      klinik_id: params.klinikId,
      tetikleyici_kodu: params.tetikleyiciKodu,
      kanal: k.kanal,
      alici_tipi: params.aliciTipi,
      alici_id: params.aliciId,
      alici_adres: k.adres,
      gonderilecek_metin: metin,
      idempotency_anahtari: idempotencyAnahtari,
    });

    if (error) {
      console.error(`[mesaj] mesaj_kuyrugu insert hatası (${params.tetikleyiciKodu}/${k.kanal}):`, error.message);
    }
  }
}

/** Bir kliniğin klinik_admin rolündeki, personel kaydı olan üyeleri — izin talebi bildirimi gibi "yöneticiye" olaylar için. */
export async function klinikAdminleriniGetir(
  admin: AdminClient,
  klinikId: string
): Promise<{ personelId: string; telefon: string | null; eposta: string | null }[]> {
  const { data: adminKullanicilar } = await admin
    .from("kullanici")
    .select("id")
    .eq("klinik_id", klinikId)
    .eq("rol", "klinik_admin");

  const kullaniciIdler = (adminKullanicilar ?? []).map((k) => k.id);
  if (kullaniciIdler.length === 0) return [];

  const { data: personeller } = await admin
    .from("personel")
    .select("id, eposta, kullanici:kullanici_id(telefon)")
    .in("kullanici_id", kullaniciIdler)
    .eq("aktif", true);

  return (personeller ?? []).map((p) => {
    const kullanici = (Array.isArray(p.kullanici) ? p.kullanici[0] : p.kullanici) as { telefon: string | null } | null;
    return { personelId: p.id, telefon: kullanici?.telefon ?? null, eposta: p.eposta };
  });
}
