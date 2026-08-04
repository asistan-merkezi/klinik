import { revalidatePath } from "next/cache";

// Hasta Detay artık tek bir sayfa değil (özet + kutucuklar + ayrı alt sayfalar:
// kisisel/randevu/tedavi/cari), bu yüzden bir mutasyon hangi alt sayfadan
// tetiklenirse tetiklensin hepsi birden revalidate edilmeli — aksi halde
// kullanıcı başka bir alt sayfadayken yapılan değişiklik o sayfada görünmez.
export function revalidateHastaDetay(hastaId: string) {
  revalidatePath(`/panel/hastalar/${hastaId}`);
  revalidatePath(`/panel/hastalar/${hastaId}/kisisel`);
  revalidatePath(`/panel/hastalar/${hastaId}/randevu`);
  revalidatePath(`/panel/hastalar/${hastaId}/tedavi`);
  revalidatePath(`/panel/hastalar/${hastaId}/cari`);
}
