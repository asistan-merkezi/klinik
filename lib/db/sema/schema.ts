import { pgTable, uniqueIndex, index, foreignKey, unique, check, uuid, text, boolean, timestamp, pgPolicy, numeric, integer, date, jsonb, time, smallint, type AnyPgColumn, bigint, primaryKey, pgView, pgMaterializedView, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { customType } from "drizzle-orm/pg-core"

/** drizzle-kit tanımadığı türü unknown yazar; veritabanındaki tür tstzrange (randevu.zaman_araligi, üretilmiş kolon). */
const tstzrange = customType<{ data: string }>({ dataType: () => "tstzrange" })

export const kullaniciRolTipi = pgEnum("kullanici_rol_tipi", ['super_admin', 'klinik_admin', 'resepsiyon', 'terapist', 'muhasebe'])
export const mesajAliciTipi = pgEnum("mesaj_alici_tipi", ['hasta', 'personel'])
export const mesajKanalTipi = pgEnum("mesaj_kanal_tipi", ['sms', 'whatsapp', 'mail'])
export const mesajKrediHareketTipi = pgEnum("mesaj_kredi_hareket_tipi", ['yukleme', 'dusum', 'iade'])
export const mesajKuyrukDurumTipi = pgEnum("mesaj_kuyruk_durum_tipi", ['beklemede', 'gonderiliyor', 'gonderildi', 'hata', 'iptal'])
export const randevuDurumTipi = pgEnum("randevu_durum_tipi", ['planlandi', 'geldi', 'iptal', 'gelmedi', 'gecikmeli_geldi', 'ertelendi', 'tamamlandi'])


export const kimlikKullanici = pgTable("kimlik_kullanici", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	ad: text().default("").notNull(),
	eposta: text().notNull(),
	epostaDogrulandi: boolean("eposta_dogrulandi").default(false).notNull(),
	telefon: text(),
	gorsel: text(),
	devreDisi: boolean("devre_disi").default(false).notNull(),
	devreDisiZamani: timestamp("devre_disi_zamani", { withTimezone: true, mode: 'string' }),
	olusturma: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	guncelleme: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	tur: text().default('personel').notNull(),
	klinikId: uuid("klinik_id"),
	hastaId: uuid("hasta_id"),
	telefonNorm: text("telefon_norm").generatedAlwaysAs(sql`telefon_normalize(telefon)`),
	telefonlaGiris: boolean("telefonla_giris").default(false).notNull(),
	sifreDegistirmeli: boolean("sifre_degistirmeli").default(false).notNull(),
	geciciSifreBitis: timestamp("gecici_sifre_bitis", { withTimezone: true, mode: 'string' }),
}, (table) => [
	uniqueIndex("kimlik_hasta_klinik_telefon_tekil").using("btree", table.klinikId.asc().nullsLast().op("text_ops"), table.telefonNorm.asc().nullsLast().op("text_ops")).where(sql`((tur = 'hasta'::text) AND (telefon_norm IS NOT NULL))`),
	uniqueIndex("kimlik_hasta_tekil").using("btree", table.hastaId.asc().nullsLast().op("uuid_ops")).where(sql`(hasta_id IS NOT NULL)`),
	index("kimlik_klinik").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("kimlik_personel_telefon_tekil").using("btree", table.telefonNorm.asc().nullsLast().op("text_ops")).where(sql`((tur = 'personel'::text) AND (telefon_norm IS NOT NULL))`),
	unique("kimlik_kullanici_eposta_key").on(table.eposta),
	check("kimlik_kullanici_tur_check", sql`tur = ANY (ARRAY['personel'::text, 'hasta'::text])`),
	check("kimlik_tur_alanlari", sql`((tur = 'hasta'::text) AND (klinik_id IS NOT NULL) AND (hasta_id IS NOT NULL) AND (NOT telefonla_giris)) OR ((tur = 'personel'::text) AND (hasta_id IS NULL))`),
]);

export const oturum = pgTable("oturum", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	kullaniciId: uuid("kullanici_id").notNull(),
	jeton: text().notNull(),
	bitis: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	cihazKimligi: text("cihaz_kimligi"),
	ipHash: text("ip_hash"),
	userAgent: text("user_agent"),
	ilkEtkinlik: timestamp("ilk_etkinlik", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	sonEtkinlik: timestamp("son_etkinlik", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	olusturma: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	guncelleme: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("oturum_kullanici_son_etkinlik").using("btree", table.kullaniciId.asc().nullsLast().op("timestamptz_ops"), table.sonEtkinlik.desc().nullsFirst().op("timestamptz_ops")),
	unique("oturum_jeton_key").on(table.jeton),
]);

export const kimlikDogrulama = pgTable("kimlik_dogrulama", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	tanimlayici: text().notNull(),
	deger: text().notNull(),
	bitis: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	olusturma: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	guncelleme: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const islemKategori = pgTable("islem_kategori", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	ad: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_islem_kategori_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	unique("islem_kategori_klinik_id_ad_key").on(table.ad, table.klinikId),
]);

export const odemeSatiri = pgTable("odeme_satiri", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	odemeId: uuid("odeme_id").notNull(),
	yontem: text().notNull(),
	tutar: numeric({ precision: 10, scale:  2 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_odeme_satiri_odeme_id").using("btree", table.odemeId.asc().nullsLast().op("uuid_ops")),
	check("odeme_satiri_yontem_check", sql`yontem = ANY (ARRAY['kredi_karti'::text, 'banka_havalesi'::text, 'nakit'::text])`),
	check("odeme_satiri_tutar_check", sql`tutar > (0)::numeric`),
]);

export const egzersizKutuphanesi = pgTable("egzersiz_kutuphanesi", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id"),
	ad: text().notNull(),
	aciklama: text(),
	bolge: text(),
	videoUrl: text("video_url"),
	gorselUrl: text("gorsel_url"),
	varsayilanSet: integer("varsayilan_set"),
	varsayilanTekrar: integer("varsayilan_tekrar"),
	varsayilanSureSn: integer("varsayilan_sure_sn"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_egzersiz_kutuphanesi_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	check("egzersiz_kutuphanesi_varsayilan_set_check", sql`varsayilan_set > 0`),
	check("egzersiz_kutuphanesi_varsayilan_tekrar_check", sql`varsayilan_tekrar > 0`),
	check("egzersiz_kutuphanesi_varsayilan_sure_sn_check", sql`varsayilan_sure_sn > 0`),
]);

export const evEgzersizProgrami = pgTable("ev_egzersiz_programi", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	hastaId: uuid("hasta_id").notNull(),
	ad: text().notNull(),
	baslangicTarihi: date("baslangic_tarihi").default(sql`CURRENT_DATE`).notNull(),
	bitisTarihi: date("bitis_tarihi"),
	atayanTerapistId: uuid("atayan_terapist_id"),
	durum: text().default('aktif').notNull(),
	notlar: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_ev_egzersiz_programi_hasta_id").using("btree", table.hastaId.asc().nullsLast().op("uuid_ops")),
	index("idx_ev_egzersiz_programi_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	check("ev_egzersiz_programi_durum_check", sql`durum = ANY (ARRAY['aktif'::text, 'tamamlandi'::text, 'iptal'::text])`),
	check("ev_egzersiz_programi_check", sql`(bitis_tarihi IS NULL) OR (bitis_tarihi >= baslangic_tarihi)`),
]);

export const evEgzersizKalemi = pgTable("ev_egzersiz_kalemi", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	programId: uuid("program_id").notNull(),
	egzersizId: uuid("egzersiz_id").notNull(),
	set: integer(),
	tekrar: integer(),
	sureSn: integer("sure_sn"),
	gunSikligi: text("gun_sikligi"),
	sira: integer().default(1).notNull(),
	ozelNot: text("ozel_not"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_ev_egzersiz_kalemi_egzersiz_id").using("btree", table.egzersizId.asc().nullsLast().op("uuid_ops")),
	index("idx_ev_egzersiz_kalemi_program_id").using("btree", table.programId.asc().nullsLast().op("uuid_ops")),
	check("ev_egzersiz_kalemi_tekrar_check", sql`tekrar > 0`),
	check("ev_egzersiz_kalemi_sure_sn_check", sql`sure_sn > 0`),
	check("ev_egzersiz_kalemi_set_check", sql`set > 0`),
]);

export const evEgzersizTakip = pgTable("ev_egzersiz_takip", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	programId: uuid("program_id").notNull(),
	kalemId: uuid("kalem_id").notNull(),
	tarih: date().default(sql`CURRENT_DATE`).notNull(),
	yapildi: boolean().default(false).notNull(),
	hastaNotu: text("hasta_notu"),
	agriSkoru: integer("agri_skoru"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_ev_egzersiz_takip_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	index("idx_ev_egzersiz_takip_program_id").using("btree", table.programId.asc().nullsLast().op("uuid_ops")),
	unique("ev_egzersiz_takip_kalem_id_tarih_key").on(table.kalemId, table.tarih),
	check("ev_egzersiz_takip_agri_skoru_check", sql`(agri_skoru >= 0) AND (agri_skoru <= 10)`),
]);

export const seansChecklistSablonu = pgTable("seans_checklist_sablonu", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	ad: text().notNull(),
	maddeler: jsonb().default([]).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_seans_checklist_sablonu_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
]);

export const kimlikHesap = pgTable("kimlik_hesap", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	kullaniciId: uuid("kullanici_id").notNull(),
	saglayiciId: text("saglayici_id").default('credential').notNull(),
	hesapId: text("hesap_id").notNull(),
	parolaHash: text("parola_hash"),
	olusturma: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	guncelleme: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenBitis: timestamp("access_token_bitis", { withTimezone: true, mode: 'string' }),
	refreshTokenBitis: timestamp("refresh_token_bitis", { withTimezone: true, mode: 'string' }),
	scope: text(),
}, (table) => [
	unique("kimlik_hesap_saglayici_id_hesap_id_key").on(table.hesapId, table.saglayiciId),
]);

export const randevuChecklist = pgTable("randevu_checklist", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	randevuId: uuid("randevu_id").notNull(),
	sablonId: uuid("sablon_id").notNull(),
	cevaplar: jsonb().default({}).notNull(),
	tamamlanmaTarihi: timestamp("tamamlanma_tarihi", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_randevu_checklist_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	index("idx_randevu_checklist_randevu_id").using("btree", table.randevuId.asc().nullsLast().op("uuid_ops")),
	unique("randevu_checklist_randevu_id_sablon_id_key").on(table.randevuId, table.sablonId),
]);

export const hastaAnket = pgTable("hasta_anket", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	hastaId: uuid("hasta_id").notNull(),
	anketTipi: text("anket_tipi").notNull(),
	tetikleyici: text(),
	puan: integer(),
	yorum: text(),
	gonderimTarihi: timestamp("gonderim_tarihi", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	cevapTarihi: timestamp("cevap_tarihi", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_hasta_anket_hasta_id").using("btree", table.hastaId.asc().nullsLast().op("uuid_ops")),
	index("idx_hasta_anket_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	check("hasta_anket_anket_tipi_check", sql`anket_tipi = ANY (ARRAY['nps'::text, 'memnuniyet'::text])`),
	check("hasta_anket_tetikleyici_check", sql`tetikleyici = ANY (ARRAY['paket_bitis'::text, 'seans_sayisi'::text])`),
	check("hasta_anket_puan_check", sql`puan >= 0`),
]);

export const randevuOnForm = pgTable("randevu_on_form", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	randevuId: uuid("randevu_id").notNull(),
	hastaId: uuid("hasta_id").notNull(),
	agriSkoru: integer("agri_skoru"),
	sikayetGuncelleme: text("sikayet_guncelleme"),
	ilacDegisikligi: text("ilac_degisikligi"),
	doldurmaTarihi: timestamp("doldurma_tarihi", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_randevu_on_form_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	unique("randevu_on_form_randevu_id_key").on(table.randevuId),
	check("randevu_on_form_agri_skoru_check", sql`(agri_skoru >= 0) AND (agri_skoru <= 10)`),
]);

export const islemTanimiFiyatGecmisi = pgTable("islem_tanimi_fiyat_gecmisi", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	islemTanimiId: uuid("islem_tanimi_id").notNull(),
	klinikId: uuid("klinik_id").notNull(),
	vitaFiyat: numeric("vita_fiyat", { precision: 10, scale:  2 }).notNull(),
	plusFiyat: numeric("plus_fiyat", { precision: 10, scale:  2 }),
	elitFiyat: numeric("elit_fiyat", { precision: 10, scale:  2 }),
	primeFiyat: numeric("prime_fiyat", { precision: 10, scale:  2 }),
	kdvOrani: numeric("kdv_orani", { precision: 5, scale:  2 }).notNull(),
	gecerlilikBaslangic: timestamp("gecerlilik_baslangic", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	gecerlilikBitis: timestamp("gecerlilik_bitis", { withTimezone: true, mode: 'string' }),
	degistirenKullaniciId: uuid("degistiren_kullanici_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_islem_tanimi_fiyat_gecmisi_islem_id").using("btree", table.islemTanimiId.asc().nullsLast().op("uuid_ops")),
	index("idx_islem_tanimi_fiyat_gecmisi_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("uq_islem_tanimi_fiyat_gecmisi_acik").using("btree", table.islemTanimiId.asc().nullsLast().op("uuid_ops")).where(sql`(gecerlilik_bitis IS NULL)`),
]);

export const vardiyaTuru = pgTable("vardiya_turu", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	ad: text().notNull(),
	baslangicSaat: time("baslangic_saat").notNull(),
	bitisSaat: time("bitis_saat").notNull(),
	aktif: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_vardiya_turu_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
]);

export const personelVardiyaAtama = pgTable("personel_vardiya_atama", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	personelId: uuid("personel_id").notNull(),
	vardiyaTuruId: uuid("vardiya_turu_id").notNull(),
	haftaninGunu: smallint("haftanin_gunu").notNull(),
	gecerlilikBaslangic: date("gecerlilik_baslangic").default(sql`CURRENT_DATE`).notNull(),
	gecerlilikBitis: date("gecerlilik_bitis"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_personel_vardiya_atama_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	index("idx_personel_vardiya_atama_personel_id").using("btree", table.personelId.asc().nullsLast().op("uuid_ops")),
	check("personel_vardiya_atama_haftanin_gunu_check", sql`(haftanin_gunu >= 0) AND (haftanin_gunu <= 6)`),
	check("personel_vardiya_atama_aralik_gecerli", sql`(gecerlilik_bitis IS NULL) OR (gecerlilik_bitis >= gecerlilik_baslangic)`),
]);

export const pozisyonSablonlari = pgTable("pozisyon_sablonlari", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	ad: text().notNull(),
	grup: text().notNull(),
	sira: integer().default(0).notNull(),
	sistemErisimi: boolean("sistem_erisimi").default(false).notNull(),
	varsayilanRol: kullaniciRolTipi("varsayilan_rol").default('terapist').notNull(),
	ucretTipi: text("ucret_tipi").default('aylik_maas').notNull(),
	puantajModu: text("puantaj_modu").default('gunluk').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("pozisyon_sablonlari_ad_key").on(table.ad),
	check("pozisyon_sablonlari_ucret_tipi_check", sql`ucret_tipi = ANY (ARRAY['aylik_maas'::text, 'prim_usulu'::text])`),
	check("pozisyon_sablonlari_puantaj_modu_check", sql`puantaj_modu = ANY (ARRAY['gunluk'::text, 'esnek'::text, 'takipsiz'::text])`),
]);

export const klinik = pgTable("klinik", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	ad: text().notNull(),
	subdomain: text(),
	planTuru: text("plan_turu").default('starter').notNull(),
	planBitisTarihi: date("plan_bitis_tarihi"),
	logoUrl: text("logo_url"),
	markaRenkleri: jsonb("marka_renkleri").default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	unvan: text(),
	adres: text(),
	vergiDairesi: text("vergi_dairesi"),
	vergiNo: text("vergi_no"),
	telefon: text(),
	whatsappNo: text("whatsapp_no"),
	eposta: text(),
	yetkiliKisi: text("yetkili_kisi"),
	yetkiliTelefon: text("yetkili_telefon"),
	yetkiliEposta: text("yetkili_eposta"),
	il: text(),
	ilce: text(),
	mahalle: text(),
	haftaIciBaslangic: time("hafta_ici_baslangic"),
	haftaIciBitis: time("hafta_ici_bitis"),
	cumartesiBaslangic: time("cumartesi_baslangic"),
	cumartesiBitis: time("cumartesi_bitis"),
	pazarBaslangic: time("pazar_baslangic"),
	pazarBitis: time("pazar_bitis"),
	logoUrlKoyu: text("logo_url_koyu"),
	qrKisaKod: text("qr_kisa_kod").notNull(),
	krediKartiTahsilatBankaHesapId: uuid("kredi_karti_tahsilat_banka_hesap_id"),
	krediKartiKomisyonOrani: numeric("kredi_karti_komisyon_orani", { precision: 4, scale:  2 }).default('0').notNull(),
}, (table) => [
	unique("klinik_subdomain_key").on(table.subdomain),
	unique("klinik_qr_kisa_kod_key").on(table.qrKisaKod),
	check("klinik_plan_turu_check", sql`plan_turu = ANY (ARRAY['starter'::text, 'pro'::text, 'enterprise'::text])`),
	check("klinik_kredi_karti_komisyon_orani_check", sql`(kredi_karti_komisyon_orani >= (0)::numeric) AND (kredi_karti_komisyon_orani <= 3.5)`),
]);

export const kullanici = pgTable("kullanici", {
	id: uuid().primaryKey().notNull(),
	klinikId: uuid("klinik_id"),
	rol: kullaniciRolTipi().notNull(),
	adSoyad: text("ad_soyad").notNull(),
	telefon: text(),
	lastActiveAt: timestamp("last_active_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_kullanici_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("idx_kullanici_telefon_normalize").using("btree", sql`telefon_normalize(telefon)`).where(sql`(telefon_normalize(telefon) IS NOT NULL)`),
	check("kullanici_klinik_gerekli", sql`(rol = 'super_admin'::kullanici_rol_tipi) OR (klinik_id IS NOT NULL)`),
]);

export const personel = pgTable("personel", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	kullaniciId: uuid("kullanici_id"),
	adSoyad: text("ad_soyad").notNull(),
	gorev: text().notNull(),
	maas: numeric({ precision: 12, scale:  2 }),
	iseGirisTarihi: date("ise_giris_tarihi"),
	aktif: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	uzmanlikTescilNo: text("uzmanlik_tescil_no"),
	adres: text(),
	il: text(),
	ilce: text(),
	mahalle: text(),
	dogumTarihi: date("dogum_tarihi"),
	dogumYeri: text("dogum_yeri"),
	cinsiyet: text(),
	eposta: text(),
	departman: text(),
	calismaTipi: text("calisma_tipi"),
	sgkSicilNo: text("sgk_sicil_no"),
	ozelYetkiOverride: jsonb("ozel_yetki_override").default({}).notNull(),
	iseBaslamaNotu: text("ise_baslama_notu"),
	fmSaatlikUcret: numeric("fm_saatlik_ucret", { precision: 10, scale:  2 }),
	izinDevirGun: numeric("izin_devir_gun").default('0').notNull(),
	izinDuzeltmeGun: numeric("izin_duzeltme_gun").default('0').notNull(),
	pozisyonId: uuid("pozisyon_id"),
	istenCikisTarihi: date("isten_cikis_tarihi"),
	imzaYetkilisiMi: boolean("imza_yetkilisi_mi").default(false).notNull(),
}, (table) => [
	index("idx_personel_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	check("personel_cinsiyet_check", sql`cinsiyet = ANY (ARRAY['erkek'::text, 'kadin'::text, 'belirtilmemis'::text])`),
	check("personel_calisma_tipi_check", sql`calisma_tipi = ANY (ARRAY['tam_zamanli'::text, 'yari_zamanli'::text, 'vardiyali'::text, 'prim_usulu'::text])`),
	check("personel_fm_saatlik_ucret_check", sql`(fm_saatlik_ucret IS NULL) OR (fm_saatlik_ucret >= (0)::numeric)`),
]);

export const terapist = pgTable("terapist", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	personelId: uuid("personel_id").notNull(),
	maasHesaplamaModeli: text("maas_hesaplama_modeli").default('sabit').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	primSabitTutar: numeric("prim_sabit_tutar", { precision: 10, scale:  2 }),
	barajSeansSayisi: integer("baraj_seans_sayisi"),
	barajBonusTutari: numeric("baraj_bonus_tutari", { precision: 10, scale:  2 }),
}, (table) => [
	index("idx_terapist_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	unique("terapist_personel_id_key").on(table.personelId),
	check("terapist_maas_hesaplama_modeli_check", sql`maas_hesaplama_modeli = ANY (ARRAY['sabit'::text, 'islem_basi_prim'::text, 'barajli_prim'::text])`),
	check("terapist_prim_sabit_tutar_check", sql`prim_sabit_tutar >= (0)::numeric`),
	check("terapist_baraj_seans_sayisi_check", sql`baraj_seans_sayisi > 0`),
	check("terapist_baraj_bonus_tutari_check", sql`baraj_bonus_tutari >= (0)::numeric`),
]);

export const hasta = pgTable("hasta", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	adSoyad: text("ad_soyad").notNull(),
	telefon: text().notNull(),
	dogumTarihi: date("dogum_tarihi"),
	kvkkOnayTarihi: timestamp("kvkk_onay_tarihi", { withTimezone: true, mode: 'string' }),
	whatsappIzinDurumu: boolean("whatsapp_izin_durumu").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	cinsiyet: text(),
	eposta: text(),
	referansKanali: text("referans_kanali"),
	ozelNitelikliVeriOnayTarihi: timestamp("ozel_nitelikli_veri_onay_tarihi", { withTimezone: true, mode: 'string' }),
	ticariIletiOnayTarihi: timestamp("ticari_ileti_onay_tarihi", { withTimezone: true, mode: 'string' }),
	riskBayraklari: jsonb("risk_bayraklari").default([]).notNull(),
	kvkkOnaylayanTip: text("kvkk_onaylayan_tip"),
	kvkkOnaylayanKullaniciId: uuid("kvkk_onaylayan_kullanici_id"),
	ozelNitelikliOnaylayanTip: text("ozel_nitelikli_onaylayan_tip"),
	ozelNitelikliOnaylayanKullaniciId: uuid("ozel_nitelikli_onaylayan_kullanici_id"),
	ticariIletiOnaylayanTip: text("ticari_ileti_onaylayan_tip"),
	ticariIletiOnaylayanKullaniciId: uuid("ticari_ileti_onaylayan_kullanici_id"),
	kayitKanali: text("kayit_kanali").default('resepsiyon').notNull(),
	kategori: text().default('vita').notNull(),
	olusturanTip: text("olusturan_tip"),
	olusturanKullaniciId: uuid("olusturan_kullanici_id"),
	sonGuncelleyenTip: text("son_guncelleyen_tip"),
	sonGuncelleyenKullaniciId: uuid("son_guncelleyen_kullanici_id"),
}, (table) => [
	index("idx_hasta_ad_arama_trgm").using("gin", sql`turkce_arama_metni(ad_soyad)`),
	index("idx_hasta_ad_soyad_trgm").using("gin", table.adSoyad.asc().nullsLast().op("gin_trgm_ops")),
	index("idx_hasta_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	index("idx_hasta_telefon").using("btree", table.telefon.asc().nullsLast().op("text_ops")),
	index("idx_hasta_telefon_trgm").using("gin", table.telefon.asc().nullsLast().op("gin_trgm_ops")),
	check("hasta_cinsiyet_check", sql`cinsiyet = ANY (ARRAY['kadin'::text, 'erkek'::text, 'belirtilmemis'::text])`),
	check("hasta_kvkk_onaylayan_tip_check", sql`kvkk_onaylayan_tip = ANY (ARRAY['hasta'::text, 'personel'::text])`),
	check("hasta_ozel_nitelikli_onaylayan_tip_check", sql`ozel_nitelikli_onaylayan_tip = ANY (ARRAY['hasta'::text, 'personel'::text])`),
	check("hasta_ticari_ileti_onaylayan_tip_check", sql`ticari_ileti_onaylayan_tip = ANY (ARRAY['hasta'::text, 'personel'::text])`),
	check("hasta_kayit_kanali_check", sql`kayit_kanali = ANY (ARRAY['resepsiyon'::text, 'qr_self_servis'::text])`),
	check("hasta_kategori_check", sql`kategori = ANY (ARRAY['vita'::text, 'plus'::text, 'elit'::text, 'prime'::text])`),
	check("hasta_olusturan_tip_check", sql`olusturan_tip = ANY (ARRAY['personel'::text, 'hasta'::text])`),
	check("hasta_son_guncelleyen_tip_check", sql`son_guncelleyen_tip = ANY (ARRAY['personel'::text, 'hasta'::text])`),
]);

export const oda = pgTable("oda", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	ad: text().notNull(),
	aktif: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	kapasite: integer().default(1).notNull(),
}, (table) => [
	index("idx_oda_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	check("oda_kapasite_check", sql`kapasite >= 1`),
]);

export const cihaz = pgTable("cihaz", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	ad: text().notNull(),
	aktif: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	adet: integer().default(1).notNull(),
}, (table) => [
	index("idx_cihaz_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	check("cihaz_adet_check", sql`adet >= 1`),
]);

export const randevu = pgTable("randevu", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	hastaId: uuid("hasta_id").notNull(),
	terapistId: uuid("terapist_id").notNull(),
	odaId: uuid("oda_id").notNull(),
	cihazId: uuid("cihaz_id"),
	baslangic: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	bitis: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	durum: randevuDurumTipi().default('planlandi').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	// TODO: failed to parse database type 'tstzrange'
	zamanAraligi: tstzrange("zaman_araligi").generatedAlwaysAs(sql`tstzrange(baslangic, bitis, '[)'::text)`),
	olusturanKullaniciId: uuid("olusturan_kullanici_id"),
	islemTanimiId: uuid("islem_tanimi_id"),
	periyodikRandevuId: uuid("periyodik_randevu_id"),
	paketSatisId: uuid("paket_satis_id"),
	gecikmeDakika: integer("gecikme_dakika"),
	tani: text(),
	antrenorId: uuid("antrenor_id"),
	tedaviProtokoluId: uuid("tedavi_protokolu_id"),
	tamamlanmaAciklamasi: text("tamamlanma_aciklamasi"),
	tamamlayanKullaniciId: uuid("tamamlayan_kullanici_id"),
	tamamlanmaTarihi: timestamp("tamamlanma_tarihi", { withTimezone: true, mode: 'string' }),
	kaynak: text().default('uygulama').notNull(),
	planlananIskontoTutari: numeric("planlanan_iskonto_tutari", { precision: 10, scale:  2 }),
	iptalAciklamasi: text("iptal_aciklamasi"),
	iptalTarihi: timestamp("iptal_tarihi", { withTimezone: true, mode: 'string' }),
	iptalEdenKullaniciId: uuid("iptal_eden_kullanici_id"),
	gecIptal: boolean("gec_iptal").default(false).notNull(),
	iptalPaketDusuldu: boolean("iptal_paket_dusuldu").default(false).notNull(),
	bedelliIptal: boolean("bedelli_iptal").default(false).notNull(),
	iptalBorcYazildi: boolean("iptal_borc_yazildi").default(false).notNull(),
}, (table) => [
	index("idx_randevu_antrenor_id").using("btree", table.antrenorId.asc().nullsLast().op("uuid_ops")),
	index("idx_randevu_baslangic").using("btree", table.baslangic.asc().nullsLast().op("timestamptz_ops")),
	index("idx_randevu_hasta_id").using("btree", table.hastaId.asc().nullsLast().op("uuid_ops")),
	index("idx_randevu_islem_tanimi_id").using("btree", table.islemTanimiId.asc().nullsLast().op("uuid_ops")),
	index("idx_randevu_klinik_baslangic").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops"), table.baslangic.asc().nullsLast().op("uuid_ops")),
	index("idx_randevu_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	index("idx_randevu_paket_satis_id").using("btree", table.paketSatisId.asc().nullsLast().op("uuid_ops")),
	index("idx_randevu_periyodik_randevu_id").using("btree", table.periyodikRandevuId.asc().nullsLast().op("uuid_ops")),
	index("idx_randevu_tedavi_protokolu_id").using("btree", table.tedaviProtokoluId.asc().nullsLast().op("uuid_ops")),
	index("idx_randevu_terapist_id_baslangic").using("btree", table.terapistId.asc().nullsLast().op("timestamptz_ops"), table.baslangic.asc().nullsLast().op("uuid_ops")),
	check("randevu_check", sql`bitis > baslangic`),
	check("randevu_gecikme_dakika_check", sql`(gecikme_dakika IS NULL) OR (gecikme_dakika > 0)`),
	check("randevu_kaynak_check", sql`kaynak = ANY (ARRAY['uygulama'::text, 'arsiv'::text])`),
	check("randevu_planlanan_iskonto_tutari_check", sql`(planlanan_iskonto_tutari IS NULL) OR (planlanan_iskonto_tutari >= (0)::numeric)`),
]);

export const klinikAyarlar = pgTable("klinik_ayarlar", {
	klinikId: uuid("klinik_id").primaryKey().notNull(),
	ayarlar: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
]);

export const islemTanimi = pgTable("islem_tanimi", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	islemKategoriId: uuid("islem_kategori_id"),
	ad: text().notNull(),
	kdvOrani: numeric("kdv_orani", { precision: 5, scale:  2 }).default('20').notNull(),
	parasutHizmetKodu: text("parasut_hizmet_kodu"),
	aktif: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	muhasebeHizmetIsmi: text("muhasebe_hizmet_ismi"),
	vitaFiyat: numeric("vita_fiyat", { precision: 10, scale:  2 }).notNull(),
	plusFiyat: numeric("plus_fiyat", { precision: 10, scale:  2 }),
	elitFiyat: numeric("elit_fiyat", { precision: 10, scale:  2 }),
	primeFiyat: numeric("prime_fiyat", { precision: 10, scale:  2 }),
	sureDakika: integer("sure_dakika"),
}, (table) => [
	index("idx_islem_tanimi_kategori_id").using("btree", table.islemKategoriId.asc().nullsLast().op("uuid_ops")),
	index("idx_islem_tanimi_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	check("islem_tanimi_kdv_orani_check", sql`(kdv_orani >= (0)::numeric) AND (kdv_orani <= (100)::numeric)`),
	check("islem_tanimi_vita_fiyat_check", sql`vita_fiyat >= (0)::numeric`),
	check("islem_tanimi_plus_fiyat_check", sql`(plus_fiyat IS NULL) OR (plus_fiyat >= (0)::numeric)`),
	check("islem_tanimi_elit_fiyat_check", sql`(elit_fiyat IS NULL) OR (elit_fiyat >= (0)::numeric)`),
	check("islem_tanimi_prime_fiyat_check", sql`(prime_fiyat IS NULL) OR (prime_fiyat >= (0)::numeric)`),
	check("islem_tanimi_sure_dakika_check", sql`(sure_dakika IS NULL) OR (sure_dakika > 0)`),
]);

export const paket = pgTable("paket", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	islemTanimiId: uuid("islem_tanimi_id").notNull(),
	ad: text().notNull(),
	seansSayisi: integer("seans_sayisi").notNull(),
	fiyat: numeric({ precision: 10, scale:  2 }).notNull(),
	kdvOrani: numeric("kdv_orani", { precision: 5, scale:  2 }).default('20').notNull(),
	aktif: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	satisBitisTarihi: date("satis_bitis_tarihi"),
	tekrarSayisi: integer("tekrar_sayisi").default(1).notNull(),
	kisiKotasi: integer("kisi_kotasi"),
}, (table) => [
	index("idx_paket_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	check("paket_seans_sayisi_check", sql`seans_sayisi > 0`),
	check("paket_fiyat_check", sql`fiyat >= (0)::numeric`),
	check("paket_kdv_orani_check", sql`(kdv_orani >= (0)::numeric) AND (kdv_orani <= (100)::numeric)`),
	check("paket_kisi_kotasi_check", sql`(kisi_kotasi IS NULL) OR (kisi_kotasi > 0)`),
]);

export const odeme = pgTable("odeme", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	hastaId: uuid("hasta_id").notNull(),
	olusturanKullaniciId: uuid("olusturan_kullanici_id"),
	iskontoTutari: numeric("iskonto_tutari", { precision: 10, scale:  2 }).default('0').notNull(),
	faturali: boolean().default(false).notNull(),
	aciklama: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_odeme_hasta_id").using("btree", table.hastaId.asc().nullsLast().op("uuid_ops")),
	index("idx_odeme_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	check("odeme_iskonto_tutari_check", sql`iskonto_tutari >= (0)::numeric`),
]);

export const paketSatis = pgTable("paket_satis", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	hastaId: uuid("hasta_id").notNull(),
	paketId: uuid("paket_id").notNull(),
	odemeId: uuid("odeme_id"),
	kalanAdet: integer("kalan_adet").notNull(),
	satisTarihi: date("satis_tarihi").default(sql`CURRENT_DATE`).notNull(),
	gecerlilikBitisTarihi: date("gecerlilik_bitis_tarihi"),
	durum: text().default('aktif').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_paket_satis_hasta_id").using("btree", table.hastaId.asc().nullsLast().op("uuid_ops")),
	index("idx_paket_satis_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	check("paket_satis_kalan_adet_check", sql`kalan_adet >= 0`),
	check("paket_satis_durum_check", sql`durum = ANY (ARRAY['aktif'::text, 'dondu'::text, 'bitti'::text, 'iptal'::text])`),
]);

export const odemeKalemi = pgTable("odeme_kalemi", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	odemeId: uuid("odeme_id").notNull(),
	islemTanimiId: uuid("islem_tanimi_id"),
	paketSatisId: uuid("paket_satis_id"),
	aciklama: text(),
	miktar: integer().default(1).notNull(),
	birimFiyat: numeric("birim_fiyat", { precision: 10, scale:  2 }).notNull(),
	kdvOrani: numeric("kdv_orani", { precision: 5, scale:  2 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_odeme_kalemi_odeme_id").using("btree", table.odemeId.asc().nullsLast().op("uuid_ops")),
	check("odeme_kalemi_miktar_check", sql`miktar > 0`),
	check("odeme_kalemi_birim_fiyat_check", sql`birim_fiyat >= (0)::numeric`),
	check("odeme_kalemi_kdv_orani_check", sql`(kdv_orani >= (0)::numeric) AND (kdv_orani <= (100)::numeric)`),
	check("odeme_kalemi_check", sql`(islem_tanimi_id IS NULL) OR (paket_satis_id IS NULL)`),
]);

export const hastaBakiyeHareket = pgTable("hasta_bakiye_hareket", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	hastaId: uuid("hasta_id").notNull(),
	tur: text().notNull(),
	tutar: numeric({ precision: 10, scale:  2 }).notNull(),
	odemeId: uuid("odeme_id"),
	aciklama: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	randevuId: uuid("randevu_id"),
	kaynak: text().default('uygulama').notNull(),
	iskontoTutari: numeric("iskonto_tutari").default('0').notNull(),
	iskontoUygulayanKullaniciId: uuid("iskonto_uygulayan_kullanici_id"),
	odemeYontemi: text("odeme_yontemi"),
	bankaHesapId: uuid("banka_hesap_id"),
	belgeTuru: text("belge_turu"),
	komisyonOrani: numeric("komisyon_orani", { precision: 4, scale:  2 }),
}, (table) => [
	index("idx_hasta_bakiye_hareket_banka_hesap").using("btree", table.bankaHesapId.asc().nullsLast().op("uuid_ops")).where(sql`(banka_hesap_id IS NOT NULL)`),
	index("idx_hasta_bakiye_hareket_hasta_id").using("btree", table.hastaId.asc().nullsLast().op("uuid_ops")),
	index("idx_hasta_bakiye_hareket_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	index("idx_hasta_bakiye_hareket_klinik_tur_created").using("btree", table.klinikId.asc().nullsLast().op("text_ops"), table.tur.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("text_ops")),
	index("idx_hasta_bakiye_hareket_randevu_id").using("btree", table.randevuId.asc().nullsLast().op("uuid_ops")),
	check("hasta_bakiye_hareket_tur_check", sql`tur = ANY (ARRAY['odeme'::text, 'iade'::text, 'kredi'::text, 'borc'::text])`),
	check("hasta_bakiye_hareket_kaynak_check", sql`kaynak = ANY (ARRAY['uygulama'::text, 'arsiv'::text])`),
	check("hasta_bakiye_hareket_odeme_yontemi_check", sql`odeme_yontemi = ANY (ARRAY['nakit'::text, 'kredi_karti'::text, 'banka_havalesi'::text])`),
	check("hasta_bakiye_hareket_belge_turu_check", sql`belge_turu = ANY (ARRAY['fatura'::text, 'fis'::text, 'serbest'::text])`),
	check("hasta_bakiye_hareket_iade_yontem_zorunlu", sql`(tur <> 'iade'::text) OR (odeme_yontemi IS NOT NULL))) NOT VALID`),
	check("hasta_bakiye_hareket_komisyon_orani_check", sql`(komisyon_orani IS NULL) OR ((komisyon_orani >= (0)::numeric) AND (komisyon_orani <= 3.5))`),
]);

export const fatura = pgTable("fatura", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	odemeId: uuid("odeme_id").notNull(),
	durum: text().default('bekliyor').notNull(),
	parasutFaturaNo: text("parasut_fatura_no"),
	eArsivPdfUrl: text("e_arsiv_pdf_url"),
	hataMesaji: text("hata_mesaji"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_fatura_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	index("idx_fatura_odeme_id").using("btree", table.odemeId.asc().nullsLast().op("uuid_ops")),
	check("fatura_durum_check", sql`durum = ANY (ARRAY['bekliyor'::text, 'kesildi'::text, 'hata'::text])`),
]);

export const hastaKullanici = pgTable("hasta_kullanici", {
	id: uuid().primaryKey().notNull(),
	hastaId: uuid("hasta_id").notNull(),
	aktif: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_hasta_kullanici_hasta_id").using("btree", table.hastaId.asc().nullsLast().op("uuid_ops")),
	unique("hasta_kullanici_hasta_id_key").on(table.hastaId),
]);

export const randevuIptalTalebi = pgTable("randevu_iptal_talebi", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id"),
	randevuId: uuid("randevu_id").notNull(),
	hastaId: uuid("hasta_id").notNull(),
	durum: text().default('bekliyor').notNull(),
	yanitKullaniciId: uuid("yanit_kullanici_id"),
	yanitTarihi: timestamp("yanit_tarihi", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	aciklama: text(),
	gecIptal: boolean("gec_iptal").default(false).notNull(),
}, (table) => [
	index("idx_randevu_iptal_talebi_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	unique("randevu_iptal_talebi_randevu_id_key").on(table.randevuId),
	check("randevu_iptal_talebi_durum_check", sql`durum = ANY (ARRAY['bekliyor'::text, 'onaylandi'::text, 'reddedildi'::text])`),
]);

export const hastaHassas = pgTable("hasta_hassas", {
	hastaId: uuid("hasta_id").primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	kimlikNo: text("kimlik_no"),
	kimlikNoTipi: text("kimlik_no_tipi"),
	adres: text(),
	acilDurumAdSoyad: text("acil_durum_ad_soyad"),
	acilDurumYakinlik: text("acil_durum_yakinlik"),
	acilDurumTelefon: text("acil_durum_telefon"),
	kronikHastaliklar: text("kronik_hastaliklar"),
	surekliIlaclar: text("surekli_ilaclar"),
	alerjiler: text(),
	gecirilmisAmeliyatlar: text("gecirilmis_ameliyatlar"),
	gelisSebebi: text("gelis_sebebi"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	kanSulandiriciKullanimi: boolean("kan_sulandirici_kullanimi").default(false),
	alerjiVar: boolean("alerji_var"),
	kronikHastalikVar: boolean("kronik_hastalik_var"),
	surekliIlacVar: boolean("surekli_ilac_var"),
	ameliyatVar: boolean("ameliyat_var"),
	kanSulandiriciDetay: text("kan_sulandirici_detay"),
	bulasiciHastalikVar: boolean("bulasici_hastalik_var"),
	bulasiciHastalikDetay: text("bulasici_hastalik_detay"),
	protezImplantVar: boolean("protez_implant_var"),
	protezImplantDetay: text("protez_implant_detay"),
	hamilelikEmzirmeVar: boolean("hamilelik_emzirme_var"),
	hamilelikEmzirmeDetay: text("hamilelik_emzirme_detay"),
	sigaraAlkolMaddeVar: boolean("sigara_alkol_madde_var"),
	sigaraAlkolMaddeDetay: text("sigara_alkol_madde_detay"),
	oncelikDurumu: text("oncelik_durumu").default('normal').notNull(),
	il: text(),
	ilce: text(),
	mahalle: text(),
	anneAdi: text("anne_adi"),
	anneTelefon: text("anne_telefon"),
	babaAdi: text("baba_adi"),
	babaTelefon: text("baba_telefon"),
	digerYakiniAdSoyad: text("diger_yakini_ad_soyad"),
	digerYakiniTelefon: text("diger_yakini_telefon"),
	digerYakiniYakinlik: text("diger_yakini_yakinlik"),
	olusturanTip: text("olusturan_tip"),
	olusturanKullaniciId: uuid("olusturan_kullanici_id"),
	sonGuncelleyenTip: text("son_guncelleyen_tip"),
	sonGuncelleyenKullaniciId: uuid("son_guncelleyen_kullanici_id"),
}, (table) => [
	uniqueIndex("idx_hasta_hassas_kimlik_no").using("btree", table.klinikId.asc().nullsLast().op("text_ops"), table.kimlikNo.asc().nullsLast().op("text_ops")).where(sql`(kimlik_no IS NOT NULL)`),
	index("idx_hasta_hassas_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	check("hasta_hassas_kimlik_no_tipi_check", sql`kimlik_no_tipi = ANY (ARRAY['tc'::text, 'pasaport'::text])`),
	check("hasta_hassas_oncelik_durumu_check", sql`oncelik_durumu = ANY (ARRAY['normal'::text, 'oncelikli'::text, 'acil'::text])`),
	check("hasta_hassas_olusturan_tip_check", sql`olusturan_tip = ANY (ARRAY['hasta'::text, 'personel'::text])`),
	check("hasta_hassas_son_guncelleyen_tip_check", sql`son_guncelleyen_tip = ANY (ARRAY['hasta'::text, 'personel'::text])`),
]);

export const periyodikRandevu = pgTable("periyodik_randevu", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	hastaId: uuid("hasta_id").notNull(),
	terapistId: uuid("terapist_id").notNull(),
	odaId: uuid("oda_id").notNull(),
	cihazId: uuid("cihaz_id"),
	islemTanimiId: uuid("islem_tanimi_id").notNull(),
	haftaninGunu: smallint("haftanin_gunu").notNull(),
	saat: time().notNull(),
	sureDakika: integer("sure_dakika").default(30).notNull(),
	durum: text().default('aktif').notNull(),
	olusturanKullaniciId: uuid("olusturan_kullanici_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	bitisTarihi: date("bitis_tarihi"),
	otomatikYenile: boolean("otomatik_yenile").default(true).notNull(),
}, (table) => [
	index("idx_periyodik_randevu_hasta_id").using("btree", table.hastaId.asc().nullsLast().op("uuid_ops")),
	index("idx_periyodik_randevu_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	check("periyodik_randevu_haftanin_gunu_check", sql`(haftanin_gunu >= 0) AND (haftanin_gunu <= 6)`),
	check("periyodik_randevu_sure_dakika_check", sql`(sure_dakika >= 5) AND (sure_dakika <= 480)`),
	check("periyodik_randevu_durum_check", sql`durum = ANY (ARRAY['aktif'::text, 'iptal'::text])`),
]);

export const islemKontrendikasyon = pgTable("islem_kontrendikasyon", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	islemTanimiId: uuid("islem_tanimi_id").notNull(),
	riskTipi: text("risk_tipi").notNull(),
	uyariSeviyesi: text("uyari_seviyesi").notNull(),
	mesaj: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_islem_kontrendikasyon_islem_id").using("btree", table.islemTanimiId.asc().nullsLast().op("uuid_ops")),
	index("idx_islem_kontrendikasyon_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	check("islem_kontrendikasyon_risk_tipi_check", sql`risk_tipi = ANY (ARRAY['alerji'::text, 'kalp_pili'::text, 'kan_sulandirici'::text, 'dusme_riski'::text, 'hamilelik'::text, 'diyabet'::text, 'epilepsi'::text, 'metal_implant'::text, 'diger'::text])`),
	check("islem_kontrendikasyon_uyari_seviyesi_check", sql`uyari_seviyesi = ANY (ARRAY['blok'::text, 'uyari'::text])`),
]);

export const hastaHedef = pgTable("hasta_hedef", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	hastaId: uuid("hasta_id").notNull(),
	hedefTipi: text("hedef_tipi").notNull(),
	hedefMetrik: text("hedef_metrik").notNull(),
	baslangicDeger: numeric("baslangic_deger", { precision: 10, scale:  2 }),
	hedefDeger: numeric("hedef_deger", { precision: 10, scale:  2 }),
	hedefTarihi: date("hedef_tarihi"),
	durum: text().default('aktif').notNull(),
	olusturanId: uuid("olusturan_id"),
	notlar: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_hasta_hedef_hasta_id").using("btree", table.hastaId.asc().nullsLast().op("uuid_ops")),
	index("idx_hasta_hedef_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	check("hasta_hedef_hedef_tipi_check", sql`hedef_tipi = ANY (ARRAY['vas'::text, 'rom'::text, 'fonksiyonel'::text, 'serbest'::text])`),
	check("hasta_hedef_durum_check", sql`durum = ANY (ARRAY['aktif'::text, 'ulasildi'::text, 'basarisiz'::text, 'iptal'::text])`),
]);

export const olcekTanimi = pgTable("olcek_tanimi", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id"),
	kod: text().notNull(),
	ad: text().notNull(),
	soruSemasi: jsonb("soru_semasi").default([]).notNull(),
	skorlamaKurali: jsonb("skorlama_kurali").default({}).notNull(),
	minSkor: numeric("min_skor", { precision: 6, scale:  2 }),
	maxSkor: numeric("max_skor", { precision: 6, scale:  2 }),
	yorumYonu: text("yorum_yonu").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_olcek_tanimi_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("idx_olcek_tanimi_kod_klinik").using("btree", table.klinikId.asc().nullsLast().op("text_ops"), table.kod.asc().nullsLast().op("uuid_ops")).where(sql`(klinik_id IS NOT NULL)`),
	uniqueIndex("idx_olcek_tanimi_kod_platform").using("btree", table.kod.asc().nullsLast().op("text_ops")).where(sql`(klinik_id IS NULL)`),
	check("olcek_tanimi_yorum_yonu_check", sql`yorum_yonu = ANY (ARRAY['yuksek_iyi'::text, 'dusuk_iyi'::text])`),
]);

export const hastaOlcum = pgTable("hasta_olcum", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	hastaId: uuid("hasta_id").notNull(),
	randevuId: uuid("randevu_id"),
	olcekTanimiId: uuid("olcek_tanimi_id").notNull(),
	cevaplar: jsonb().default({}).notNull(),
	hesaplananSkor: numeric("hesaplanan_skor", { precision: 6, scale:  2 }),
	olcumTarihi: timestamp("olcum_tarihi", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	girenKullaniciId: uuid("giren_kullanici_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_hasta_olcum_hasta_id").using("btree", table.hastaId.asc().nullsLast().op("timestamptz_ops"), table.olcumTarihi.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_hasta_olcum_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	index("idx_hasta_olcum_olcek_id").using("btree", table.olcekTanimiId.asc().nullsLast().op("uuid_ops")),
]);

export const hastaIletisimLog = pgTable("hasta_iletisim_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	hastaId: uuid("hasta_id").notNull(),
	kanal: text().notNull(),
	yon: text().notNull(),
	icerik: text(),
	ilgiliRandevuId: uuid("ilgili_randevu_id"),
	personelId: uuid("personel_id"),
	olusturmaTarihi: timestamp("olusturma_tarihi", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_hasta_iletisim_log_hasta_id").using("btree", table.hastaId.asc().nullsLast().op("timestamptz_ops"), table.olusturmaTarihi.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_hasta_iletisim_log_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	check("hasta_iletisim_log_kanal_check", sql`kanal = ANY (ARRAY['whatsapp'::text, 'sms'::text, 'email'::text, 'telefon'::text, 'portal'::text])`),
	check("hasta_iletisim_log_yon_check", sql`yon = ANY (ARRAY['giden'::text, 'gelen'::text])`),
]);

export const hastaIliski = pgTable("hasta_iliski", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	hastaId: uuid("hasta_id").notNull(),
	iliskiliHastaId: uuid("iliskili_hasta_id").notNull(),
	iliskiTuru: text("iliski_turu").notNull(),
	ortakOdeme: boolean("ortak_odeme").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_hasta_iliski_hasta_id").using("btree", table.hastaId.asc().nullsLast().op("uuid_ops")),
	index("idx_hasta_iliski_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	unique("hasta_iliski_hasta_id_iliskili_hasta_id_key").on(table.hastaId, table.iliskiliHastaId),
	check("hasta_iliski_iliski_turu_check", sql`iliski_turu = ANY (ARRAY['ebeveyn'::text, 'cocuk'::text, 'es'::text, 'kardes'::text, 'diger'::text])`),
	check("hasta_iliski_check", sql`hasta_id <> iliskili_hasta_id`),
]);

export const hastaSigorta = pgTable("hasta_sigorta", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	hastaId: uuid("hasta_id").notNull(),
	kurumAdi: text("kurum_adi").notNull(),
	policeNo: text("police_no"),
	katilimPayiOrani: numeric("katilim_payi_orani", { precision: 5, scale:  2 }),
	gecerlilikBaslangic: date("gecerlilik_baslangic"),
	gecerlilikBitis: date("gecerlilik_bitis"),
	faturaKurumAdina: boolean("fatura_kurum_adina").default(false).notNull(),
	notlar: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_hasta_sigorta_hasta_id").using("btree", table.hastaId.asc().nullsLast().op("uuid_ops")),
	index("idx_hasta_sigorta_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	check("hasta_sigorta_katilim_payi_orani_check", sql`(katilim_payi_orani >= (0)::numeric) AND (katilim_payi_orani <= (100)::numeric)`),
	check("hasta_sigorta_check", sql`(gecerlilik_bitis IS NULL) OR (gecerlilik_baslangic IS NULL) OR (gecerlilik_bitis >= gecerlilik_baslangic)`),
]);

export const hastaBelge = pgTable("hasta_belge", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	hastaId: uuid("hasta_id").notNull(),
	belgeTuru: text("belge_turu").notNull(),
	storagePath: text("storage_path").notNull(),
	uploadTarihi: timestamp("upload_tarihi", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	yukleyenKullaniciId: uuid("yukleyen_kullanici_id"),
	metadata: jsonb().default({}).notNull(),
	isEncrypted: boolean("is_encrypted").default(false).notNull(),
	versiyonNo: integer("versiyon_no").default(1).notNull(),
	oncekiBelgeId: uuid("onceki_belge_id"),
	isGuncel: boolean("is_guncel").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	kategori: text().notNull(),
	bolge: text(),
	cekimTarihi: date("cekim_tarihi").default(sql`CURRENT_DATE`).notNull(),
	karsilastirmaGrubuId: uuid("karsilastirma_grubu_id"),
	asama: text(),
	onamId: uuid("onam_id"),
	thumbnailPath: text("thumbnail_path"),
	dosyaMime: text("dosya_mime"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	dosyaBoyutByte: bigint("dosya_boyut_byte", { mode: "number" }),
	exifTemizlendi: boolean("exif_temizlendi").default(false).notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_hasta_belge_deleted_at").using("btree", table.deletedAt.asc().nullsLast().op("timestamptz_ops")).where(sql`(deleted_at IS NOT NULL)`),
	uniqueIndex("idx_hasta_belge_guncel").using("btree", table.hastaId.asc().nullsLast().op("text_ops"), table.belgeTuru.asc().nullsLast().op("text_ops"), table.bolge.asc().nullsLast().op("uuid_ops")).where(sql`(is_guncel = true)`),
	index("idx_hasta_belge_hasta_id").using("btree", table.hastaId.asc().nullsLast().op("uuid_ops")),
	index("idx_hasta_belge_karsilastirma_grubu").using("btree", table.karsilastirmaGrubuId.asc().nullsLast().op("uuid_ops")).where(sql`(karsilastirma_grubu_id IS NOT NULL)`),
	index("idx_hasta_belge_kategori").using("btree", table.kategori.asc().nullsLast().op("text_ops")),
	index("idx_hasta_belge_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	check("hasta_belge_versiyon_no_check", sql`versiyon_no > 0`),
	check("hasta_belge_kategori_check", sql`kategori = ANY (ARRAY['radyoloji'::text, 'klinik_foto'::text, 'dokuman'::text])`),
	check("hasta_belge_kategori_turu_check", sql`((kategori = 'radyoloji'::text) AND (belge_turu = ANY (ARRAY['rontgen'::text, 'mr'::text, 'tomografi'::text, 'ultrason'::text]))) OR ((kategori = 'klinik_foto'::text) AND (belge_turu = ANY (ARRAY['postur_on'::text, 'postur_yan'::text, 'postur_arka'::text, 'bolgesel'::text]))) OR ((kategori = 'dokuman'::text) AND (belge_turu = ANY (ARRAY['recete'::text, 'sevk'::text, 'epikriz'::text, 'diger'::text])))`),
	check("hasta_belge_asama_check", sql`(asama IS NULL) OR (asama = ANY (ARRAY['tedavi_oncesi'::text, 'ara_kontrol'::text, 'tedavi_sonrasi'::text]))`),
	check("hasta_belge_klinik_foto_onam_check", sql`(kategori <> 'klinik_foto'::text) OR (onam_id IS NOT NULL)`),
	check("hasta_belge_dosya_boyut_check", sql`(dosya_boyut_byte IS NULL) OR (dosya_boyut_byte >= 0)`),
]);

export const hastaOnam = pgTable("hasta_onam", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	hastaId: uuid("hasta_id").notNull(),
	onamTipi: text("onam_tipi").notNull(),
	imzalayan: text().default('hasta').notNull(),
	imzaStoragePath: text("imza_storage_path"),
	olusturanKullaniciId: uuid("olusturan_kullanici_id"),
	imzaTarihi: timestamp("imza_tarihi", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_hasta_onam_hasta_id").using("btree", table.hastaId.asc().nullsLast().op("uuid_ops")),
	index("idx_hasta_onam_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	check("hasta_onam_imzalayan_check", sql`imzalayan = ANY (ARRAY['hasta'::text, 'veli'::text])`),
]);

export const hastaVucutHaritasiIsareti = pgTable("hasta_vucut_haritasi_isareti", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	hastaId: uuid("hasta_id").notNull(),
	randevuId: uuid("randevu_id"),
	bolge: text().notNull(),
	x: numeric({ precision: 5, scale:  4 }),
	y: numeric({ precision: 5, scale:  4 }),
	severity: integer(),
	notMetni: text("not_metni"),
	olusturanKullaniciId: uuid("olusturan_kullanici_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	yuz: text().notNull(),
}, (table) => [
	index("idx_hasta_vucut_haritasi_isareti_hasta_id").using("btree", table.hastaId.asc().nullsLast().op("uuid_ops")),
	index("idx_hasta_vucut_haritasi_isareti_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	check("hasta_vucut_haritasi_isareti_x_check", sql`(x >= (0)::numeric) AND (x <= (1)::numeric)`),
	check("hasta_vucut_haritasi_isareti_y_check", sql`(y >= (0)::numeric) AND (y <= (1)::numeric)`),
	check("hasta_vucut_haritasi_isareti_severity_check", sql`(severity >= 0) AND (severity <= 10)`),
	check("hasta_vucut_haritasi_isareti_yuz_check", sql`yuz = ANY (ARRAY['on'::text, 'arka'::text])`),
]);

export const hastaProtokol = pgTable("hasta_protokol", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	hastaId: uuid("hasta_id").notNull(),
	islemTanimiId: uuid("islem_tanimi_id").notNull(),
	atayanTerapistId: uuid("atayan_terapist_id"),
	durum: text().default('aktif').notNull(),
	baslangicTarihi: date("baslangic_tarihi").default(sql`CURRENT_DATE`).notNull(),
	notlar: text(),
	uyariOnaylandiMi: boolean("uyari_onaylandi_mi").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_hasta_protokol_hasta_id").using("btree", table.hastaId.asc().nullsLast().op("uuid_ops")),
	index("idx_hasta_protokol_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	check("hasta_protokol_durum_check", sql`durum = ANY (ARRAY['aktif'::text, 'tamamlandi'::text, 'iptal'::text])`),
]);

export const klinikHarcama = pgTable("klinik_harcama", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	kategori: text().notNull(),
	tutar: numeric({ precision: 12, scale:  2 }).notNull(),
	tarih: date().notNull(),
	aciklama: text(),
	isFaturali: boolean("is_faturali").default(false).notNull(),
	faturaNo: text("fatura_no"),
	olusturanKullaniciId: uuid("olusturan_kullanici_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	tedarikciAdi: text("tedarikci_adi"),
	aracId: uuid("arac_id"),
	odemeTipi: text("odeme_tipi"),
	bankaHesapId: uuid("banka_hesap_id"),
	krediKartiId: uuid("kredi_karti_id"),
}, (table) => [
	index("idx_klinik_harcama_banka_hesap").using("btree", table.bankaHesapId.asc().nullsLast().op("uuid_ops")).where(sql`(banka_hesap_id IS NOT NULL)`),
	index("idx_klinik_harcama_kategori").using("btree", table.kategori.asc().nullsLast().op("text_ops")),
	index("idx_klinik_harcama_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	index("idx_klinik_harcama_klinik_tarih").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops"), table.tarih.asc().nullsLast().op("uuid_ops")),
	index("idx_klinik_harcama_kredi_karti").using("btree", table.krediKartiId.asc().nullsLast().op("uuid_ops")).where(sql`(kredi_karti_id IS NOT NULL)`),
	index("idx_klinik_harcama_tarih").using("btree", table.tarih.asc().nullsLast().op("date_ops")),
	index("idx_klinik_harcama_tedarikci").using("btree", sql`klinik_id`, sql`tedarikci_anahtari(tedarikci_adi)`).where(sql`(tedarikci_adi IS NOT NULL)`),
	check("klinik_harcama_tutar_check", sql`tutar >= (0)::numeric`),
	check("klinik_harcama_kategori_check", sql`kategori = ANY (ARRAY['kira'::text, 'fatura'::text, 'malzeme'::text, 'bakim_hizmet'::text, 'diger'::text])`),
	check("klinik_harcama_odeme_tipi_check", sql`odeme_tipi = ANY (ARRAY['nakit'::text, 'havale'::text, 'kredi_karti'::text, 'cari'::text])`),
	check("klinik_harcama_cari_tedarikci_check", sql`(odeme_tipi IS DISTINCT FROM 'cari'::text) OR ((tedarikci_adi IS NOT NULL) AND (btrim(tedarikci_adi) <> ''::text))`),
]);

export const personelHassas = pgTable("personel_hassas", {
	personelId: uuid("personel_id").primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	tcKimlik: text("tc_kimlik"),
	pasaportNo: text("pasaport_no"),
}, (table) => [
]);

export const personelAcilKisi = pgTable("personel_acil_kisi", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	personelId: uuid("personel_id").notNull(),
	adSoyad: text("ad_soyad").notNull(),
	yakinlik: text().notNull(),
	telefon: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_personel_acil_kisi_personel_id").using("btree", table.personelId.asc().nullsLast().op("uuid_ops")),
]);

export const personelMeslekiBelge = pgTable("personel_mesleki_belge", {
	personelId: uuid("personel_id").primaryKey().notNull(),
	diplomaNo: text("diploma_no"),
	uzmanlikBelgeNo: text("uzmanlik_belge_no"),
	meslekOdasiSicilNo: text("meslek_odasi_sicil_no"),
	saglikBakanligiTescilNo: text("saglik_bakanligi_tescil_no"),
	eImzaSertifikaSeriNo: text("e_imza_sertifika_seri_no"),
	eImzaGecerlilikTarihi: date("e_imza_gecerlilik_tarihi"),
	kaseGorselUrl: text("kase_gorsel_url"),
	maliSorumlulukSigortaPoliceNo: text("mali_sorumluluk_sigorta_police_no"),
	maliSorumlulukSigortaBitisTarihi: date("mali_sorumluluk_sigorta_bitis_tarihi"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
]);

export const tedaviProtokolu = pgTable("tedavi_protokolu", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	ad: text().notNull(),
	aciklama: text(),
	aktif: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_tedavi_protokolu_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
]);

export const tedaviProtokoluAdimi = pgTable("tedavi_protokolu_adimi", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	tedaviProtokoluId: uuid("tedavi_protokolu_id").notNull(),
	islemTanimiId: uuid("islem_tanimi_id").notNull(),
	sira: integer().notNull(),
	adimNotu: text("adim_notu"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_tedavi_protokolu_adimi_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	index("idx_tedavi_protokolu_adimi_protokol_id").using("btree", table.tedaviProtokoluId.asc().nullsLast().op("uuid_ops")),
	unique("tedavi_protokolu_adimi_tedavi_protokolu_id_sira_key").on(table.sira, table.tedaviProtokoluId),
	check("tedavi_protokolu_adimi_sira_check", sql`sira > 0`),
]);

export const klinikMuhasebeEntegrasyonu = pgTable("klinik_muhasebe_entegrasyonu", {
	klinikId: uuid("klinik_id").primaryKey().notNull(),
	parasutClientId: text("parasut_client_id"),
	parasutClientSecret: text("parasut_client_secret"),
	parasutCompanyId: text("parasut_company_id"),
	baglantiDurumu: text("baglanti_durumu").default('bekliyor').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	parasutSecretVar: boolean("parasut_secret_var").generatedAlwaysAs(sql`((parasut_client_secret IS NOT NULL) AND (parasut_client_secret <> ''::text))`),
}, (table) => [
	check("klinik_muhasebe_entegrasyonu_baglanti_durumu_check", sql`baglanti_durumu = ANY (ARRAY['bekliyor'::text, 'baglandi'::text])`),
]);

export const isBasvurusu = pgTable("is_basvurusu", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	adSoyad: text("ad_soyad").notNull(),
	telefon: text().notNull(),
	eposta: text(),
	pozisyon: text(),
	mesaj: text(),
	durum: text().default('beklemede').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	dogumTarihi: date("dogum_tarihi"),
	tcKimlikNo: text("tc_kimlik_no"),
	adres: text(),
	biziNeredenDuydunuz: text("bizi_nereden_duydunuz"),
	calismayaBaslamaTarihi: date("calismaya_baslama_tarihi"),
	calismaSekli: text("calisma_sekli"),
	beklenenUcret: text("beklenen_ucret"),
	egitimOkulBolum: text("egitim_okul_bolum"),
	egitimMezuniyetYili: text("egitim_mezuniyet_yili"),
	egitimSertifikalar: text("egitim_sertifikalar"),
	isDeneyimi: jsonb("is_deneyimi").default([]).notNull(),
	referanslar: jsonb().default([]).notNull(),
	kvkkOnay: boolean("kvkk_onay").default(false).notNull(),
	kvkkOnayTarihi: timestamp("kvkk_onay_tarihi", { withTimezone: true, mode: 'string' }),
	degerlendirenKullaniciId: uuid("degerlendiren_kullanici_id"),
	degerlendirmeTarihi: timestamp("degerlendirme_tarihi", { withTimezone: true, mode: 'string' }),
	personelId: uuid("personel_id"),
}, (table) => [
	index("idx_is_basvurusu_durum").using("btree", table.klinikId.asc().nullsLast().op("text_ops"), table.durum.asc().nullsLast().op("text_ops")),
	index("idx_is_basvurusu_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	check("is_basvurusu_calisma_sekli_check", sql`calisma_sekli = ANY (ARRAY['tam_zamanli'::text, 'yari_zamanli'::text])`),
	check("is_basvurusu_durum_check", sql`durum = ANY (ARRAY['beklemede'::text, 'olumlu'::text, 'olumsuz'::text])`),
]);

export const anketYaniti = pgTable("anket_yaniti", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	puan: smallint(),
	oneriMetni: text("oneri_metni"),
	adSoyad: text("ad_soyad"),
	telefon: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	gorulduTarihi: timestamp("goruldu_tarihi", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_anket_yaniti_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	check("anket_yaniti_puan_check", sql`(puan >= 1) AND (puan <= 5)`),
	check("anket_yaniti_bos_olamaz", sql`(puan IS NOT NULL) OR (oneri_metni IS NOT NULL)`),
	check("anket_yaniti_metin_uzunluk", sql`(COALESCE(length(oneri_metni), 0) <= 2000) AND (COALESCE(length(ad_soyad), 0) <= 120) AND (COALESCE(length(telefon), 0) <= 20))) NOT VALID`),
]);

export const iskontoOranlari = pgTable("iskonto_oranlari", {
	klinikId: uuid("klinik_id").primaryKey().notNull(),
	vitaPct: numeric("vita_pct", { precision: 5, scale:  2 }).default('0').notNull(),
	plusPct: numeric("plus_pct", { precision: 5, scale:  2 }).default('0').notNull(),
	elitPct: numeric("elit_pct", { precision: 5, scale:  2 }).default('0').notNull(),
	primePct: numeric("prime_pct", { precision: 5, scale:  2 }).default('0').notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	check("iskonto_oranlari_vita_pct_check", sql`(vita_pct >= (0)::numeric) AND (vita_pct <= (100)::numeric)`),
	check("iskonto_oranlari_plus_pct_check", sql`(plus_pct >= (0)::numeric) AND (plus_pct <= (100)::numeric)`),
	check("iskonto_oranlari_elit_pct_check", sql`(elit_pct >= (0)::numeric) AND (elit_pct <= (100)::numeric)`),
	check("iskonto_oranlari_prime_pct_check", sql`(prime_pct >= (0)::numeric) AND (prime_pct <= (100)::numeric)`),
]);

export const personelPuantajDonem = pgTable("personel_puantaj_donem", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	personelId: uuid("personel_id").notNull(),
	yil: integer().notNull(),
	ay: integer().notNull(),
	durum: text().default('acik').notNull(),
	snapshotNetSaat: numeric("snapshot_net_saat", { precision: 8, scale:  2 }),
	snapshotOnayliFmSaat: numeric("snapshot_onayli_fm_saat", { precision: 8, scale:  2 }),
	snapshotEksikSaat: numeric("snapshot_eksik_saat", { precision: 8, scale:  2 }),
	snapshotIzinGun: integer("snapshot_izin_gun"),
	snapshotDevamsizlikGun: integer("snapshot_devamsizlik_gun"),
	kapatanId: uuid("kapatan_id"),
	kapatmaTarihi: timestamp("kapatma_tarihi", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_personel_puantaj_donem_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	unique("personel_puantaj_donem_personel_id_yil_ay_key").on(table.ay, table.personelId, table.yil),
	check("personel_puantaj_donem_yil_check", sql`(yil >= 2020) AND (yil <= 2100)`),
	check("personel_puantaj_donem_ay_check", sql`(ay >= 1) AND (ay <= 12)`),
	check("personel_puantaj_donem_durum_check", sql`durum = ANY (ARRAY['acik'::text, 'kapali'::text])`),
]);

export const personelPuantaj = pgTable("personel_puantaj", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	personelId: uuid("personel_id").notNull(),
	tarih: date().notNull(),
	planlananBaslangic: time("planlanan_baslangic"),
	planlananBitis: time("planlanan_bitis"),
	girisSaat: timestamp("giris_saat", { withTimezone: true, mode: 'string' }),
	cikisSaat: timestamp("cikis_saat", { withTimezone: true, mode: 'string' }),
	molaDakika: integer("mola_dakika").default(0).notNull(),
	netCalismaDakika: integer("net_calisma_dakika").generatedAlwaysAs(sql`personel_puantaj_net_dakika(giris_saat, cikis_saat, mola_dakika)`),
	sapmaDakika: integer("sapma_dakika").generatedAlwaysAs(sql`personel_puantaj_sapma_dakika(giris_saat, cikis_saat, mola_dakika, planlanan_baslangic, planlanan_bitis)`),
	fazlaMesaiDakika: integer("fazla_mesai_dakika").generatedAlwaysAs(sql`
CASE
    WHEN (personel_puantaj_sapma_dakika(giris_saat, cikis_saat, mola_dakika, planlanan_baslangic, planlanan_bitis) IS NULL) THEN NULL::integer
    ELSE GREATEST(personel_puantaj_sapma_dakika(giris_saat, cikis_saat, mola_dakika, planlanan_baslangic, planlanan_bitis), 0)
END`),
	eksikCalismaDakika: integer("eksik_calisma_dakika").generatedAlwaysAs(sql`
CASE
    WHEN (personel_puantaj_sapma_dakika(giris_saat, cikis_saat, mola_dakika, planlanan_baslangic, planlanan_bitis) IS NULL) THEN NULL::integer
    ELSE GREATEST((- personel_puantaj_sapma_dakika(giris_saat, cikis_saat, mola_dakika, planlanan_baslangic, planlanan_bitis)), 0)
END`),
	fmOnayDurumu: text("fm_onay_durumu").default('bekliyor').notNull(),
	fmOnaylayanId: uuid("fm_onaylayan_id"),
	fmOnayTarihi: timestamp("fm_onay_tarihi", { withTimezone: true, mode: 'string' }),
	durum: text().notNull(),
	kaynak: text().default('manuel').notNull(),
	notMetni: text("not_metni"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	izinTalepId: uuid("izin_talep_id"),
}, (table) => [
	index("idx_personel_puantaj_izin_talep_id").using("btree", table.izinTalepId.asc().nullsLast().op("uuid_ops")).where(sql`(izin_talep_id IS NOT NULL)`),
	index("idx_personel_puantaj_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	index("idx_personel_puantaj_personel_id").using("btree", table.personelId.asc().nullsLast().op("uuid_ops")),
	index("idx_personel_puantaj_tarih").using("btree", table.tarih.asc().nullsLast().op("date_ops")),
	unique("personel_puantaj_personel_id_tarih_key").on(table.personelId, table.tarih),
	check("personel_puantaj_mola_dakika_check", sql`mola_dakika >= 0`),
	check("personel_puantaj_fm_onay_durumu_check", sql`fm_onay_durumu = ANY (ARRAY['bekliyor'::text, 'onaylandi'::text, 'reddedildi'::text])`),
	check("personel_puantaj_durum_check", sql`durum = ANY (ARRAY['calisti'::text, 'izinli'::text, 'raporlu'::text, 'gelmedi'::text, 'resmi_tatil'::text])`),
	check("personel_puantaj_cikis_giristen_sonra", sql`(cikis_saat IS NULL) OR (giris_saat IS NULL) OR (cikis_saat > giris_saat)`),
	check("personel_puantaj_kaynak_check", sql`kaynak = ANY (ARRAY['manuel'::text, 'tablet'::text, 'self_qr'::text, 'izin_talebi'::text])`),
]);

export const personelUcret = pgTable("personel_ucret", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	personelId: uuid("personel_id").notNull(),
	maas: numeric({ precision: 10, scale:  2 }).notNull(),
	gecerlilikTarihi: date("gecerlilik_tarihi").default(sql`CURRENT_DATE`).notNull(),
	ekleyenKullaniciId: uuid("ekleyen_kullanici_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_personel_ucret_gecerlilik_tarihi").using("btree", table.gecerlilikTarihi.asc().nullsLast().op("date_ops")),
	index("idx_personel_ucret_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	index("idx_personel_ucret_personel_id").using("btree", table.personelId.asc().nullsLast().op("uuid_ops")),
	check("personel_ucret_maas_check", sql`maas >= (0)::numeric`),
]);

export const klinikArac = pgTable("klinik_arac", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	marka: text().notNull(),
	model: text().notNull(),
	plaka: text().notNull(),
	olusturanKullaniciId: uuid("olusturan_kullanici_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_klinik_arac_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
]);

export const kamusalOdeme = pgTable("kamusal_odeme", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	odemeTipi: text("odeme_tipi").notNull(),
	tutar: numeric({ precision: 12, scale:  2 }).notNull(),
	donemAy: smallint("donem_ay").notNull(),
	donemYil: smallint("donem_yil").notNull(),
	vadeTarihi: date("vade_tarihi").notNull(),
	odemeTarihi: date("odeme_tarihi"),
	notlar: text(),
	olusturanKullaniciId: uuid("olusturan_kullanici_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	aracId: uuid("arac_id"),
	odemeYontemi: text("odeme_yontemi"),
	bankaHesapId: uuid("banka_hesap_id"),
}, (table) => [
	index("idx_kamusal_odeme_arac_id").using("btree", table.aracId.asc().nullsLast().op("uuid_ops")),
	index("idx_kamusal_odeme_banka_hesap").using("btree", table.bankaHesapId.asc().nullsLast().op("uuid_ops")).where(sql`(banka_hesap_id IS NOT NULL)`),
	index("idx_kamusal_odeme_donem").using("btree", table.klinikId.asc().nullsLast().op("int2_ops"), table.donemYil.asc().nullsLast().op("uuid_ops"), table.donemAy.asc().nullsLast().op("int2_ops")),
	index("idx_kamusal_odeme_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	index("idx_kamusal_odeme_klinik_odeme_tarihi").using("btree", table.klinikId.asc().nullsLast().op("date_ops"), table.odemeTarihi.asc().nullsLast().op("date_ops")).where(sql`(odeme_tarihi IS NOT NULL)`),
	check("kamusal_odeme_odeme_tipi_check", sql`odeme_tipi = ANY (ARRAY['kdv'::text, 'stopaj_muhtasar'::text, 'sgk_primleri'::text, 'damga_vergisi'::text, 'emlak_vergisi'::text, 'motorlu_tasitlar_vergisi'::text, 'bagkur_primleri'::text, 'muhasebe_ucreti'::text, 'trafik_cezasi'::text, 'gec_odeme_faizi'::text, 'gecici_vergi'::text, 'kurumlar_vergisi'::text])`),
	check("kamusal_odeme_tutar_check", sql`tutar >= (0)::numeric`),
	check("kamusal_odeme_donem_ay_check", sql`(donem_ay >= 1) AND (donem_ay <= 12)`),
	check("kamusal_odeme_donem_yil_check", sql`(donem_yil >= 2000) AND (donem_yil <= 2100)`),
	check("kamusal_odeme_arac_id_tip_check", sql`(arac_id IS NULL) OR (odeme_tipi = ANY (ARRAY['motorlu_tasitlar_vergisi'::text, 'trafik_cezasi'::text]))`),
	check("kamusal_odeme_odeme_yontemi_check", sql`odeme_yontemi = ANY (ARRAY['nakit'::text, 'havale'::text])`),
]);

export const seansDegerlendirme = pgTable("seans_degerlendirme", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	randevuId: uuid("randevu_id").notNull(),
	hastaId: uuid("hasta_id").notNull(),
	puan: smallint(),
	oneriMetni: text("oneri_metni"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	gorulduTarihi: timestamp("goruldu_tarihi", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_seans_degerlendirme_hasta_id").using("btree", table.hastaId.asc().nullsLast().op("uuid_ops")),
	index("idx_seans_degerlendirme_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	unique("seans_degerlendirme_randevu_id_key").on(table.randevuId),
	check("seans_degerlendirme_puan_check", sql`(puan >= 1) AND (puan <= 5)`),
	check("seans_degerlendirme_bos_olamaz", sql`(puan IS NOT NULL) OR (oneri_metni IS NOT NULL)`),
	check("seans_degerlendirme_metin_uzunluk", sql`COALESCE(length(oneri_metni), 0) <= 2000)) NOT VALID`),
]);

export const randevuTalebi = pgTable("randevu_talebi", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id"),
	hastaId: uuid("hasta_id").notNull(),
	islemTanimiId: uuid("islem_tanimi_id").notNull(),
	tercihTarih: date("tercih_tarih").notNull(),
	tercihSaat: time("tercih_saat"),
	terapistId: uuid("terapist_id"),
	notMetni: text("not_metni"),
	durum: text().default('bekliyor').notNull(),
	olusturulanRandevuId: uuid("olusturulan_randevu_id"),
	yanitKullaniciId: uuid("yanit_kullanici_id"),
	yanitTarihi: timestamp("yanit_tarihi", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_randevu_talebi_hasta_id").using("btree", table.hastaId.asc().nullsLast().op("uuid_ops")),
	index("idx_randevu_talebi_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	check("randevu_talebi_durum_check", sql`durum = ANY (ARRAY['bekliyor'::text, 'onaylandi'::text, 'reddedildi'::text])`),
]);

export const destekTalebi = pgTable("destek_talebi", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	kullaniciId: uuid("kullanici_id").notNull(),
	tur: text().notNull(),
	konu: text().notNull(),
	aciklama: text().notNull(),
	durum: text().default('yeni').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	guncellenmeTarihi: timestamp("guncellenme_tarihi", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_destek_talebi_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	index("idx_destek_talebi_kullanici_id").using("btree", table.kullaniciId.asc().nullsLast().op("uuid_ops")),
	check("destek_talebi_tur_check", sql`tur = ANY (ARRAY['talep'::text, 'sikayet'::text])`),
	check("destek_talebi_durum_check", sql`durum = ANY (ARRAY['yeni'::text, 'inceleniyor'::text, 'cozuldu'::text])`),
]);

export const mesajKurallari = pgTable("mesaj_kurallari", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	tetikleyiciKodu: text("tetikleyici_kodu").notNull(),
	aktif: boolean().default(true).notNull(),
	smsAktif: boolean("sms_aktif").default(false).notNull(),
	whatsappAktif: boolean("whatsapp_aktif").default(false).notNull(),
	mailAktif: boolean("mail_aktif").default(false).notNull(),
	mesajMetni: text("mesaj_metni").default("").notNull(),
	whatsappSablonKodu: text("whatsapp_sablon_kodu"),
	zamanlamaOffsetDakika: integer("zamanlama_offset_dakika"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_mesaj_kurallari_klinik").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	unique("mesaj_kurallari_klinik_id_tetikleyici_kodu_key").on(table.klinikId, table.tetikleyiciKodu),
]);

export const mesajKuyrugu = pgTable("mesaj_kuyrugu", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	tetikleyiciKodu: text("tetikleyici_kodu").notNull(),
	kanal: mesajKanalTipi().notNull(),
	aliciTipi: mesajAliciTipi("alici_tipi").notNull(),
	aliciId: uuid("alici_id").notNull(),
	aliciAdres: text("alici_adres").notNull(),
	gonderilecekMetin: text("gonderilecek_metin").notNull(),
	durum: mesajKuyrukDurumTipi().default('beklemede').notNull(),
	planlananZaman: timestamp("planlanan_zaman", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	gonderimZamani: timestamp("gonderim_zamani", { withTimezone: true, mode: 'string' }),
	denemeSayisi: integer("deneme_sayisi").default(0).notNull(),
	saglayiciMesajId: text("saglayici_mesaj_id"),
	hataMesaji: text("hata_mesaji"),
	idempotencyAnahtari: text("idempotency_anahtari").notNull(),
	testMi: boolean("test_mi").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	islemeAlinmaZamani: timestamp("isleme_alinma_zamani", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_mesaj_kuyrugu_durum_planlanan").using("btree", table.durum.asc().nullsLast().op("timestamptz_ops"), table.planlananZaman.asc().nullsLast().op("timestamptz_ops")),
	index("idx_mesaj_kuyrugu_klinik_created").using("btree", table.klinikId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")),
	unique("mesaj_kuyrugu_idempotency_anahtari_key").on(table.idempotencyAnahtari),
]);

export const mesajKredileri = pgTable("mesaj_kredileri", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	kanal: mesajKanalTipi().notNull(),
	bakiye: integer().default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	sonSenkronZamani: timestamp("son_senkron_zamani", { withTimezone: true, mode: 'string' }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	merkezBakiyeVersiyonu: bigint("merkez_bakiye_versiyonu", { mode: "number" }).default(0).notNull(),
}, (table) => [
	index("idx_mesaj_kredileri_klinik").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	unique("mesaj_kredileri_klinik_id_kanal_key").on(table.kanal, table.klinikId),
	check("mesaj_kredileri_bakiye_check", sql`bakiye >= 0`),
]);

export const mesajKrediHareketleri = pgTable("mesaj_kredi_hareketleri", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	kanal: mesajKanalTipi().notNull(),
	tip: mesajKrediHareketTipi().notNull(),
	miktar: integer().notNull(),
	tutar: numeric({ precision: 12, scale:  2 }),
	aciklama: text(),
	kuyrukId: uuid("kuyruk_id"),
	olusturanKullaniciId: uuid("olusturan_kullanici_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_mesaj_kredi_hareketleri_klinik_kanal").using("btree", table.klinikId.asc().nullsLast().op("timestamptz_ops"), table.kanal.asc().nullsLast().op("enum_ops"), table.createdAt.desc().nullsFirst().op("enum_ops")),
	check("mesaj_kredi_hareketleri_sadece_yukleme", sql`tip = 'yukleme'::mesaj_kredi_hareket_tipi`),
]);

export const hastaAnamnez = pgTable("hasta_anamnez", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	hastaId: uuid("hasta_id").notNull(),
	basvuruSikayeti: text("basvuru_sikayeti").notNull(),
	sikayetBaslangici: text("sikayet_baslangici"),
	agriOykusu: text("agri_oykusu"),
	ilkDegerlendirmeNotu: text("ilk_degerlendirme_notu"),
	durum: text().default('aktif').notNull(),
	olusturanTip: text("olusturan_tip"),
	olusturanKullaniciId: uuid("olusturan_kullanici_id"),
	sonGuncelleyenTip: text("son_guncelleyen_tip"),
	sonGuncelleyenKullaniciId: uuid("son_guncelleyen_kullanici_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_hasta_anamnez_hasta_id").using("btree", table.hastaId.asc().nullsLast().op("uuid_ops")),
	index("idx_hasta_anamnez_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	check("hasta_anamnez_durum_check", sql`durum = ANY (ARRAY['aktif'::text, 'cozuldu'::text])`),
	check("hasta_anamnez_olusturan_tip_check", sql`olusturan_tip = ANY (ARRAY['hasta'::text, 'personel'::text])`),
	check("hasta_anamnez_son_guncelleyen_tip_check", sql`son_guncelleyen_tip = ANY (ARRAY['hasta'::text, 'personel'::text])`),
]);

export const personelIzinTalebi = pgTable("personel_izin_talebi", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	personelId: uuid("personel_id").notNull(),
	tip: text().notNull(),
	baslangicTarih: date("baslangic_tarih").notNull(),
	bitisTarih: date("bitis_tarih").notNull(),
	gunSayisi: numeric("gun_sayisi").notNull(),
	gerekce: text(),
	belgeUrl: text("belge_url"),
	durum: text().default('beklemede').notNull(),
	redGerekce: text("red_gerekce"),
	degerlendirenKullaniciId: uuid("degerlendiren_kullanici_id"),
	degerlendirmeTarihi: timestamp("degerlendirme_tarihi", { withTimezone: true, mode: 'string' }),
	iptalEdenKullaniciId: uuid("iptal_eden_kullanici_id"),
	iptalTarihi: timestamp("iptal_tarihi", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_personel_izin_talebi_klinik_durum").using("btree", table.klinikId.asc().nullsLast().op("text_ops"), table.durum.asc().nullsLast().op("text_ops")),
	index("idx_personel_izin_talebi_personel").using("btree", table.personelId.asc().nullsLast().op("uuid_ops"), table.durum.asc().nullsLast().op("text_ops")),
	index("idx_personel_izin_talebi_tarih_araligi").using("btree", table.klinikId.asc().nullsLast().op("date_ops"), table.baslangicTarih.asc().nullsLast().op("date_ops"), table.bitisTarih.asc().nullsLast().op("uuid_ops")),
	check("personel_izin_talebi_tip_check", sql`tip = ANY (ARRAY['yillik'::text, 'mazeret'::text, 'ucretsiz'::text, 'idari'::text, 'telafi'::text])`),
	check("personel_izin_talebi_gun_sayisi_check", sql`gun_sayisi > (0)::numeric`),
	check("personel_izin_talebi_durum_check", sql`durum = ANY (ARRAY['beklemede'::text, 'onaylandi'::text, 'reddedildi'::text, 'iptal'::text])`),
	check("personel_izin_talebi_tarih_araligi", sql`bitis_tarih >= baslangic_tarih`),
	check("personel_izin_talebi_red_gerekce_zorunlu", sql`(durum <> 'reddedildi'::text) OR ((red_gerekce IS NOT NULL) AND (btrim(red_gerekce) <> ''::text))`),
]);

export const personelHesapHareket = pgTable("personel_hesap_hareket", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	personelId: uuid("personel_id").notNull(),
	tur: text().notNull(),
	tutar: numeric().notNull(),
	tarih: date().default(sql`CURRENT_DATE`).notNull(),
	aciklama: text(),
	kaynakId: uuid("kaynak_id"),
	ekleyenKullaniciId: uuid("ekleyen_kullanici_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	odemeTipi: text("odeme_tipi"),
	bankaHesapId: uuid("banka_hesap_id"),
}, (table) => [
	index("idx_personel_hesap_hareket_banka_hesap").using("btree", table.bankaHesapId.asc().nullsLast().op("uuid_ops")).where(sql`(banka_hesap_id IS NOT NULL)`),
	uniqueIndex("idx_personel_hesap_hareket_hakedis_tekil").using("btree", table.kaynakId.asc().nullsLast().op("uuid_ops")).where(sql`(tur = 'hakedis'::text)`),
	index("idx_personel_hesap_hareket_kaynak_id").using("btree", table.kaynakId.asc().nullsLast().op("uuid_ops")).where(sql`(kaynak_id IS NOT NULL)`),
	index("idx_personel_hesap_hareket_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	index("idx_personel_hesap_hareket_klinik_tarih").using("btree", table.klinikId.asc().nullsLast().op("date_ops"), table.tarih.asc().nullsLast().op("date_ops")),
	index("idx_personel_hesap_hareket_personel_tarih").using("btree", table.personelId.asc().nullsLast().op("date_ops"), table.tarih.asc().nullsLast().op("date_ops")),
	check("personel_hesap_hareket_tur_check", sql`tur = ANY (ARRAY['hakedis'::text, 'prim'::text, 'yol'::text, 'yemek'::text, 'mesai'::text, 'avans'::text, 'kesinti'::text, 'odeme'::text])`),
	check("personel_hesap_hareket_tutar_check", sql`tutar >= (0)::numeric`),
	check("personel_hesap_hareket_hakedis_kaynakli", sql`(tur <> 'hakedis'::text) OR (kaynak_id IS NOT NULL)`),
	check("personel_hesap_hareket_odeme_tipi_check", sql`odeme_tipi = ANY (ARRAY['nakit'::text, 'havale'::text])`),
]);

export const pozisyonlar = pgTable("pozisyonlar", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	sablonId: uuid("sablon_id"),
	ad: text().notNull(),
	grup: text().notNull(),
	sira: integer().default(0).notNull(),
	aktif: boolean().default(false).notNull(),
	sistemErisimi: boolean("sistem_erisimi").default(false).notNull(),
	varsayilanRol: kullaniciRolTipi("varsayilan_rol").default('terapist').notNull(),
	ucretTipi: text("ucret_tipi").default('aylik_maas').notNull(),
	puantajModu: text("puantaj_modu").default('gunluk').notNull(),
	ozelMi: boolean("ozel_mi").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_pozisyonlar_klinik").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	unique("pozisyonlar_klinik_id_ad_key").on(table.ad, table.klinikId),
	check("pozisyonlar_ucret_tipi_check", sql`ucret_tipi = ANY (ARRAY['aylik_maas'::text, 'prim_usulu'::text])`),
	check("pozisyonlar_puantaj_modu_check", sql`puantaj_modu = ANY (ARRAY['gunluk'::text, 'esnek'::text, 'takipsiz'::text])`),
]);

export const klinikBankaHesaplari = pgTable("klinik_banka_hesaplari", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	bankaAdi: text("banka_adi").notNull(),
	sube: text(),
	hesapSahibi: text("hesap_sahibi").notNull(),
	iban: text().notNull(),
	hesapTipi: text("hesap_tipi").default('klinik').notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_klinik_banka_hesaplari_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	check("klinik_banka_hesaplari_hesap_tipi_check", sql`hesap_tipi = ANY (ARRAY['klinik'::text, 'sahis'::text])`),
]);

export const nakitBankaHareketi = pgTable("nakit_banka_hareketi", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	tip: text().notNull(),
	kaynakKasa: boolean("kaynak_kasa").default(false).notNull(),
	kaynakBankaHesapId: uuid("kaynak_banka_hesap_id"),
	hedefKasa: boolean("hedef_kasa").default(false).notNull(),
	hedefBankaHesapId: uuid("hedef_banka_hesap_id"),
	odemeYontemi: text("odeme_yontemi"),
	karsiTarafAdi: text("karsi_taraf_adi"),
	karsiTarafBanka: text("karsi_taraf_banka"),
	karsiTarafIban: text("karsi_taraf_iban"),
	aciklama: text(),
	tutar: numeric().notNull(),
	tarih: date().default(sql`CURRENT_DATE`).notNull(),
	ekleyenKullaniciId: uuid("ekleyen_kullanici_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_nakit_banka_hareketi_hedef_banka").using("btree", table.hedefBankaHesapId.asc().nullsLast().op("uuid_ops")).where(sql`(hedef_banka_hesap_id IS NOT NULL)`),
	index("idx_nakit_banka_hareketi_kaynak_banka").using("btree", table.kaynakBankaHesapId.asc().nullsLast().op("uuid_ops")).where(sql`(kaynak_banka_hesap_id IS NOT NULL)`),
	index("idx_nakit_banka_hareketi_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	index("idx_nakit_banka_hareketi_klinik_tarih").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops"), table.tarih.asc().nullsLast().op("uuid_ops")),
	check("nakit_banka_hareketi_tip_check", sql`tip = ANY (ARRAY['giden'::text, 'gelen'::text, 'hesaplar_arasi'::text])`),
	check("nakit_banka_hareketi_odeme_yontemi_check", sql`odeme_yontemi = ANY (ARRAY['nakit'::text, 'banka_havalesi'::text])`),
	check("nakit_banka_hareketi_tutar_check", sql`tutar > (0)::numeric`),
	check("nakit_banka_hareketi_kaynak_kurali", sql`((tip = 'gelen'::text) AND (NOT kaynak_kasa) AND (kaynak_banka_hesap_id IS NULL)) OR ((tip = ANY (ARRAY['giden'::text, 'hesaplar_arasi'::text])) AND ((kaynak_kasa AND (kaynak_banka_hesap_id IS NULL)) OR ((NOT kaynak_kasa) AND (kaynak_banka_hesap_id IS NOT NULL))))`),
	check("nakit_banka_hareketi_hedef_kurali", sql`((tip = 'giden'::text) AND (NOT hedef_kasa) AND (hedef_banka_hesap_id IS NULL)) OR ((tip = ANY (ARRAY['gelen'::text, 'hesaplar_arasi'::text])) AND ((hedef_kasa AND (hedef_banka_hesap_id IS NULL)) OR ((NOT hedef_kasa) AND (hedef_banka_hesap_id IS NOT NULL))))`),
	check("nakit_banka_hareketi_farkli_hesap", sql`(tip <> 'hesaplar_arasi'::text) OR ((NOT (kaynak_kasa AND hedef_kasa)) AND ((kaynak_banka_hesap_id IS NULL) OR (kaynak_banka_hesap_id IS DISTINCT FROM hedef_banka_hesap_id))))) NOT VALID`),
]);

export const personelEgitim = pgTable("personel_egitim", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	personelId: uuid("personel_id").notNull(),
	derece: text(),
	okul: text(),
	bolum: text(),
	yil: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_personel_egitim_personel_id").using("btree", table.personelId.asc().nullsLast().op("uuid_ops")),
]);

export const hastaYorum = pgTable("hasta_yorum", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	hastaId: uuid("hasta_id").notNull(),
	randevuId: uuid("randevu_id").notNull(),
	tur: text().notNull(),
	yorum: text().notNull(),
	olusturanKullaniciId: uuid("olusturan_kullanici_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	puan: smallint(),
}, (table) => [
	index("idx_hasta_yorum_hasta_id").using("btree", table.hastaId.asc().nullsLast().op("uuid_ops")),
	index("idx_hasta_yorum_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	index("idx_hasta_yorum_randevu_id").using("btree", table.randevuId.asc().nullsLast().op("uuid_ops")),
	check("hasta_yorum_tur_check", sql`tur = ANY (ARRAY['terapist_yorumu'::text, 'randevu_yorumu'::text])`),
	check("hasta_yorum_puan_check", sql`(puan >= 1) AND (puan <= 5)`),
]);

export const islemTanimiAdim = pgTable("islem_tanimi_adim", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	islemTanimiId: uuid("islem_tanimi_id").notNull(),
	ad: text().notNull(),
	gerekliCihazId: uuid("gerekli_cihaz_id"),
	sureDakika: integer("sure_dakika"),
	sira: integer().default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	uygulayiciPozisyonId: uuid("uygulayici_pozisyon_id"),
}, (table) => [
	index("idx_islem_tanimi_adim_islem_id").using("btree", table.islemTanimiId.asc().nullsLast().op("uuid_ops")),
	index("idx_islem_tanimi_adim_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	index("idx_islem_tanimi_adim_uygulayici_pozisyon_id").using("btree", table.uygulayiciPozisyonId.asc().nullsLast().op("uuid_ops")),
	unique("islem_tanimi_adim_sira_tekil").on(table.islemTanimiId, table.sira),
	check("islem_tanimi_adim_sure_dakika_check", sql`(sure_dakika IS NULL) OR (sure_dakika >= 1)`),
]);

export const islemAdimiSablonu = pgTable("islem_adimi_sablonu", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	ad: text().notNull(),
	uygulayiciPozisyonId: uuid("uygulayici_pozisyon_id"),
	sureDakika: integer("sure_dakika"),
	aktif: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	gerekliCihazId: uuid("gerekli_cihaz_id"),
}, (table) => [
	index("idx_islem_adimi_sablonu_gerekli_cihaz_id").using("btree", table.gerekliCihazId.asc().nullsLast().op("uuid_ops")),
	index("idx_islem_adimi_sablonu_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	unique("islem_adimi_sablonu_klinik_id_ad_key").on(table.ad, table.klinikId),
	check("islem_adimi_sablonu_sure_dakika_check", sql`(sure_dakika IS NULL) OR (sure_dakika >= 1)`),
]);

export const randevuCihazRezervasyon = pgTable("randevu_cihaz_rezervasyon", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	randevuId: uuid("randevu_id").notNull(),
	cihazId: uuid("cihaz_id").notNull(),
	adimId: uuid("adim_id"),
	tur: text().notNull(),
	baslangic: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	bitis: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	// TODO: failed to parse database type 'tstzrange'
	zamanAraligi: tstzrange("zaman_araligi").generatedAlwaysAs(sql`tstzrange(baslangic, bitis, '[)'::text)`),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_randevu_cihaz_rezervasyon_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	index("idx_randevu_cihaz_rezervasyon_randevu_id").using("btree", table.randevuId.asc().nullsLast().op("uuid_ops")),
	check("randevu_cihaz_rezervasyon_check", sql`bitis > baslangic`),
	check("randevu_cihaz_rezervasyon_tur_check", sql`tur = ANY (ARRAY['adim'::text, 'manuel'::text])`),
]);

export const kasaDengeleme = pgTable("kasa_dengeleme", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	tutar: numeric().notNull(),
	aciklama: text(),
	ekleyenKullaniciId: uuid("ekleyen_kullanici_id"),
	ekleyenAd: text("ekleyen_ad").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_kasa_dengeleme_klinik_created").using("btree", table.klinikId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	check("kasa_dengeleme_tutar_check", sql`tutar <> (0)::numeric`),
]);

export const klinikKrediKartlari = pgTable("klinik_kredi_kartlari", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	kartTipi: text("kart_tipi").default('klinik').notNull(),
	kartAdi: text("kart_adi").notNull(),
	bankaAdi: text("banka_adi").notNull(),
	kartSahibi: text("kart_sahibi").default("").notNull(),
	sonDortHane: text("son_dort_hane"),
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_klinik_kredi_kartlari_klinik_id").using("btree", table.klinikId.asc().nullsLast().op("uuid_ops")),
	check("klinik_kredi_kartlari_kart_tipi_check", sql`kart_tipi = ANY (ARRAY['klinik'::text, 'sahis'::text])`),
	check("klinik_kredi_kartlari_son_dort_hane_check", sql`(son_dort_hane IS NULL) OR (son_dort_hane ~ '^\d{4}$'::text)`),
]);

export const klinikCariOdeme = pgTable("klinik_cari_odeme", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	tedarikciAdi: text("tedarikci_adi").notNull(),
	tutar: numeric({ precision: 12, scale:  2 }).notNull(),
	tarih: date().notNull(),
	odemeTipi: text("odeme_tipi").notNull(),
	bankaHesapId: uuid("banka_hesap_id"),
	krediKartiId: uuid("kredi_karti_id"),
	aciklama: text(),
	olusturanKullaniciId: uuid("olusturan_kullanici_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_klinik_cari_odeme_banka_hesap").using("btree", table.bankaHesapId.asc().nullsLast().op("uuid_ops")).where(sql`(banka_hesap_id IS NOT NULL)`),
	index("idx_klinik_cari_odeme_klinik_tarih").using("btree", table.klinikId.asc().nullsLast().op("date_ops"), table.tarih.asc().nullsLast().op("date_ops")),
	index("idx_klinik_cari_odeme_kredi_karti").using("btree", table.krediKartiId.asc().nullsLast().op("uuid_ops")).where(sql`(kredi_karti_id IS NOT NULL)`),
	index("idx_klinik_cari_odeme_tedarikci").using("btree", sql`klinik_id`, sql`tedarikci_anahtari(tedarikci_adi)`),
	check("klinik_cari_odeme_tedarikci_adi_check", sql`btrim(tedarikci_adi) <> ''::text`),
	check("klinik_cari_odeme_tutar_check", sql`tutar > (0)::numeric`),
	check("klinik_cari_odeme_odeme_tipi_check", sql`odeme_tipi = ANY (ARRAY['nakit'::text, 'havale'::text, 'kredi_karti'::text])`),
]);

export const klinikKrediKartiOdeme = pgTable("klinik_kredi_karti_odeme", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	krediKartiId: uuid("kredi_karti_id").notNull(),
	tutar: numeric({ precision: 12, scale:  2 }).notNull(),
	tarih: date().notNull(),
	odemeTipi: text("odeme_tipi").notNull(),
	bankaHesapId: uuid("banka_hesap_id"),
	aciklama: text(),
	olusturanKullaniciId: uuid("olusturan_kullanici_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_klinik_kredi_karti_odeme_banka_hesap").using("btree", table.bankaHesapId.asc().nullsLast().op("uuid_ops")).where(sql`(banka_hesap_id IS NOT NULL)`),
	index("idx_klinik_kredi_karti_odeme_kart").using("btree", table.krediKartiId.asc().nullsLast().op("uuid_ops")),
	index("idx_klinik_kredi_karti_odeme_klinik_tarih").using("btree", table.klinikId.asc().nullsLast().op("date_ops"), table.tarih.asc().nullsLast().op("date_ops")),
	check("klinik_kredi_karti_odeme_tutar_check", sql`tutar > (0)::numeric`),
	check("klinik_kredi_karti_odeme_odeme_tipi_check", sql`odeme_tipi = ANY (ARRAY['nakit'::text, 'havale'::text])`),
]);

export const resmiTatil = pgTable("resmi_tatil", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id"),
	tarih: date().notNull(),
	ad: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_resmi_tatil_tarih").using("btree", table.tarih.asc().nullsLast().op("date_ops")),
	unique("resmi_tatil_klinik_id_tarih_key").on(table.klinikId, table.tarih),
]);

export const resmiTatilOneri = pgTable("resmi_tatil_oneri", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	klinikId: uuid("klinik_id").notNull(),
	yil: integer().notNull(),
	bayram: text().notNull(),
	tarih: date().notNull(),
	ad: text().notNull(),
	kaynak: text().default('nager').notNull(),
	durum: text().default('bekliyor').notNull(),
	kararVerenId: uuid("karar_veren_id"),
	kararTarihi: timestamp("karar_tarihi", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_resmi_tatil_oneri_klinik_yil").using("btree", table.klinikId.asc().nullsLast().op("int4_ops"), table.yil.asc().nullsLast().op("uuid_ops"), table.bayram.asc().nullsLast().op("int4_ops")),
	unique("resmi_tatil_oneri_klinik_id_bayram_tarih_key").on(table.bayram, table.klinikId, table.tarih),
	check("resmi_tatil_oneri_yil_check", sql`(yil >= 2000) AND (yil <= 2100)`),
	check("resmi_tatil_oneri_bayram_check", sql`bayram = ANY (ARRAY['ramazan'::text, 'kurban'::text])`),
	check("resmi_tatil_oneri_durum_check", sql`durum = ANY (ARRAY['bekliyor'::text, 'onaylandi'::text, 'reddedildi'::text])`),
]);

export const hizSiniriSayac = pgTable("hiz_siniri_sayac", {
	anahtar: text().notNull(),
	pencereBaslangic: timestamp("pencere_baslangic", { withTimezone: true, mode: 'string' }).notNull(),
	sayac: integer().default(0).notNull(),
}, (table) => [
	index("hiz_siniri_sayac_pencere_idx").using("btree", table.pencereBaslangic.asc().nullsLast().op("timestamptz_ops")),
	primaryKey({ columns: [table.anahtar, table.pencereBaslangic], name: "hiz_siniri_sayac_pkey"}),
]);

export const auditLogVarsayilan = pgTable("audit_log_varsayilan", {
	id: uuid().defaultRandom().notNull(),
	klinikId: uuid("klinik_id"),
	kullaniciId: uuid("kullanici_id"),
	eylem: text().notNull(),
	hedefTablo: text("hedef_tablo"),
	hedefId: uuid("hedef_id"),
	detay: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	primaryKey({ columns: [table.createdAt, table.id], name: "audit_log_varsayilan_pkey"}),
]);

export const auditLog202610 = pgTable("audit_log_2026_10", {
	id: uuid().defaultRandom().notNull(),
	klinikId: uuid("klinik_id"),
	kullaniciId: uuid("kullanici_id"),
	eylem: text().notNull(),
	hedefTablo: text("hedef_tablo"),
	hedefId: uuid("hedef_id"),
	detay: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("audit_log_2026_10_klinik_id_created_at_idx").using("btree", table.klinikId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")),
	primaryKey({ columns: [table.createdAt, table.id], name: "audit_log_2026_10_pkey"}),
]);

export const auditLog202611 = pgTable("audit_log_2026_11", {
	id: uuid().defaultRandom().notNull(),
	klinikId: uuid("klinik_id"),
	kullaniciId: uuid("kullanici_id"),
	eylem: text().notNull(),
	hedefTablo: text("hedef_tablo"),
	hedefId: uuid("hedef_id"),
	detay: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("audit_log_2026_11_klinik_id_created_at_idx").using("btree", table.klinikId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")),
	primaryKey({ columns: [table.createdAt, table.id], name: "audit_log_2026_11_pkey"}),
]);

export const auditLog202612 = pgTable("audit_log_2026_12", {
	id: uuid().defaultRandom().notNull(),
	klinikId: uuid("klinik_id"),
	kullaniciId: uuid("kullanici_id"),
	eylem: text().notNull(),
	hedefTablo: text("hedef_tablo"),
	hedefId: uuid("hedef_id"),
	detay: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("audit_log_2026_12_klinik_id_created_at_idx").using("btree", table.klinikId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")),
	primaryKey({ columns: [table.createdAt, table.id], name: "audit_log_2026_12_pkey"}),
]);

export const auditLog202701 = pgTable("audit_log_2027_01", {
	id: uuid().defaultRandom().notNull(),
	klinikId: uuid("klinik_id"),
	kullaniciId: uuid("kullanici_id"),
	eylem: text().notNull(),
	hedefTablo: text("hedef_tablo"),
	hedefId: uuid("hedef_id"),
	detay: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("audit_log_2027_01_klinik_id_created_at_idx").using("btree", table.klinikId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")),
	primaryKey({ columns: [table.createdAt, table.id], name: "audit_log_2027_01_pkey"}),
]);
export const vHastaIlerleme = pgView("v_hasta_ilerleme", {	id: uuid(),
	klinikId: uuid("klinik_id"),
	hastaId: uuid("hasta_id"),
	olcekTanimiId: uuid("olcek_tanimi_id"),
	olcekKod: text("olcek_kod"),
	olcekAd: text("olcek_ad"),
	yorumYonu: text("yorum_yonu"),
	randevuId: uuid("randevu_id"),
	hesaplananSkor: numeric("hesaplanan_skor", { precision: 6, scale:  2 }),
	olcumTarihi: timestamp("olcum_tarihi", { withTimezone: true, mode: 'string' }),
}).as(sql`SELECT id, klinik_id, hasta_id, olcek_tanimi_id, olcek_kod, olcek_ad, yorum_yonu, randevu_id, hesaplanan_skor, olcum_tarihi FROM mv_hasta_ilerleme WHERE klinik_id = current_klinik_id() OR is_super_admin()`);

export const vHastaKarsilastirma = pgView("v_hasta_karsilastirma", {	karsilastirmaGrubuId: uuid("karsilastirma_grubu_id"),
	belgeId: uuid("belge_id"),
	hastaId: uuid("hasta_id"),
	klinikId: uuid("klinik_id"),
	bolge: text(),
	asama: text(),
	cekimTarihi: date("cekim_tarihi"),
	storagePath: text("storage_path"),
	thumbnailPath: text("thumbnail_path"),
}).with({"securityInvoker":true}).as(sql`SELECT karsilastirma_grubu_id, id AS belge_id, hasta_id, klinik_id, bolge, asama, cekim_tarihi, storage_path, thumbnail_path FROM hasta_belge mb WHERE karsilastirma_grubu_id IS NOT NULL ORDER BY karsilastirma_grubu_id, cekim_tarihi`);

export const mvHastaIlerleme = pgMaterializedView("mv_hasta_ilerleme", {	id: uuid(),
	klinikId: uuid("klinik_id"),
	hastaId: uuid("hasta_id"),
	olcekTanimiId: uuid("olcek_tanimi_id"),
	olcekKod: text("olcek_kod"),
	olcekAd: text("olcek_ad"),
	yorumYonu: text("yorum_yonu"),
	randevuId: uuid("randevu_id"),
	hesaplananSkor: numeric("hesaplanan_skor", { precision: 6, scale:  2 }),
	olcumTarihi: timestamp("olcum_tarihi", { withTimezone: true, mode: 'string' }),
}).as(sql`SELECT mo.id, mo.klinik_id, mo.hasta_id, mo.olcek_tanimi_id, ot.kod AS olcek_kod, ot.ad AS olcek_ad, ot.yorum_yonu, mo.randevu_id, mo.hesaplanan_skor, mo.olcum_tarihi FROM hasta_olcum mo JOIN olcek_tanimi ot ON ot.id = mo.olcek_tanimi_id`);

export const klinikKrediKartiHareketleri = pgView("klinik_kredi_karti_hareketleri", {	kaynak: text(),
	id: text(),
	klinikId: uuid("klinik_id"),
	krediKartiId: uuid("kredi_karti_id"),
	tarih: date(),
	tip: text(),
	tutar: numeric(),
	ad: text(),
	detay: text(),
	yontem: text(),
	bankaHesapId: uuid("banka_hesap_id"),
}).with({"securityInvoker":true}).as(sql`SELECT 'gider'::text AS kaynak, h.id::text AS id, h.klinik_id, h.kredi_karti_id, h.tarih, 'harcama'::text AS tip, h.tutar::numeric AS tutar, h.tedarikci_adi AS ad, h.aciklama AS detay, NULL::text AS yontem, NULL::uuid AS banka_hesap_id FROM klinik_harcama h WHERE h.odeme_tipi = 'kredi_karti'::text UNION ALL SELECT 'cari_odeme'::text AS kaynak, o.id::text AS id, o.klinik_id, o.kredi_karti_id, o.tarih, 'harcama'::text AS tip, o.tutar::numeric AS tutar, o.tedarikci_adi AS ad, o.aciklama AS detay, NULL::text AS yontem, NULL::uuid AS banka_hesap_id FROM klinik_cari_odeme o WHERE o.odeme_tipi = 'kredi_karti'::text UNION ALL SELECT 'kart_odemesi'::text AS kaynak, p.id::text AS id, p.klinik_id, p.kredi_karti_id, p.tarih, 'odeme'::text AS tip, p.tutar::numeric AS tutar, NULL::text AS ad, p.aciklama AS detay, p.odeme_tipi AS yontem, p.banka_hesap_id FROM klinik_kredi_karti_odeme p`);

export const vHastaCariOzet = pgView("v_hasta_cari_ozet", {	hastaId: uuid("hasta_id"),
	klinikId: uuid("klinik_id"),
	adSoyad: text("ad_soyad"),
	kalanBakiye: numeric("kalan_bakiye"),
	tahsilEdilen: numeric("tahsil_edilen"),
	toplamBakiye: numeric("toplam_bakiye"),
}).with({"securityInvoker":true}).as(sql`SELECT h.id AS hasta_id, h.klinik_id, h.ad_soyad, cari.borc - cari.tahsil AS kalan_bakiye, cari.tahsil AS tahsil_edilen, cari.borc AS toplam_bakiye FROM hasta h JOIN LATERAL ( SELECT COALESCE(sum(b.tutar - b.iskonto_tutari) FILTER (WHERE b.tur = 'borc'::text), 0::numeric) AS borc, COALESCE(sum( CASE WHEN b.tur = 'kredi'::text THEN b.tutar WHEN b.tur = 'odeme'::text AND b.odeme_id IS NULL THEN b.tutar WHEN b.tur = 'iade'::text AND b.odeme_id IS NULL THEN - b.tutar ELSE 0::numeric END), 0::numeric) AS tahsil FROM hasta_bakiye_hareket b WHERE b.hasta_id = h.id) cari ON true WHERE (cari.borc - cari.tahsil) > 0::numeric`);

export const vHastaDetayOzet = pgView("v_hasta_detay_ozet", {	hastaId: uuid("hasta_id"),
	klinikId: uuid("klinik_id"),
	sonVasSkoru: numeric("son_vas_skoru", { precision: 6, scale:  2 }),
	sonVasTarihi: timestamp("son_vas_tarihi", { withTimezone: true, mode: 'string' }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	aktifHedefSayisi: bigint("aktif_hedef_sayisi", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kalanPaketHakki: bigint("kalan_paket_hakki", { mode: "number" }),
	bakiye: numeric(),
	sonSeansTarihi: timestamp("son_seans_tarihi", { withTimezone: true, mode: 'string' }),
	aktifRiskBayrakSayisi: integer("aktif_risk_bayrak_sayisi"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	noShowSayisi: bigint("no_show_sayisi", { mode: "number" }),
	sonrakiRandevuTarihi: timestamp("sonraki_randevu_tarihi", { withTimezone: true, mode: 'string' }),
	aktifProtokolAd: text("aktif_protokol_ad"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	olcumSayisi: bigint("olcum_sayisi", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	belgeSayisi: bigint("belge_sayisi", { mode: "number" }),
	sonIletisimTarihi: timestamp("son_iletisim_tarihi", { withTimezone: true, mode: 'string' }),
}).with({"securityInvoker":true}).as(sql`SELECT vmo.hasta_id, vmo.klinik_id, vmo.son_vas_skoru, vmo.son_vas_tarihi, vmo.aktif_hedef_sayisi, vmo.kalan_paket_hakki, vmo.bakiye, vmo.son_seans_tarihi, vmo.aktif_risk_bayrak_sayisi, vmo.no_show_sayisi, randevu.sonraki_randevu_tarihi, protokol.aktif_protokol_ad, COALESCE(olcum.olcum_sayisi, 0::bigint) AS olcum_sayisi, COALESCE(belge.belge_sayisi, 0::bigint) AS belge_sayisi, iletisim.son_iletisim_tarihi FROM v_hasta_ozet vmo LEFT JOIN LATERAL ( SELECT r.baslangic AS sonraki_randevu_tarihi FROM randevu r WHERE r.hasta_id = vmo.hasta_id AND r.durum = 'planlandi'::randevu_durum_tipi AND r.baslangic >= now() ORDER BY r.baslangic LIMIT 1) randevu ON true LEFT JOIN LATERAL ( SELECT it.ad AS aktif_protokol_ad FROM hasta_protokol mp JOIN islem_tanimi it ON it.id = mp.islem_tanimi_id WHERE mp.hasta_id = vmo.hasta_id AND mp.durum = 'aktif'::text ORDER BY mp.baslangic_tarihi DESC LIMIT 1) protokol ON true LEFT JOIN LATERAL ( SELECT count(*) AS olcum_sayisi FROM hasta_olcum mo WHERE mo.hasta_id = vmo.hasta_id) olcum ON true LEFT JOIN LATERAL ( SELECT count(*) AS belge_sayisi FROM hasta_belge mb WHERE mb.hasta_id = vmo.hasta_id AND mb.is_guncel = true AND mb.deleted_at IS NULL) belge ON true LEFT JOIN LATERAL ( SELECT max(mil.olusturma_tarihi) AS son_iletisim_tarihi FROM hasta_iletisim_log mil WHERE mil.hasta_id = vmo.hasta_id) iletisim ON true`);

export const vHastaOzet = pgView("v_hasta_ozet", {	hastaId: uuid("hasta_id"),
	klinikId: uuid("klinik_id"),
	sonVasSkoru: numeric("son_vas_skoru", { precision: 6, scale:  2 }),
	sonVasTarihi: timestamp("son_vas_tarihi", { withTimezone: true, mode: 'string' }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	aktifHedefSayisi: bigint("aktif_hedef_sayisi", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kalanPaketHakki: bigint("kalan_paket_hakki", { mode: "number" }),
	bakiye: numeric(),
	sonSeansTarihi: timestamp("son_seans_tarihi", { withTimezone: true, mode: 'string' }),
	aktifRiskBayrakSayisi: integer("aktif_risk_bayrak_sayisi"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	noShowSayisi: bigint("no_show_sayisi", { mode: "number" }),
}).with({"securityInvoker":true}).as(sql`SELECT m.id AS hasta_id, m.klinik_id, vas.son_skor AS son_vas_skoru, vas.son_tarih AS son_vas_tarihi, COALESCE(hedef.aktif_hedef_sayisi, 0::bigint) AS aktif_hedef_sayisi, COALESCE(paket.kalan_paket_hakki, 0::bigint) AS kalan_paket_hakki, COALESCE(bakiye.bakiye, 0::numeric) AS bakiye, seans.son_seans_tarihi, jsonb_array_length(COALESCE(m.risk_bayraklari, '[]'::jsonb)) AS aktif_risk_bayrak_sayisi, COALESCE(noshow.no_show_sayisi, 0::bigint) AS no_show_sayisi FROM hasta m LEFT JOIN LATERAL ( SELECT mo.hesaplanan_skor AS son_skor, mo.olcum_tarihi AS son_tarih FROM hasta_olcum mo JOIN olcek_tanimi ot ON ot.id = mo.olcek_tanimi_id WHERE mo.hasta_id = m.id AND ot.kod = 'VAS'::text ORDER BY mo.olcum_tarihi DESC LIMIT 1) vas ON true LEFT JOIN LATERAL ( SELECT count(*) AS aktif_hedef_sayisi FROM hasta_hedef mh WHERE mh.hasta_id = m.id AND mh.durum = 'aktif'::text) hedef ON true LEFT JOIN LATERAL ( SELECT sum(ps.kalan_adet) AS kalan_paket_hakki FROM paket_satis ps WHERE ps.hasta_id = m.id AND ps.durum = 'aktif'::text) paket ON true LEFT JOIN LATERAL ( SELECT sum( CASE WHEN mb.tur = 'kredi'::text THEN mb.tutar WHEN mb.tur = 'borc'::text THEN - (mb.tutar - mb.iskonto_tutari) WHEN mb.tur = 'odeme'::text AND mb.odeme_id IS NULL THEN mb.tutar WHEN mb.tur = 'iade'::text AND mb.odeme_id IS NULL THEN - mb.tutar ELSE 0::numeric END) AS bakiye FROM hasta_bakiye_hareket mb WHERE mb.hasta_id = m.id) bakiye ON true LEFT JOIN LATERAL ( SELECT max(r.baslangic) AS son_seans_tarihi FROM randevu r WHERE r.hasta_id = m.id AND r.durum = 'geldi'::randevu_durum_tipi) seans ON true LEFT JOIN LATERAL ( SELECT count(*) AS no_show_sayisi FROM randevu r WHERE r.hasta_id = m.id AND r.durum = 'gelmedi'::randevu_durum_tipi) noshow ON true`);

export const vPersonelBilgiDurumu = pgView("v_personel_bilgi_durumu", {	personelId: uuid("personel_id"),
	bilgilerTamam: boolean("bilgiler_tamam"),
}).with({"securityInvoker":true}).as(sql`SELECT p.id AS personel_id, p.dogum_tarihi IS NOT NULL AND (COALESCE(p.il, ''::text) <> ''::text OR COALESCE(p.adres, ''::text) <> ''::text) AND (EXISTS ( SELECT 1 FROM personel_acil_kisi ak WHERE ak.personel_id = p.id)) AND (EXISTS ( SELECT 1 FROM personel_hassas ph WHERE ph.personel_id = p.id AND (ph.tc_kimlik IS NOT NULL OR ph.pasaport_no IS NOT NULL))) AND (k.rol IS DISTINCT FROM 'terapist'::kullanici_rol_tipi OR (EXISTS ( SELECT 1 FROM personel_mesleki_belge mb WHERE mb.personel_id = p.id AND (mb.diploma_no IS NOT NULL OR mb.uzmanlik_belge_no IS NOT NULL)))) AS bilgiler_tamam FROM personel p LEFT JOIN kullanici k ON k.id = p.kullanici_id`);

export const vPersonelHesapBakiye = pgView("v_personel_hesap_bakiye", {	personelId: uuid("personel_id"),
	klinikId: uuid("klinik_id"),
	toplamHakedis: numeric("toplam_hakedis"),
	toplamOdenen: numeric("toplam_odenen"),
	bakiye: numeric(),
}).with({"securityInvoker":true}).as(sql`SELECT id AS personel_id, klinik_id, COALESCE(( SELECT sum(h.tutar) AS sum FROM personel_hesap_hareket h WHERE h.personel_id = p.id AND (h.tur = ANY (ARRAY['hakedis'::text, 'prim'::text, 'yol'::text, 'yemek'::text, 'mesai'::text]))), 0::numeric) AS toplam_hakedis, COALESCE(( SELECT sum(h.tutar) AS sum FROM personel_hesap_hareket h WHERE h.personel_id = p.id AND (h.tur = ANY (ARRAY['avans'::text, 'kesinti'::text, 'odeme'::text]))), 0::numeric) AS toplam_odenen, COALESCE(( SELECT sum(h.tutar) AS sum FROM personel_hesap_hareket h WHERE h.personel_id = p.id AND (h.tur = ANY (ARRAY['hakedis'::text, 'prim'::text, 'yol'::text, 'yemek'::text, 'mesai'::text]))), 0::numeric) - COALESCE(( SELECT sum(h.tutar) AS sum FROM personel_hesap_hareket h WHERE h.personel_id = p.id AND (h.tur = ANY (ARRAY['avans'::text, 'kesinti'::text, 'odeme'::text]))), 0::numeric) AS bakiye FROM personel p`);

export const vPersonelIzinBakiye = pgView("v_personel_izin_bakiye", {	personelId: uuid("personel_id"),
	klinikId: uuid("klinik_id"),
	hakGun: numeric("hak_gun"),
	devirGun: numeric("devir_gun"),
	duzeltmeGun: numeric("duzeltme_gun"),
	onaylananGun: numeric("onaylanan_gun"),
	beklemedeGun: numeric("beklemede_gun"),
	kalanGun: numeric("kalan_gun"),
}).with({"securityInvoker":true}).as(sql`SELECT id AS personel_id, klinik_id, personel_izin_hak_gun_hesapla(id) AS hak_gun, izin_devir_gun AS devir_gun, izin_duzeltme_gun AS duzeltme_gun, COALESCE(( SELECT sum(t.gun_sayisi) AS sum FROM personel_izin_talebi t WHERE t.personel_id = p.id AND t.tip = 'yillik'::text AND t.durum = 'onaylandi'::text), 0::numeric) AS onaylanan_gun, COALESCE(( SELECT sum(t.gun_sayisi) AS sum FROM personel_izin_talebi t WHERE t.personel_id = p.id AND t.tip = 'yillik'::text AND t.durum = 'beklemede'::text), 0::numeric) AS beklemede_gun, personel_izin_hak_gun_hesapla(id) + izin_devir_gun + izin_duzeltme_gun - COALESCE(( SELECT sum(t.gun_sayisi) AS sum FROM personel_izin_talebi t WHERE t.personel_id = p.id AND t.tip = 'yillik'::text AND t.durum = 'onaylandi'::text), 0::numeric) - COALESCE(( SELECT sum(t.gun_sayisi) AS sum FROM personel_izin_talebi t WHERE t.personel_id = p.id AND t.tip = 'yillik'::text AND t.durum = 'beklemede'::text), 0::numeric) AS kalan_gun FROM personel p`);
/** EL İLE EKLENDİ (scripts/dev/sema-duzelt.mjs): drizzle-kit bölümlü (PARTITION BY RANGE) ana tabloyu üretmiyor. Yazma/okuma ana tablo üzerinden yapılır. */
export const auditLog = pgTable("audit_log", {
	id: uuid().defaultRandom().notNull(),
	klinikId: uuid("klinik_id"),
	kullaniciId: uuid("kullanici_id"),
	eylem: text().notNull(),
	hedefTablo: text("hedef_tablo"),
	hedefId: uuid("hedef_id"),
	detay: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
})
