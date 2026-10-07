/**
 * Geç iptal: randevu başlangıcına bu kadar saatten az kala (ya da başladıktan
 * sonra) yapılan iptal seans olarak sayılır (bkz. migration
 * 20261007100000_randevu_iptal_gec_iptal_geri_al.sql — sunucu tarafı aynı
 * eşiği `interval '18 hours'` ile uygular; biri değişirse diğeri de değişmeli).
 */
export const GEC_IPTAL_SAAT = 18;

export const GEC_IPTAL_UYARISI = `Randevuya ${GEC_IPTAL_SAAT} saatten az kaldı. Bu kadar sürede iptal edildiğinde seansınız sayılacaktır.`;

export function gecIptalMi(baslangicIso: string, simdi: number = Date.now()): boolean {
  return new Date(baslangicIso).getTime() - simdi < GEC_IPTAL_SAAT * 3_600_000;
}
