// Talep/şikayet serbest metni kişisel/sağlık verisi ve kötü amaçlı işaretleme içerebilir: gösterimde HTML KAÇIŞLI olmalı (XSS).
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { DestekTalebi } from "@/types/destek";
import { TalepListesi } from "./talep-listesi";

const kotu = '<img src=x onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">tıkla</a>';
const talep = (o: Partial<DestekTalebi>): DestekTalebi => ({
  id: "1", klinik_id: "k", kullanici_id: "u", tur: "sikayet", konu: "Konu", aciklama: "Açıklama", durum: "yeni",
  created_at: "2026-10-28T10:00:00Z", guncellenme_tarihi: null, kullanici: null, ...o,
});

describe("TalepListesi — XSS", () => {
  it("konu ve açıklamadaki HTML kaçışlanır; etiket/olay-işleyici/javascript: bağlantısı DOM'a girmez", () => {
    const html = renderToStaticMarkup(<TalepListesi talepler={[talep({ konu: kotu, aciklama: kotu })]} />);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/<a\s/);
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("&lt;script&gt;");
  });

  it("satır sonları korunur (whitespace-pre-wrap), kullanıcı metni biçimlendirme olarak yorumlanmaz", () => {
    const html = renderToStaticMarkup(<TalepListesi talepler={[talep({ aciklama: "1. satır\n**kalın** _eğik_ [bağ](http://x)" })]} />);
    expect(html).toContain("whitespace-pre-wrap");
    expect(html).toContain("**kalın** _eğik_ [bağ](http://x)");
    expect(html).not.toContain("<strong");
  });
});
