// Hasta belgeleri (hasta-belge) disk düzeni ve yol doğrulaması. DB'deki `hasta_belge.storage_path` değeri
//   <klinik_id>/<hasta_id>/<kategori>/<belge_id>.<ext>   (küçük resim: <belge_id>_thumb.jpg)
// biçimindedir ve DOSYA_KOKU/hasta-belge/ altına aynen yazılır. Yol hiçbir zaman istemciden gelmez, ama DB'den okunan yol bile
// SERVİS ETMEDEN ÖNCE yeniden doğrulanır: biçim sıkı bir kalıpla eşleşmeli ve İLK parça çağıranın kliniği olmalıdır (başka kliniğin
// dosyasına yol göstermek mümkün olsa bile okunamaz).
import { dosyaOku, dosyaSil, dosyaYaz, DosyaHatasi } from "./depo";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const YOL_KALIBI = new RegExp(`^(${UUID})/(${UUID})/(radyoloji|klinik_foto|dokuman)/(${UUID})(_thumb)?\\.(jpg|png|webp|pdf)$`, "i");

export function belgeYoluCoz(storagePath: string, klinikId: string): string[] {
  const m = YOL_KALIBI.exec(storagePath);
  if (!m) throw new DosyaHatasi("Geçersiz belge yolu");
  if (m[1].toLowerCase() !== klinikId.toLowerCase()) throw new DosyaHatasi("Belge başka bir kliniğe ait");
  return storagePath.split("/");
}

export function belgeYoluOlustur(g: { klinikId: string; hastaId: string; kategori: string; belgeId: string; uzanti: string; kucuk?: boolean }): string {
  const yol = `${g.klinikId}/${g.hastaId}/${g.kategori}/${g.belgeId}${g.kucuk ? "_thumb" : ""}.${g.uzanti}`;
  belgeYoluCoz(yol, g.klinikId); // üretilen yol da aynı kalıba uymalı
  return yol;
}

export async function belgeDosyasiYaz(storagePath: string, klinikId: string, veri: Buffer): Promise<void> {
  await dosyaYaz("hasta-belge", belgeYoluCoz(storagePath, klinikId), veri);
}
export async function belgeDosyasiOku(storagePath: string, klinikId: string): Promise<Buffer | null> {
  return dosyaOku("hasta-belge", belgeYoluCoz(storagePath, klinikId));
}
export async function belgeDosyasiSil(storagePath: string, klinikId: string): Promise<void> {
  await dosyaSil("hasta-belge", belgeYoluCoz(storagePath, klinikId));
}
