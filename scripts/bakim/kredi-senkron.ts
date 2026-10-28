// Saatte bir: mevcut mesaj_kredileri satırlarının her biri için merkezden güncel bakiyeyi çekip mesaj_kredi_senkronla ile yazar (versiyon guard'ı RPC içinde:
// eski bir yanıt yeni bir bakiyeyi ezemez). Yerel/merkez bakiyesi arasında fark bulunursa klinik audit_log'una yazılır.
import { desc, eq } from "drizzle-orm";
import { bakimOturumuAc } from "@/lib/db/bakim";
import { rpc, sema } from "@/lib/db";
import { merkezdenBakiyeCek, merkezYapilandirildiMi } from "@/lib/mesaj/merkez-client";
import { calistir, gunlukYaz } from "./ortak";

const AD = "kredi-senkron";
await calistir(AD, async () => {
  if (!merkezYapilandirildiMi()) {
    gunlukYaz(AD, "uyari", "MESAJ_MERKEZ_BASE_URL / MESAJ_MERKEZ_API_KEY tanımlı değil; senkron atlandı");
    return { ozet: { atlandi: true }, hataSayisi: 0 };
  }
  const oturum = bakimOturumuAc();
  try {
    let senkronlanan = 0;
    let farkli = 0;
    let ulasilamayan = 0;
    const sonuclar = await oturum.dolas(async (tx, klinik) => {
      const satirlar = await tx
        .select({ kanal: sema.mesajKredileri.kanal, bakiye: sema.mesajKredileri.bakiye, versiyon: sema.mesajKredileri.merkezBakiyeVersiyonu })
        .from(sema.mesajKredileri)
        .where(eq(sema.mesajKredileri.klinikId, klinik.id))
        .orderBy(desc(sema.mesajKredileri.kanal));
      const r = { senkron: 0, fark: 0, ulasilamayan: 0 };
      for (const s of satirlar) {
        const merkez = await merkezdenBakiyeCek(klinik.id, s.kanal);
        if (!merkez.ulasildi) {
          r.ulasilamayan++;
          continue;
        }
        if (merkez.bakiye !== s.bakiye) {
          r.fark++;
          await tx.insert(sema.auditLog).values({
            klinikId: klinik.id,
            kullaniciId: null,
            eylem: "mesaj_kredi_senkron_farki",
            hedefTablo: "mesaj_kredileri",
            hedefId: null,
            detay: { kanal: s.kanal, yerel_bakiye: s.bakiye, merkez_bakiye: merkez.bakiye, yerel_versiyon: s.versiyon, merkez_versiyon: merkez.bakiyeVersiyonu },
          });
        }
        await rpc(tx, "mesaj_kredi_senkronla", { p_klinik_id: klinik.id, p_kanal: s.kanal, p_bakiye: merkez.bakiye, p_versiyon: merkez.bakiyeVersiyonu });
        r.senkron++;
      }
      return r;
    });
    let hata = 0;
    for (const s of sonuclar) {
      if (s.ok) {
        senkronlanan += s.sonuc.senkron;
        farkli += s.sonuc.fark;
        ulasilamayan += s.sonuc.ulasilamayan;
      } else {
        hata++;
        gunlukYaz(AD, "hata", "klinik senkronlanamadı", { klinikId: s.klinikId, hata: s.hata });
      }
    }
    return { ozet: { senkronlanan, farkli, ulasilamayan }, hataSayisi: hata };
  } finally {
    await oturum.kapat();
  }
});
