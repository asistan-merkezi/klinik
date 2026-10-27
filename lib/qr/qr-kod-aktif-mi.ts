// Geçici ince sarmalayıcı (puantaj Modül 5'te taşınınca silinir): asıl kontrol lib/guvenlik/anonim-uc.ts > qrAktifMi (FAIL-CLOSED).
import { qrAktifMi } from "@/lib/guvenlik/anonim-uc";
import type { QrKodTipi } from "./qr-kod-tanimlari";

export const qrKoduAktifMi = (klinikId: string, tip: QrKodTipi) => qrAktifMi(klinikId, tip);
