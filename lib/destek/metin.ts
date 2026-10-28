// Kullanıcının yazdığı SERBEST metin (talep/şikayet, destek gerekçesi): kişisel/sağlık verisi içerebilir.
// Yazarken kontrol karakterleri (satır sonu ve sekme hariç), sıfır genişlikli/yönlendirme (bidi) karakterleri ve BOM temizlenir; CRLF → LF.
// HTML KAÇIŞI burada YAPILMAZ (veri olduğu gibi saklanır); gösterim React'in otomatik kaçışıyla yapılır ve `dangerouslySetInnerHTML` yasaktır.
const KONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const GORUNMEZ = /[​-‏‪-‮⁦-⁩﻿]/g;

export function serbestMetniTemizle(metin: string): string {
  return metin.replace(/\r\n?/g, "\n").replace(KONTROL, "").replace(GORUNMEZ, "").trim();
}
