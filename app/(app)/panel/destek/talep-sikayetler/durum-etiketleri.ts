import type { StatusTone } from "@/components/ui/status-badge";
import type { DestekDurum, DestekTuru } from "@/types/destek";

export const TUR_ETIKET: Record<DestekTuru, string> = {
  talep: "Talep",
  sikayet: "Şikayet",
};

export const TUR_TON: Record<DestekTuru, StatusTone> = {
  talep: "sky",
  sikayet: "rose",
};

export const DURUM_ETIKET: Record<DestekDurum, string> = {
  yeni: "Yeni",
  inceleniyor: "İnceleniyor",
  cozuldu: "Çözüldü",
};

export const DURUM_TON: Record<DestekDurum, StatusTone> = {
  yeni: "amber",
  inceleniyor: "sky",
  cozuldu: "emerald",
};
