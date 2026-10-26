# KVKK — Yurt Dışı / Üçüncü Taraf Aktarım Taraması

Tarih: 2026-10-26 · Dal: `tasima/windows-postgres`. Bu belge hukuki görüş değildir; sınıflandırmalar hukuk onayına tabidir.

## Kural (taşıma kararı)

1. Kişisel ve sağlık verisi yurt dışı servislere (e-posta, LLM) **gönderilmeyecek ya da maskelenecek**.
1b. **SMS ve WhatsApp mesaj içeriğinde de** kişisel/sağlık verisi olmayacak (e-posta kuralıyla aynı): yalnız `klinik_adi` ve bağlantı. Alıcı telefon numarası gönderim için kaçınılmaz olarak operatöre/Meta'ya gider; ayrı not edilir. (WhatsApp, Meta altyapısı olduğu için yurt dışı aktarımı ayrıca hukuk değerlendirmesi ister.)
2. **E-posta** (Resend, EU): şablonlarda kişisel/sağlık verisi **bulunmayacak**; yalnız bağlantı odaklı metin ("Bildiriminiz hazır, görüntülemek için giriş yapın: {{baglanti}}"). Alıcı adresi gönderim için kaçınılmaz olarak servise gider; bu ayrıca not edilir ve veri işleme sözleşmesi/aydınlatma metninde yer almalıdır.
3. **Destek chatbotu** taşıma boyunca kapalı; sonra açılırsa kişisel/sağlık verisi LLM'e hiç gitmeyecek.

## Aktarım noktaları

| Nokta | Kod | Giden veri | Durum |
|---|---|---|---|
| E-posta (merkez → Resend EU) | `lib/mesaj/merkez-client.ts` (`mail → eposta`), şablonlar `lib/mesaj/tetikleyiciler.ts` + `mesaj_kurallari.mesaj_metni` | Şablon metni (ad, tarih, tutar, paket…) + alıcı adresi | **İhlal var** (aşağıda). Repoda doğrudan Resend çağrısı yok; Resend'e gidişi merkez projesi yapıyor — orada konu/ek/log politikası ayrıca doğrulanmalı |
| SMS / WhatsApp (merkez) | aynı | Aynı 28 şablon metni + telefon | **İhlal var**: e-postayla aynı kural uygulanır (aşağıda "Mesaj şablonları — tüm kanallar") |
| LLM (destek chatbotu) | `app/api/destek-chatbot/route.ts` (AI Gateway, `anthropic/claude-sonnet-5`) | Kullanıcının sohbet mesajları (serbest metin, kişisel/sağlık verisi yazılabilir) | **Kapalı olacak** (feature flag, plan Aşama 3). İstemci tarafı filtre yok |
| Mesaj merkezi API | `lib/mesaj/merkez-client.ts` | `disKullaniciId = klinik_id`, alıcı, metin | Ayrı proje; konum/sözleşme teyit edilmedi |
| Cloudflare (DNS/proxy) | — | Trafik üzerinden geçer (TLS sonlandırma Cloudflare'de olacaksa içerik de) | Karar: proxy açık mı (Full strict) — hukukla netleşmeli |

## Mesaj şablonları — tüm kanallar (e-posta, SMS, WhatsApp)

Tetikleyici kataloğu kanaldan bağımsızdır: aynı `varsayilanMesajMetni` ve `mesaj_kurallari.mesaj_metni` üç kanalda da gönderilir (`anlikMesajTetikle` her açık kanal için ayrı kuyruk satırı yazar). Bu nedenle **aşağıdaki 28 şablon taramasının sonucu SMS ve WhatsApp için de geçerlidir: 28/28 ihlal**. Kanala özgü ek notlar: SMS kısa olduğundan bağlantı odaklı metin zaten doğaldır; WhatsApp'ta şablon (template) onayı gereken metinlerde değişken olarak ad geçmesi aynı ihlaldir; hatırlatma mesajlarında (`randevu_hatirlatma_*`) tarih/saat bilgisi hastaya en çok fayda sağlayan veri olduğundan kuralın hasta deneyimine etkisi için ürün kararı gerekir (kural: veri yok, yalnız bağlantı). Uygulama: aşağıdaki "Önerilen uyum yolu" tüm kanallara genişletilir — kanal başına değişken beyaz listesi `klinik_adi` ve `baglanti`.

## E-posta şablonları taraması

Kapsam: katalogdaki **28** tetikleyicinin hepsi e-posta kanalına yazılabilir (`mail_aktif`, `anlikMesajTetikle` her kanal için ayrı satır üretir); bugün hiçbir klinikte kural açık değil (`mesaj_kurallari` boş), yani **henüz canlı ihlal yok, ama kural açıldığı anda ihlal başlar**. Aşağıda `varsayilanMesajMetni` ve `gecerliDegiskenler`'e göre değerlendirme. Ayrıca kliniğin kaydettiği `mesaj_metni` serbest metin olduğu için kod taraması onu kapsamaz (aşağıda öneri).

Kişisel sayılanlar: `*_adi` (hasta/personel/terapist adı), `tutar`. Sağlık/sağlık hizmeti bağlamı sayılanlar: `randevu_tarihi`, `randevu_durumu`, `paket_adi`, `seans_sayisi`, `kalan_seans`, `izin_tip` (rapor/hastalık izni), ve metnin "seans/tedavi/randevu" demesi. Güvenli: `klinik_adi`.

| # | Kod | Değişkenler | İhlal nedeni |
|---|---|---|---|
| 1 | hasta_kayit_hosgeldin | hasta_adi, klinik_adi | ad + hasta-klinik ilişkisi |
| 2 | hasta_paket_satis_ozet | hasta_adi, paket_adi, seans_sayisi, klinik_adi | ad + tedavi paketi/seans |
| 3 | hasta_paket_seans_azaldi | hasta_adi, paket_adi, kalan_seans, klinik_adi | ad + tedavi paketi/seans |
| 4 | hasta_paket_sure_bitiyor | hasta_adi, paket_adi, klinik_adi | ad + paket |
| 5 | hasta_ilk_seans_anket | hasta_adi, klinik_adi | ad + "ilk seans" |
| 6 | hasta_seans_sonrasi_anket | hasta_adi, terapist_adi, klinik_adi | iki ad + seans |
| 7 | hasta_program_tamamlandi | hasta_adi, klinik_adi | ad + "tedavi programı tamamlandı" |
| 8 | hasta_dogum_gunu | hasta_adi, klinik_adi | ad (+ doğum günü bilgisi); ayrıca ticari ileti |
| 9 | hasta_ozledik | hasta_adi, klinik_adi | ad + "randevu"; ticari ileti |
| 10 | randevu_onay | hasta_adi, randevu_tarihi, terapist_adi, klinik_adi | ad + randevu tarihi + terapist |
| 11 | randevu_hatirlatma_1gun | hasta_adi, randevu_tarihi, terapist_adi, klinik_adi | aynı |
| 12 | randevu_hatirlatma_2saat | hasta_adi, randevu_tarihi, terapist_adi, klinik_adi | aynı |
| 13 | randevu_iptal | hasta_adi, randevu_tarihi, randevu_durumu, klinik_adi | ad + randevu + durum |
| 14 | randevu_gelmedi | hasta_adi, randevu_tarihi, klinik_adi | ad + randevu |
| 15 | randevu_sonraki_oneri | hasta_adi, klinik_adi | ad + randevu; ticari ileti |
| 16 | personel_hosgeldin | personel_adi, klinik_adi | personel adı + iş ilişkisi |
| 17 | personel_gunluk_program | personel_adi, klinik_adi | ad + vardiya/randevu programı |
| 18 | personel_bordro_hazir | personel_adi, klinik_adi | ad + bordro (özlük/finansal) |
| 19 | personel_performans_ozet | personel_adi, klinik_adi | ad + performans/prim |
| 20 | personel_izin_talebi_yeni | personel_adi, izin_tip, tarih_araligi, klinik_adi | ad + izin türü (rapor = sağlık) + tarih |
| 21 | personel_izin_sonuc | personel_adi, izin_durumu, klinik_adi | ad + izin kararı |
| 22 | personel_egitim_hatirlatma | personel_adi, klinik_adi | personel adı |
| 23 | muhasebe_fatura_kesildi | hasta_adi, tutar, klinik_adi | ad + tutar; metin **e-Arşiv PDF eki/bağlantısı** vaat ediyor (ek yasak) |
| 24 | muhasebe_odeme_yaklasiyor | hasta_adi, tutar, klinik_adi | ad + tutar + borç durumu |
| 25 | muhasebe_odeme_gecikti | hasta_adi, tutar, klinik_adi | ad + tutar + gecikme |
| 26 | muhasebe_odeme_alindi | hasta_adi, tutar, klinik_adi | ad + tutar |
| 27 | muhasebe_taksit_hatirlatma | hasta_adi, tutar, klinik_adi | ad + tutar + taksit |
| 28 | muhasebe_donem_ekstre | hasta_adi, klinik_adi | ad + hesap ekstresi |

**Sonuç: 28 şablonun 28'i kuralı ihlal ediyor** (hepsinde en az bir ad değişkeni var; çoğunda ayrıca sağlık hizmeti, tarih veya finansal içerik). Hiçbir şablonda bağlantı değişkeni (`{{baglanti}}`) yok; kodda bağlantı üretimi de yok.

## Önerilen uyum yolu (Aşama 7'de yapılacak; şimdi yazılmadı)

1. E-posta kanalına özel **ayrı değişken beyaz listesi**: yalnız `klinik_adi` ve yeni `baglanti` (imzalı, kısa ömürlü, tek kullanımlık portal/panel bağlantısı). `degisken-dogrula.ts` kanal bilgisini alacak; `mail_aktif=true` kural, e-posta dışı kanallarda izinli değişkenleri içeriyorsa kaydetme reddedilir.
2. E-posta için **ayrı varsayılan metinler** (ör. "{{klinik_adi}} size bir bildirim gönderdi. Görüntülemek için: {{baglanti}}"); konu satırı da sabit ve veri içermeyen ("Klinik bildirimi").
3. Ek (PDF) yasak: `muhasebe_fatura_kesildi` ve `muhasebe_donem_ekstre` yalnız portal bağlantısı verir.
4. Kliniğin serbest `mesaj_metni`'ni e-postada çalıştırmadan önce sunucuda **doğrulama** (kaydederken + göndermeden hemen önce; kuyruktaki eski satırlar dahil).
5. Hedefte ilk gönderimden önce merkez/Resend tarafında konu, ek, log ve saklama ayarları doğrulanır.
