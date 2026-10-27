import { relations } from "drizzle-orm/relations";
import { klinik, kimlikKullanici, hasta, oturum, islemKategori, odeme, odemeSatiri, egzersizKutuphanesi, evEgzersizProgrami, terapist, evEgzersizKalemi, evEgzersizTakip, seansChecklistSablonu, kimlikHesap, randevuChecklist, randevu, hastaAnket, randevuOnForm, islemTanimi, islemTanimiFiyatGecmisi, kullanici, vardiyaTuru, personelVardiyaAtama, personel, klinikBankaHesaplari, pozisyonlar, oda, cihaz, periyodikRandevu, paketSatis, tedaviProtokolu, klinikAyarlar, paket, odemeKalemi, hastaBakiyeHareket, fatura, hastaKullanici, randevuIptalTalebi, hastaHassas, islemKontrendikasyon, hastaHedef, olcekTanimi, hastaOlcum, hastaIletisimLog, hastaIliski, hastaSigorta, hastaBelge, hastaOnam, hastaVucutHaritasiIsareti, hastaProtokol, klinikHarcama, klinikArac, klinikKrediKartlari, personelHassas, personelAcilKisi, personelMeslekiBelge, tedaviProtokoluAdimi, klinikMuhasebeEntegrasyonu, isBasvurusu, anketYaniti, iskontoOranlari, personelPuantajDonem, personelPuantaj, personelIzinTalebi, personelUcret, kamusalOdeme, seansDegerlendirme, randevuTalebi, destekTalebi, mesajKurallari, mesajKuyrugu, mesajKredileri, mesajKrediHareketleri, hastaAnamnez, personelHesapHareket, pozisyonSablonlari, nakitBankaHareketi, personelEgitim, hastaYorum, islemTanimiAdim, islemAdimiSablonu, randevuCihazRezervasyon, kasaDengeleme, klinikCariOdeme, klinikKrediKartiOdeme, resmiTatil, resmiTatilOneri, auditLogVarsayilan, auditLog202610, auditLog202611, auditLog202612, auditLog202701 } from "./schema";

export const kimlikKullaniciRelations = relations(kimlikKullanici, ({one, many}) => ({
	klinik: one(klinik, {
		fields: [kimlikKullanici.klinikId],
		references: [klinik.id]
	}),
	hasta: one(hasta, {
		fields: [kimlikKullanici.hastaId],
		references: [hasta.id]
	}),
	oturums: many(oturum),
	kimlikHesaps: many(kimlikHesap),
	kullanicis: many(kullanici),
	hastaKullanicis: many(hastaKullanici),
}));

export const klinikRelations = relations(klinik, ({one, many}) => ({
	kimlikKullanicis: many(kimlikKullanici),
	islemKategoris: many(islemKategori),
	egzersizKutuphanesis: many(egzersizKutuphanesi),
	evEgzersizProgramis: many(evEgzersizProgrami),
	evEgzersizTakips: many(evEgzersizTakip),
	seansChecklistSablonus: many(seansChecklistSablonu),
	randevuChecklists: many(randevuChecklist),
	hastaAnkets: many(hastaAnket),
	randevuOnForms: many(randevuOnForm),
	islemTanimiFiyatGecmisis: many(islemTanimiFiyatGecmisi),
	vardiyaTurus: many(vardiyaTuru),
	personelVardiyaAtamas: many(personelVardiyaAtama),
	klinikBankaHesaplari: one(klinikBankaHesaplari, {
		fields: [klinik.krediKartiTahsilatBankaHesapId],
		references: [klinikBankaHesaplari.id],
		relationName: "klinik_krediKartiTahsilatBankaHesapId_klinikBankaHesaplari_id"
	}),
	kullanicis: many(kullanici),
	personels: many(personel),
	terapists: many(terapist),
	hastas: many(hasta),
	odas: many(oda),
	cihazs: many(cihaz),
	randevus: many(randevu),
	klinikAyarlars: many(klinikAyarlar),
	islemTanimis: many(islemTanimi),
	pakets: many(paket),
	odemes: many(odeme),
	paketSatis: many(paketSatis),
	hastaBakiyeHarekets: many(hastaBakiyeHareket),
	faturas: many(fatura),
	randevuIptalTalebis: many(randevuIptalTalebi),
	hastaHassas: many(hastaHassas),
	periyodikRandevus: many(periyodikRandevu),
	islemKontrendikasyons: many(islemKontrendikasyon),
	hastaHedefs: many(hastaHedef),
	olcekTanimis: many(olcekTanimi),
	hastaOlcums: many(hastaOlcum),
	hastaIletisimLogs: many(hastaIletisimLog),
	hastaIliskis: many(hastaIliski),
	hastaSigortas: many(hastaSigorta),
	hastaBelges: many(hastaBelge),
	hastaOnams: many(hastaOnam),
	hastaVucutHaritasiIsaretis: many(hastaVucutHaritasiIsareti),
	hastaProtokols: many(hastaProtokol),
	klinikHarcamas: many(klinikHarcama),
	tedaviProtokolus: many(tedaviProtokolu),
	tedaviProtokoluAdimis: many(tedaviProtokoluAdimi),
	klinikMuhasebeEntegrasyonus: many(klinikMuhasebeEntegrasyonu),
	isBasvurusus: many(isBasvurusu),
	anketYanitis: many(anketYaniti),
	iskontoOranlaris: many(iskontoOranlari),
	personelPuantajDonems: many(personelPuantajDonem),
	personelPuantajs: many(personelPuantaj),
	personelUcrets: many(personelUcret),
	klinikAracs: many(klinikArac),
	kamusalOdemes: many(kamusalOdeme),
	seansDegerlendirmes: many(seansDegerlendirme),
	randevuTalebis: many(randevuTalebi),
	destekTalebis: many(destekTalebi),
	mesajKurallaris: many(mesajKurallari),
	mesajKuyrugus: many(mesajKuyrugu),
	mesajKredileris: many(mesajKredileri),
	mesajKrediHareketleris: many(mesajKrediHareketleri),
	hastaAnamnezs: many(hastaAnamnez),
	personelIzinTalebis: many(personelIzinTalebi),
	personelHesapHarekets: many(personelHesapHareket),
	pozisyonlars: many(pozisyonlar),
	klinikBankaHesaplaris: many(klinikBankaHesaplari, {
		relationName: "klinikBankaHesaplari_klinikId_klinik_id"
	}),
	nakitBankaHareketis: many(nakitBankaHareketi),
	hastaYorums: many(hastaYorum),
	islemTanimiAdims: many(islemTanimiAdim),
	islemAdimiSablonus: many(islemAdimiSablonu),
	randevuCihazRezervasyons: many(randevuCihazRezervasyon),
	kasaDengelemes: many(kasaDengeleme),
	klinikKrediKartlaris: many(klinikKrediKartlari),
	klinikCariOdemes: many(klinikCariOdeme),
	klinikKrediKartiOdemes: many(klinikKrediKartiOdeme),
	resmiTatils: many(resmiTatil),
	resmiTatilOneris: many(resmiTatilOneri),
	auditLogVarsayilans: many(auditLogVarsayilan),
	auditLog202610s: many(auditLog202610),
	auditLog202611s: many(auditLog202611),
	auditLog202612s: many(auditLog202612),
	auditLog202701s: many(auditLog202701),
}));

export const hastaRelations = relations(hasta, ({one, many}) => ({
	kimlikKullanicis: many(kimlikKullanici),
	evEgzersizProgramis: many(evEgzersizProgrami),
	hastaAnkets: many(hastaAnket),
	randevuOnForms: many(randevuOnForm),
	klinik: one(klinik, {
		fields: [hasta.klinikId],
		references: [klinik.id]
	}),
	kullanici_kvkkOnaylayanKullaniciId: one(kullanici, {
		fields: [hasta.kvkkOnaylayanKullaniciId],
		references: [kullanici.id],
		relationName: "hasta_kvkkOnaylayanKullaniciId_kullanici_id"
	}),
	kullanici_ozelNitelikliOnaylayanKullaniciId: one(kullanici, {
		fields: [hasta.ozelNitelikliOnaylayanKullaniciId],
		references: [kullanici.id],
		relationName: "hasta_ozelNitelikliOnaylayanKullaniciId_kullanici_id"
	}),
	kullanici_ticariIletiOnaylayanKullaniciId: one(kullanici, {
		fields: [hasta.ticariIletiOnaylayanKullaniciId],
		references: [kullanici.id],
		relationName: "hasta_ticariIletiOnaylayanKullaniciId_kullanici_id"
	}),
	randevus: many(randevu),
	odemes: many(odeme),
	paketSatis: many(paketSatis),
	hastaBakiyeHarekets: many(hastaBakiyeHareket),
	hastaKullanicis: many(hastaKullanici),
	randevuIptalTalebis: many(randevuIptalTalebi),
	hastaHassas: many(hastaHassas),
	periyodikRandevus: many(periyodikRandevu),
	hastaHedefs: many(hastaHedef),
	hastaOlcums: many(hastaOlcum),
	hastaIletisimLogs: many(hastaIletisimLog),
	hastaIliskis_hastaId: many(hastaIliski, {
		relationName: "hastaIliski_hastaId_hasta_id"
	}),
	hastaIliskis_iliskiliHastaId: many(hastaIliski, {
		relationName: "hastaIliski_iliskiliHastaId_hasta_id"
	}),
	hastaSigortas: many(hastaSigorta),
	hastaBelges: many(hastaBelge),
	hastaOnams: many(hastaOnam),
	hastaVucutHaritasiIsaretis: many(hastaVucutHaritasiIsareti),
	hastaProtokols: many(hastaProtokol),
	seansDegerlendirmes: many(seansDegerlendirme),
	randevuTalebis: many(randevuTalebi),
	hastaAnamnezs: many(hastaAnamnez),
	hastaYorums: many(hastaYorum),
}));

export const oturumRelations = relations(oturum, ({one}) => ({
	kimlikKullanici: one(kimlikKullanici, {
		fields: [oturum.kullaniciId],
		references: [kimlikKullanici.id]
	}),
}));

export const islemKategoriRelations = relations(islemKategori, ({one, many}) => ({
	klinik: one(klinik, {
		fields: [islemKategori.klinikId],
		references: [klinik.id]
	}),
	islemTanimis: many(islemTanimi),
}));

export const odemeSatiriRelations = relations(odemeSatiri, ({one}) => ({
	odeme: one(odeme, {
		fields: [odemeSatiri.odemeId],
		references: [odeme.id]
	}),
}));

export const odemeRelations = relations(odeme, ({one, many}) => ({
	odemeSatiris: many(odemeSatiri),
	klinik: one(klinik, {
		fields: [odeme.klinikId],
		references: [klinik.id]
	}),
	hasta: one(hasta, {
		fields: [odeme.hastaId],
		references: [hasta.id]
	}),
	kullanici: one(kullanici, {
		fields: [odeme.olusturanKullaniciId],
		references: [kullanici.id]
	}),
	paketSatis: many(paketSatis),
	odemeKalemis: many(odemeKalemi),
	hastaBakiyeHarekets: many(hastaBakiyeHareket),
	faturas: many(fatura),
}));

export const egzersizKutuphanesiRelations = relations(egzersizKutuphanesi, ({one, many}) => ({
	klinik: one(klinik, {
		fields: [egzersizKutuphanesi.klinikId],
		references: [klinik.id]
	}),
	evEgzersizKalemis: many(evEgzersizKalemi),
}));

export const evEgzersizProgramiRelations = relations(evEgzersizProgrami, ({one, many}) => ({
	klinik: one(klinik, {
		fields: [evEgzersizProgrami.klinikId],
		references: [klinik.id]
	}),
	hasta: one(hasta, {
		fields: [evEgzersizProgrami.hastaId],
		references: [hasta.id]
	}),
	terapist: one(terapist, {
		fields: [evEgzersizProgrami.atayanTerapistId],
		references: [terapist.id]
	}),
	evEgzersizKalemis: many(evEgzersizKalemi),
	evEgzersizTakips: many(evEgzersizTakip),
}));

export const terapistRelations = relations(terapist, ({one, many}) => ({
	evEgzersizProgramis: many(evEgzersizProgrami),
	klinik: one(klinik, {
		fields: [terapist.klinikId],
		references: [klinik.id]
	}),
	personel: one(personel, {
		fields: [terapist.personelId],
		references: [personel.id]
	}),
	randevus: many(randevu),
	periyodikRandevus: many(periyodikRandevu),
	hastaProtokols: many(hastaProtokol),
	randevuTalebis: many(randevuTalebi),
}));

export const evEgzersizKalemiRelations = relations(evEgzersizKalemi, ({one, many}) => ({
	evEgzersizProgrami: one(evEgzersizProgrami, {
		fields: [evEgzersizKalemi.programId],
		references: [evEgzersizProgrami.id]
	}),
	egzersizKutuphanesi: one(egzersizKutuphanesi, {
		fields: [evEgzersizKalemi.egzersizId],
		references: [egzersizKutuphanesi.id]
	}),
	evEgzersizTakips: many(evEgzersizTakip),
}));

export const evEgzersizTakipRelations = relations(evEgzersizTakip, ({one}) => ({
	klinik: one(klinik, {
		fields: [evEgzersizTakip.klinikId],
		references: [klinik.id]
	}),
	evEgzersizProgrami: one(evEgzersizProgrami, {
		fields: [evEgzersizTakip.programId],
		references: [evEgzersizProgrami.id]
	}),
	evEgzersizKalemi: one(evEgzersizKalemi, {
		fields: [evEgzersizTakip.kalemId],
		references: [evEgzersizKalemi.id]
	}),
}));

export const seansChecklistSablonuRelations = relations(seansChecklistSablonu, ({one, many}) => ({
	klinik: one(klinik, {
		fields: [seansChecklistSablonu.klinikId],
		references: [klinik.id]
	}),
	randevuChecklists: many(randevuChecklist),
}));

export const kimlikHesapRelations = relations(kimlikHesap, ({one}) => ({
	kimlikKullanici: one(kimlikKullanici, {
		fields: [kimlikHesap.kullaniciId],
		references: [kimlikKullanici.id]
	}),
}));

export const randevuChecklistRelations = relations(randevuChecklist, ({one}) => ({
	klinik: one(klinik, {
		fields: [randevuChecklist.klinikId],
		references: [klinik.id]
	}),
	randevu: one(randevu, {
		fields: [randevuChecklist.randevuId],
		references: [randevu.id]
	}),
	seansChecklistSablonu: one(seansChecklistSablonu, {
		fields: [randevuChecklist.sablonId],
		references: [seansChecklistSablonu.id]
	}),
}));

export const randevuRelations = relations(randevu, ({one, many}) => ({
	randevuChecklists: many(randevuChecklist),
	randevuOnForms: many(randevuOnForm),
	terapist: one(terapist, {
		fields: [randevu.terapistId],
		references: [terapist.id]
	}),
	oda: one(oda, {
		fields: [randevu.odaId],
		references: [oda.id]
	}),
	cihaz: one(cihaz, {
		fields: [randevu.cihazId],
		references: [cihaz.id]
	}),
	klinik: one(klinik, {
		fields: [randevu.klinikId],
		references: [klinik.id]
	}),
	hasta: one(hasta, {
		fields: [randevu.hastaId],
		references: [hasta.id]
	}),
	kullanici_olusturanKullaniciId: one(kullanici, {
		fields: [randevu.olusturanKullaniciId],
		references: [kullanici.id],
		relationName: "randevu_olusturanKullaniciId_kullanici_id"
	}),
	islemTanimi: one(islemTanimi, {
		fields: [randevu.islemTanimiId],
		references: [islemTanimi.id]
	}),
	periyodikRandevu: one(periyodikRandevu, {
		fields: [randevu.periyodikRandevuId],
		references: [periyodikRandevu.id]
	}),
	paketSati: one(paketSatis, {
		fields: [randevu.paketSatisId],
		references: [paketSatis.id]
	}),
	personel: one(personel, {
		fields: [randevu.antrenorId],
		references: [personel.id]
	}),
	tedaviProtokolu: one(tedaviProtokolu, {
		fields: [randevu.tedaviProtokoluId],
		references: [tedaviProtokolu.id]
	}),
	kullanici_tamamlayanKullaniciId: one(kullanici, {
		fields: [randevu.tamamlayanKullaniciId],
		references: [kullanici.id],
		relationName: "randevu_tamamlayanKullaniciId_kullanici_id"
	}),
	kullanici_iptalEdenKullaniciId: one(kullanici, {
		fields: [randevu.iptalEdenKullaniciId],
		references: [kullanici.id],
		relationName: "randevu_iptalEdenKullaniciId_kullanici_id"
	}),
	hastaBakiyeHarekets: many(hastaBakiyeHareket),
	randevuIptalTalebis: many(randevuIptalTalebi),
	hastaOlcums: many(hastaOlcum),
	hastaIletisimLogs: many(hastaIletisimLog),
	hastaVucutHaritasiIsaretis: many(hastaVucutHaritasiIsareti),
	seansDegerlendirmes: many(seansDegerlendirme),
	randevuTalebis: many(randevuTalebi),
	hastaYorums: many(hastaYorum),
	randevuCihazRezervasyons: many(randevuCihazRezervasyon),
}));

export const hastaAnketRelations = relations(hastaAnket, ({one}) => ({
	klinik: one(klinik, {
		fields: [hastaAnket.klinikId],
		references: [klinik.id]
	}),
	hasta: one(hasta, {
		fields: [hastaAnket.hastaId],
		references: [hasta.id]
	}),
}));

export const randevuOnFormRelations = relations(randevuOnForm, ({one}) => ({
	klinik: one(klinik, {
		fields: [randevuOnForm.klinikId],
		references: [klinik.id]
	}),
	randevu: one(randevu, {
		fields: [randevuOnForm.randevuId],
		references: [randevu.id]
	}),
	hasta: one(hasta, {
		fields: [randevuOnForm.hastaId],
		references: [hasta.id]
	}),
}));

export const islemTanimiFiyatGecmisiRelations = relations(islemTanimiFiyatGecmisi, ({one}) => ({
	islemTanimi: one(islemTanimi, {
		fields: [islemTanimiFiyatGecmisi.islemTanimiId],
		references: [islemTanimi.id]
	}),
	klinik: one(klinik, {
		fields: [islemTanimiFiyatGecmisi.klinikId],
		references: [klinik.id]
	}),
	kullanici: one(kullanici, {
		fields: [islemTanimiFiyatGecmisi.degistirenKullaniciId],
		references: [kullanici.id]
	}),
}));

export const islemTanimiRelations = relations(islemTanimi, ({one, many}) => ({
	islemTanimiFiyatGecmisis: many(islemTanimiFiyatGecmisi),
	randevus: many(randevu),
	islemKategori: one(islemKategori, {
		fields: [islemTanimi.islemKategoriId],
		references: [islemKategori.id]
	}),
	klinik: one(klinik, {
		fields: [islemTanimi.klinikId],
		references: [klinik.id]
	}),
	pakets: many(paket),
	odemeKalemis: many(odemeKalemi),
	periyodikRandevus: many(periyodikRandevu),
	islemKontrendikasyons: many(islemKontrendikasyon),
	hastaProtokols: many(hastaProtokol),
	tedaviProtokoluAdimis: many(tedaviProtokoluAdimi),
	randevuTalebis: many(randevuTalebi),
	islemTanimiAdims: many(islemTanimiAdim),
}));

export const kullaniciRelations = relations(kullanici, ({one, many}) => ({
	islemTanimiFiyatGecmisis: many(islemTanimiFiyatGecmisi),
	kimlikKullanici: one(kimlikKullanici, {
		fields: [kullanici.id],
		references: [kimlikKullanici.id]
	}),
	klinik: one(klinik, {
		fields: [kullanici.klinikId],
		references: [klinik.id]
	}),
	personels: many(personel),
	hastas_kvkkOnaylayanKullaniciId: many(hasta, {
		relationName: "hasta_kvkkOnaylayanKullaniciId_kullanici_id"
	}),
	hastas_ozelNitelikliOnaylayanKullaniciId: many(hasta, {
		relationName: "hasta_ozelNitelikliOnaylayanKullaniciId_kullanici_id"
	}),
	hastas_ticariIletiOnaylayanKullaniciId: many(hasta, {
		relationName: "hasta_ticariIletiOnaylayanKullaniciId_kullanici_id"
	}),
	randevus_olusturanKullaniciId: many(randevu, {
		relationName: "randevu_olusturanKullaniciId_kullanici_id"
	}),
	randevus_tamamlayanKullaniciId: many(randevu, {
		relationName: "randevu_tamamlayanKullaniciId_kullanici_id"
	}),
	randevus_iptalEdenKullaniciId: many(randevu, {
		relationName: "randevu_iptalEdenKullaniciId_kullanici_id"
	}),
	odemes: many(odeme),
	hastaBakiyeHarekets: many(hastaBakiyeHareket),
	randevuIptalTalebis: many(randevuIptalTalebi),
	hastaHassas_olusturanKullaniciId: many(hastaHassas, {
		relationName: "hastaHassas_olusturanKullaniciId_kullanici_id"
	}),
	hastaHassas_sonGuncelleyenKullaniciId: many(hastaHassas, {
		relationName: "hastaHassas_sonGuncelleyenKullaniciId_kullanici_id"
	}),
	periyodikRandevus: many(periyodikRandevu),
	hastaHedefs: many(hastaHedef),
	hastaOlcums: many(hastaOlcum),
	hastaBelges: many(hastaBelge),
	hastaOnams: many(hastaOnam),
	hastaVucutHaritasiIsaretis: many(hastaVucutHaritasiIsareti),
	klinikHarcamas: many(klinikHarcama),
	isBasvurusus: many(isBasvurusu),
	personelPuantajDonems: many(personelPuantajDonem),
	personelPuantajs: many(personelPuantaj),
	personelUcrets: many(personelUcret),
	klinikAracs: many(klinikArac),
	kamusalOdemes: many(kamusalOdeme),
	randevuTalebis: many(randevuTalebi),
	destekTalebis: many(destekTalebi),
	mesajKrediHareketleris: many(mesajKrediHareketleri),
	hastaAnamnezs_olusturanKullaniciId: many(hastaAnamnez, {
		relationName: "hastaAnamnez_olusturanKullaniciId_kullanici_id"
	}),
	hastaAnamnezs_sonGuncelleyenKullaniciId: many(hastaAnamnez, {
		relationName: "hastaAnamnez_sonGuncelleyenKullaniciId_kullanici_id"
	}),
	personelIzinTalebis_degerlendirenKullaniciId: many(personelIzinTalebi, {
		relationName: "personelIzinTalebi_degerlendirenKullaniciId_kullanici_id"
	}),
	personelIzinTalebis_iptalEdenKullaniciId: many(personelIzinTalebi, {
		relationName: "personelIzinTalebi_iptalEdenKullaniciId_kullanici_id"
	}),
	personelHesapHarekets: many(personelHesapHareket),
	nakitBankaHareketis: many(nakitBankaHareketi),
	hastaYorums: many(hastaYorum),
	kasaDengelemes: many(kasaDengeleme),
	klinikCariOdemes: many(klinikCariOdeme),
	klinikKrediKartiOdemes: many(klinikKrediKartiOdeme),
	resmiTatilOneris: many(resmiTatilOneri),
	auditLogVarsayilans: many(auditLogVarsayilan),
	auditLog202610s: many(auditLog202610),
	auditLog202611s: many(auditLog202611),
	auditLog202612s: many(auditLog202612),
	auditLog202701s: many(auditLog202701),
}));

export const vardiyaTuruRelations = relations(vardiyaTuru, ({one, many}) => ({
	klinik: one(klinik, {
		fields: [vardiyaTuru.klinikId],
		references: [klinik.id]
	}),
	personelVardiyaAtamas: many(personelVardiyaAtama),
}));

export const personelVardiyaAtamaRelations = relations(personelVardiyaAtama, ({one}) => ({
	klinik: one(klinik, {
		fields: [personelVardiyaAtama.klinikId],
		references: [klinik.id]
	}),
	personel: one(personel, {
		fields: [personelVardiyaAtama.personelId],
		references: [personel.id]
	}),
	vardiyaTuru: one(vardiyaTuru, {
		fields: [personelVardiyaAtama.vardiyaTuruId],
		references: [vardiyaTuru.id]
	}),
}));

export const personelRelations = relations(personel, ({one, many}) => ({
	personelVardiyaAtamas: many(personelVardiyaAtama),
	klinik: one(klinik, {
		fields: [personel.klinikId],
		references: [klinik.id]
	}),
	kullanici: one(kullanici, {
		fields: [personel.kullaniciId],
		references: [kullanici.id]
	}),
	pozisyonlar: one(pozisyonlar, {
		fields: [personel.pozisyonId],
		references: [pozisyonlar.id]
	}),
	terapists: many(terapist),
	randevus: many(randevu),
	hastaIletisimLogs: many(hastaIletisimLog),
	personelHassas: many(personelHassas),
	personelAcilKisis: many(personelAcilKisi),
	personelMeslekiBelges: many(personelMeslekiBelge),
	isBasvurusus: many(isBasvurusu),
	personelPuantajDonems: many(personelPuantajDonem),
	personelPuantajs: many(personelPuantaj),
	personelUcrets: many(personelUcret),
	personelIzinTalebis: many(personelIzinTalebi),
	personelHesapHarekets: many(personelHesapHareket),
	personelEgitims: many(personelEgitim),
}));

export const klinikBankaHesaplariRelations = relations(klinikBankaHesaplari, ({one, many}) => ({
	kliniks: many(klinik, {
		relationName: "klinik_krediKartiTahsilatBankaHesapId_klinikBankaHesaplari_id"
	}),
	hastaBakiyeHarekets: many(hastaBakiyeHareket),
	klinikHarcamas: many(klinikHarcama),
	kamusalOdemes: many(kamusalOdeme),
	personelHesapHarekets: many(personelHesapHareket),
	klinik: one(klinik, {
		fields: [klinikBankaHesaplari.klinikId],
		references: [klinik.id],
		relationName: "klinikBankaHesaplari_klinikId_klinik_id"
	}),
	nakitBankaHareketis_kaynakBankaHesapId: many(nakitBankaHareketi, {
		relationName: "nakitBankaHareketi_kaynakBankaHesapId_klinikBankaHesaplari_id"
	}),
	nakitBankaHareketis_hedefBankaHesapId: many(nakitBankaHareketi, {
		relationName: "nakitBankaHareketi_hedefBankaHesapId_klinikBankaHesaplari_id"
	}),
	klinikCariOdemes: many(klinikCariOdeme),
	klinikKrediKartiOdemes: many(klinikKrediKartiOdeme),
}));

export const pozisyonlarRelations = relations(pozisyonlar, ({one, many}) => ({
	personels: many(personel),
	klinik: one(klinik, {
		fields: [pozisyonlar.klinikId],
		references: [klinik.id]
	}),
	pozisyonSablonlari: one(pozisyonSablonlari, {
		fields: [pozisyonlar.sablonId],
		references: [pozisyonSablonlari.id]
	}),
	islemTanimiAdims: many(islemTanimiAdim),
	islemAdimiSablonus: many(islemAdimiSablonu),
}));

export const odaRelations = relations(oda, ({one, many}) => ({
	klinik: one(klinik, {
		fields: [oda.klinikId],
		references: [klinik.id]
	}),
	randevus: many(randevu),
	periyodikRandevus: many(periyodikRandevu),
}));

export const cihazRelations = relations(cihaz, ({one, many}) => ({
	klinik: one(klinik, {
		fields: [cihaz.klinikId],
		references: [klinik.id]
	}),
	randevus: many(randevu),
	periyodikRandevus: many(periyodikRandevu),
	islemTanimiAdims: many(islemTanimiAdim),
	islemAdimiSablonus: many(islemAdimiSablonu),
	randevuCihazRezervasyons: many(randevuCihazRezervasyon),
}));

export const periyodikRandevuRelations = relations(periyodikRandevu, ({one, many}) => ({
	randevus: many(randevu),
	klinik: one(klinik, {
		fields: [periyodikRandevu.klinikId],
		references: [klinik.id]
	}),
	hasta: one(hasta, {
		fields: [periyodikRandevu.hastaId],
		references: [hasta.id]
	}),
	terapist: one(terapist, {
		fields: [periyodikRandevu.terapistId],
		references: [terapist.id]
	}),
	oda: one(oda, {
		fields: [periyodikRandevu.odaId],
		references: [oda.id]
	}),
	cihaz: one(cihaz, {
		fields: [periyodikRandevu.cihazId],
		references: [cihaz.id]
	}),
	islemTanimi: one(islemTanimi, {
		fields: [periyodikRandevu.islemTanimiId],
		references: [islemTanimi.id]
	}),
	kullanici: one(kullanici, {
		fields: [periyodikRandevu.olusturanKullaniciId],
		references: [kullanici.id]
	}),
}));

export const paketSatisRelations = relations(paketSatis, ({one, many}) => ({
	randevus: many(randevu),
	klinik: one(klinik, {
		fields: [paketSatis.klinikId],
		references: [klinik.id]
	}),
	hasta: one(hasta, {
		fields: [paketSatis.hastaId],
		references: [hasta.id]
	}),
	paket: one(paket, {
		fields: [paketSatis.paketId],
		references: [paket.id]
	}),
	odeme: one(odeme, {
		fields: [paketSatis.odemeId],
		references: [odeme.id]
	}),
	odemeKalemis: many(odemeKalemi),
}));

export const tedaviProtokoluRelations = relations(tedaviProtokolu, ({one, many}) => ({
	randevus: many(randevu),
	klinik: one(klinik, {
		fields: [tedaviProtokolu.klinikId],
		references: [klinik.id]
	}),
	tedaviProtokoluAdimis: many(tedaviProtokoluAdimi),
}));

export const klinikAyarlarRelations = relations(klinikAyarlar, ({one}) => ({
	klinik: one(klinik, {
		fields: [klinikAyarlar.klinikId],
		references: [klinik.id]
	}),
}));

export const paketRelations = relations(paket, ({one, many}) => ({
	klinik: one(klinik, {
		fields: [paket.klinikId],
		references: [klinik.id]
	}),
	islemTanimi: one(islemTanimi, {
		fields: [paket.islemTanimiId],
		references: [islemTanimi.id]
	}),
	paketSatis: many(paketSatis),
}));

export const odemeKalemiRelations = relations(odemeKalemi, ({one}) => ({
	odeme: one(odeme, {
		fields: [odemeKalemi.odemeId],
		references: [odeme.id]
	}),
	islemTanimi: one(islemTanimi, {
		fields: [odemeKalemi.islemTanimiId],
		references: [islemTanimi.id]
	}),
	paketSati: one(paketSatis, {
		fields: [odemeKalemi.paketSatisId],
		references: [paketSatis.id]
	}),
}));

export const hastaBakiyeHareketRelations = relations(hastaBakiyeHareket, ({one}) => ({
	klinik: one(klinik, {
		fields: [hastaBakiyeHareket.klinikId],
		references: [klinik.id]
	}),
	hasta: one(hasta, {
		fields: [hastaBakiyeHareket.hastaId],
		references: [hasta.id]
	}),
	odeme: one(odeme, {
		fields: [hastaBakiyeHareket.odemeId],
		references: [odeme.id]
	}),
	randevu: one(randevu, {
		fields: [hastaBakiyeHareket.randevuId],
		references: [randevu.id]
	}),
	kullanici: one(kullanici, {
		fields: [hastaBakiyeHareket.iskontoUygulayanKullaniciId],
		references: [kullanici.id]
	}),
	klinikBankaHesaplari: one(klinikBankaHesaplari, {
		fields: [hastaBakiyeHareket.bankaHesapId],
		references: [klinikBankaHesaplari.id]
	}),
}));

export const faturaRelations = relations(fatura, ({one}) => ({
	klinik: one(klinik, {
		fields: [fatura.klinikId],
		references: [klinik.id]
	}),
	odeme: one(odeme, {
		fields: [fatura.odemeId],
		references: [odeme.id]
	}),
}));

export const hastaKullaniciRelations = relations(hastaKullanici, ({one}) => ({
	kimlikKullanici: one(kimlikKullanici, {
		fields: [hastaKullanici.id],
		references: [kimlikKullanici.id]
	}),
	hasta: one(hasta, {
		fields: [hastaKullanici.hastaId],
		references: [hasta.id]
	}),
}));

export const randevuIptalTalebiRelations = relations(randevuIptalTalebi, ({one}) => ({
	klinik: one(klinik, {
		fields: [randevuIptalTalebi.klinikId],
		references: [klinik.id]
	}),
	randevu: one(randevu, {
		fields: [randevuIptalTalebi.randevuId],
		references: [randevu.id]
	}),
	hasta: one(hasta, {
		fields: [randevuIptalTalebi.hastaId],
		references: [hasta.id]
	}),
	kullanici: one(kullanici, {
		fields: [randevuIptalTalebi.yanitKullaniciId],
		references: [kullanici.id]
	}),
}));

export const hastaHassasRelations = relations(hastaHassas, ({one}) => ({
	hasta: one(hasta, {
		fields: [hastaHassas.hastaId],
		references: [hasta.id]
	}),
	klinik: one(klinik, {
		fields: [hastaHassas.klinikId],
		references: [klinik.id]
	}),
	kullanici_olusturanKullaniciId: one(kullanici, {
		fields: [hastaHassas.olusturanKullaniciId],
		references: [kullanici.id],
		relationName: "hastaHassas_olusturanKullaniciId_kullanici_id"
	}),
	kullanici_sonGuncelleyenKullaniciId: one(kullanici, {
		fields: [hastaHassas.sonGuncelleyenKullaniciId],
		references: [kullanici.id],
		relationName: "hastaHassas_sonGuncelleyenKullaniciId_kullanici_id"
	}),
}));

export const islemKontrendikasyonRelations = relations(islemKontrendikasyon, ({one}) => ({
	klinik: one(klinik, {
		fields: [islemKontrendikasyon.klinikId],
		references: [klinik.id]
	}),
	islemTanimi: one(islemTanimi, {
		fields: [islemKontrendikasyon.islemTanimiId],
		references: [islemTanimi.id]
	}),
}));

export const hastaHedefRelations = relations(hastaHedef, ({one}) => ({
	klinik: one(klinik, {
		fields: [hastaHedef.klinikId],
		references: [klinik.id]
	}),
	hasta: one(hasta, {
		fields: [hastaHedef.hastaId],
		references: [hasta.id]
	}),
	kullanici: one(kullanici, {
		fields: [hastaHedef.olusturanId],
		references: [kullanici.id]
	}),
}));

export const olcekTanimiRelations = relations(olcekTanimi, ({one, many}) => ({
	klinik: one(klinik, {
		fields: [olcekTanimi.klinikId],
		references: [klinik.id]
	}),
	hastaOlcums: many(hastaOlcum),
}));

export const hastaOlcumRelations = relations(hastaOlcum, ({one}) => ({
	klinik: one(klinik, {
		fields: [hastaOlcum.klinikId],
		references: [klinik.id]
	}),
	hasta: one(hasta, {
		fields: [hastaOlcum.hastaId],
		references: [hasta.id]
	}),
	randevu: one(randevu, {
		fields: [hastaOlcum.randevuId],
		references: [randevu.id]
	}),
	olcekTanimi: one(olcekTanimi, {
		fields: [hastaOlcum.olcekTanimiId],
		references: [olcekTanimi.id]
	}),
	kullanici: one(kullanici, {
		fields: [hastaOlcum.girenKullaniciId],
		references: [kullanici.id]
	}),
}));

export const hastaIletisimLogRelations = relations(hastaIletisimLog, ({one}) => ({
	klinik: one(klinik, {
		fields: [hastaIletisimLog.klinikId],
		references: [klinik.id]
	}),
	hasta: one(hasta, {
		fields: [hastaIletisimLog.hastaId],
		references: [hasta.id]
	}),
	randevu: one(randevu, {
		fields: [hastaIletisimLog.ilgiliRandevuId],
		references: [randevu.id]
	}),
	personel: one(personel, {
		fields: [hastaIletisimLog.personelId],
		references: [personel.id]
	}),
}));

export const hastaIliskiRelations = relations(hastaIliski, ({one}) => ({
	klinik: one(klinik, {
		fields: [hastaIliski.klinikId],
		references: [klinik.id]
	}),
	hasta_hastaId: one(hasta, {
		fields: [hastaIliski.hastaId],
		references: [hasta.id],
		relationName: "hastaIliski_hastaId_hasta_id"
	}),
	hasta_iliskiliHastaId: one(hasta, {
		fields: [hastaIliski.iliskiliHastaId],
		references: [hasta.id],
		relationName: "hastaIliski_iliskiliHastaId_hasta_id"
	}),
}));

export const hastaSigortaRelations = relations(hastaSigorta, ({one}) => ({
	klinik: one(klinik, {
		fields: [hastaSigorta.klinikId],
		references: [klinik.id]
	}),
	hasta: one(hasta, {
		fields: [hastaSigorta.hastaId],
		references: [hasta.id]
	}),
}));

export const hastaBelgeRelations = relations(hastaBelge, ({one, many}) => ({
	klinik: one(klinik, {
		fields: [hastaBelge.klinikId],
		references: [klinik.id]
	}),
	hasta: one(hasta, {
		fields: [hastaBelge.hastaId],
		references: [hasta.id]
	}),
	kullanici: one(kullanici, {
		fields: [hastaBelge.yukleyenKullaniciId],
		references: [kullanici.id]
	}),
	hastaBelge: one(hastaBelge, {
		fields: [hastaBelge.oncekiBelgeId],
		references: [hastaBelge.id],
		relationName: "hastaBelge_oncekiBelgeId_hastaBelge_id"
	}),
	hastaBelges: many(hastaBelge, {
		relationName: "hastaBelge_oncekiBelgeId_hastaBelge_id"
	}),
	hastaOnam: one(hastaOnam, {
		fields: [hastaBelge.onamId],
		references: [hastaOnam.id]
	}),
}));

export const hastaOnamRelations = relations(hastaOnam, ({one, many}) => ({
	hastaBelges: many(hastaBelge),
	klinik: one(klinik, {
		fields: [hastaOnam.klinikId],
		references: [klinik.id]
	}),
	hasta: one(hasta, {
		fields: [hastaOnam.hastaId],
		references: [hasta.id]
	}),
	kullanici: one(kullanici, {
		fields: [hastaOnam.olusturanKullaniciId],
		references: [kullanici.id]
	}),
}));

export const hastaVucutHaritasiIsaretiRelations = relations(hastaVucutHaritasiIsareti, ({one}) => ({
	klinik: one(klinik, {
		fields: [hastaVucutHaritasiIsareti.klinikId],
		references: [klinik.id]
	}),
	hasta: one(hasta, {
		fields: [hastaVucutHaritasiIsareti.hastaId],
		references: [hasta.id]
	}),
	randevu: one(randevu, {
		fields: [hastaVucutHaritasiIsareti.randevuId],
		references: [randevu.id]
	}),
	kullanici: one(kullanici, {
		fields: [hastaVucutHaritasiIsareti.olusturanKullaniciId],
		references: [kullanici.id]
	}),
}));

export const hastaProtokolRelations = relations(hastaProtokol, ({one}) => ({
	klinik: one(klinik, {
		fields: [hastaProtokol.klinikId],
		references: [klinik.id]
	}),
	hasta: one(hasta, {
		fields: [hastaProtokol.hastaId],
		references: [hasta.id]
	}),
	islemTanimi: one(islemTanimi, {
		fields: [hastaProtokol.islemTanimiId],
		references: [islemTanimi.id]
	}),
	terapist: one(terapist, {
		fields: [hastaProtokol.atayanTerapistId],
		references: [terapist.id]
	}),
}));

export const klinikHarcamaRelations = relations(klinikHarcama, ({one}) => ({
	klinik: one(klinik, {
		fields: [klinikHarcama.klinikId],
		references: [klinik.id]
	}),
	kullanici: one(kullanici, {
		fields: [klinikHarcama.olusturanKullaniciId],
		references: [kullanici.id]
	}),
	klinikArac: one(klinikArac, {
		fields: [klinikHarcama.aracId],
		references: [klinikArac.id]
	}),
	klinikBankaHesaplari: one(klinikBankaHesaplari, {
		fields: [klinikHarcama.bankaHesapId],
		references: [klinikBankaHesaplari.id]
	}),
	klinikKrediKartlari: one(klinikKrediKartlari, {
		fields: [klinikHarcama.krediKartiId],
		references: [klinikKrediKartlari.id]
	}),
}));

export const klinikAracRelations = relations(klinikArac, ({one, many}) => ({
	klinikHarcamas: many(klinikHarcama),
	klinik: one(klinik, {
		fields: [klinikArac.klinikId],
		references: [klinik.id]
	}),
	kullanici: one(kullanici, {
		fields: [klinikArac.olusturanKullaniciId],
		references: [kullanici.id]
	}),
	kamusalOdemes: many(kamusalOdeme),
}));

export const klinikKrediKartlariRelations = relations(klinikKrediKartlari, ({one, many}) => ({
	klinikHarcamas: many(klinikHarcama),
	klinik: one(klinik, {
		fields: [klinikKrediKartlari.klinikId],
		references: [klinik.id]
	}),
	klinikCariOdemes: many(klinikCariOdeme),
	klinikKrediKartiOdemes: many(klinikKrediKartiOdeme),
}));

export const personelHassasRelations = relations(personelHassas, ({one}) => ({
	personel: one(personel, {
		fields: [personelHassas.personelId],
		references: [personel.id]
	}),
}));

export const personelAcilKisiRelations = relations(personelAcilKisi, ({one}) => ({
	personel: one(personel, {
		fields: [personelAcilKisi.personelId],
		references: [personel.id]
	}),
}));

export const personelMeslekiBelgeRelations = relations(personelMeslekiBelge, ({one}) => ({
	personel: one(personel, {
		fields: [personelMeslekiBelge.personelId],
		references: [personel.id]
	}),
}));

export const tedaviProtokoluAdimiRelations = relations(tedaviProtokoluAdimi, ({one}) => ({
	klinik: one(klinik, {
		fields: [tedaviProtokoluAdimi.klinikId],
		references: [klinik.id]
	}),
	tedaviProtokolu: one(tedaviProtokolu, {
		fields: [tedaviProtokoluAdimi.tedaviProtokoluId],
		references: [tedaviProtokolu.id]
	}),
	islemTanimi: one(islemTanimi, {
		fields: [tedaviProtokoluAdimi.islemTanimiId],
		references: [islemTanimi.id]
	}),
}));

export const klinikMuhasebeEntegrasyonuRelations = relations(klinikMuhasebeEntegrasyonu, ({one}) => ({
	klinik: one(klinik, {
		fields: [klinikMuhasebeEntegrasyonu.klinikId],
		references: [klinik.id]
	}),
}));

export const isBasvurusuRelations = relations(isBasvurusu, ({one}) => ({
	klinik: one(klinik, {
		fields: [isBasvurusu.klinikId],
		references: [klinik.id]
	}),
	kullanici: one(kullanici, {
		fields: [isBasvurusu.degerlendirenKullaniciId],
		references: [kullanici.id]
	}),
	personel: one(personel, {
		fields: [isBasvurusu.personelId],
		references: [personel.id]
	}),
}));

export const anketYanitiRelations = relations(anketYaniti, ({one}) => ({
	klinik: one(klinik, {
		fields: [anketYaniti.klinikId],
		references: [klinik.id]
	}),
}));

export const iskontoOranlariRelations = relations(iskontoOranlari, ({one}) => ({
	klinik: one(klinik, {
		fields: [iskontoOranlari.klinikId],
		references: [klinik.id]
	}),
}));

export const personelPuantajDonemRelations = relations(personelPuantajDonem, ({one, many}) => ({
	klinik: one(klinik, {
		fields: [personelPuantajDonem.klinikId],
		references: [klinik.id]
	}),
	personel: one(personel, {
		fields: [personelPuantajDonem.personelId],
		references: [personel.id]
	}),
	kullanici: one(kullanici, {
		fields: [personelPuantajDonem.kapatanId],
		references: [kullanici.id]
	}),
	personelHesapHarekets: many(personelHesapHareket),
}));

export const personelPuantajRelations = relations(personelPuantaj, ({one}) => ({
	klinik: one(klinik, {
		fields: [personelPuantaj.klinikId],
		references: [klinik.id]
	}),
	personel: one(personel, {
		fields: [personelPuantaj.personelId],
		references: [personel.id]
	}),
	kullanici: one(kullanici, {
		fields: [personelPuantaj.fmOnaylayanId],
		references: [kullanici.id]
	}),
	personelIzinTalebi: one(personelIzinTalebi, {
		fields: [personelPuantaj.izinTalepId],
		references: [personelIzinTalebi.id]
	}),
}));

export const personelIzinTalebiRelations = relations(personelIzinTalebi, ({one, many}) => ({
	personelPuantajs: many(personelPuantaj),
	klinik: one(klinik, {
		fields: [personelIzinTalebi.klinikId],
		references: [klinik.id]
	}),
	personel: one(personel, {
		fields: [personelIzinTalebi.personelId],
		references: [personel.id]
	}),
	kullanici_degerlendirenKullaniciId: one(kullanici, {
		fields: [personelIzinTalebi.degerlendirenKullaniciId],
		references: [kullanici.id],
		relationName: "personelIzinTalebi_degerlendirenKullaniciId_kullanici_id"
	}),
	kullanici_iptalEdenKullaniciId: one(kullanici, {
		fields: [personelIzinTalebi.iptalEdenKullaniciId],
		references: [kullanici.id],
		relationName: "personelIzinTalebi_iptalEdenKullaniciId_kullanici_id"
	}),
}));

export const personelUcretRelations = relations(personelUcret, ({one}) => ({
	klinik: one(klinik, {
		fields: [personelUcret.klinikId],
		references: [klinik.id]
	}),
	personel: one(personel, {
		fields: [personelUcret.personelId],
		references: [personel.id]
	}),
	kullanici: one(kullanici, {
		fields: [personelUcret.ekleyenKullaniciId],
		references: [kullanici.id]
	}),
}));

export const kamusalOdemeRelations = relations(kamusalOdeme, ({one}) => ({
	klinik: one(klinik, {
		fields: [kamusalOdeme.klinikId],
		references: [klinik.id]
	}),
	kullanici: one(kullanici, {
		fields: [kamusalOdeme.olusturanKullaniciId],
		references: [kullanici.id]
	}),
	klinikArac: one(klinikArac, {
		fields: [kamusalOdeme.aracId],
		references: [klinikArac.id]
	}),
	klinikBankaHesaplari: one(klinikBankaHesaplari, {
		fields: [kamusalOdeme.bankaHesapId],
		references: [klinikBankaHesaplari.id]
	}),
}));

export const seansDegerlendirmeRelations = relations(seansDegerlendirme, ({one}) => ({
	klinik: one(klinik, {
		fields: [seansDegerlendirme.klinikId],
		references: [klinik.id]
	}),
	randevu: one(randevu, {
		fields: [seansDegerlendirme.randevuId],
		references: [randevu.id]
	}),
	hasta: one(hasta, {
		fields: [seansDegerlendirme.hastaId],
		references: [hasta.id]
	}),
}));

export const randevuTalebiRelations = relations(randevuTalebi, ({one}) => ({
	klinik: one(klinik, {
		fields: [randevuTalebi.klinikId],
		references: [klinik.id]
	}),
	hasta: one(hasta, {
		fields: [randevuTalebi.hastaId],
		references: [hasta.id]
	}),
	islemTanimi: one(islemTanimi, {
		fields: [randevuTalebi.islemTanimiId],
		references: [islemTanimi.id]
	}),
	terapist: one(terapist, {
		fields: [randevuTalebi.terapistId],
		references: [terapist.id]
	}),
	randevu: one(randevu, {
		fields: [randevuTalebi.olusturulanRandevuId],
		references: [randevu.id]
	}),
	kullanici: one(kullanici, {
		fields: [randevuTalebi.yanitKullaniciId],
		references: [kullanici.id]
	}),
}));

export const destekTalebiRelations = relations(destekTalebi, ({one}) => ({
	klinik: one(klinik, {
		fields: [destekTalebi.klinikId],
		references: [klinik.id]
	}),
	kullanici: one(kullanici, {
		fields: [destekTalebi.kullaniciId],
		references: [kullanici.id]
	}),
}));

export const mesajKurallariRelations = relations(mesajKurallari, ({one}) => ({
	klinik: one(klinik, {
		fields: [mesajKurallari.klinikId],
		references: [klinik.id]
	}),
}));

export const mesajKuyruguRelations = relations(mesajKuyrugu, ({one, many}) => ({
	klinik: one(klinik, {
		fields: [mesajKuyrugu.klinikId],
		references: [klinik.id]
	}),
	mesajKrediHareketleris: many(mesajKrediHareketleri),
}));

export const mesajKredileriRelations = relations(mesajKredileri, ({one}) => ({
	klinik: one(klinik, {
		fields: [mesajKredileri.klinikId],
		references: [klinik.id]
	}),
}));

export const mesajKrediHareketleriRelations = relations(mesajKrediHareketleri, ({one}) => ({
	klinik: one(klinik, {
		fields: [mesajKrediHareketleri.klinikId],
		references: [klinik.id]
	}),
	mesajKuyrugu: one(mesajKuyrugu, {
		fields: [mesajKrediHareketleri.kuyrukId],
		references: [mesajKuyrugu.id]
	}),
	kullanici: one(kullanici, {
		fields: [mesajKrediHareketleri.olusturanKullaniciId],
		references: [kullanici.id]
	}),
}));

export const hastaAnamnezRelations = relations(hastaAnamnez, ({one}) => ({
	klinik: one(klinik, {
		fields: [hastaAnamnez.klinikId],
		references: [klinik.id]
	}),
	hasta: one(hasta, {
		fields: [hastaAnamnez.hastaId],
		references: [hasta.id]
	}),
	kullanici_olusturanKullaniciId: one(kullanici, {
		fields: [hastaAnamnez.olusturanKullaniciId],
		references: [kullanici.id],
		relationName: "hastaAnamnez_olusturanKullaniciId_kullanici_id"
	}),
	kullanici_sonGuncelleyenKullaniciId: one(kullanici, {
		fields: [hastaAnamnez.sonGuncelleyenKullaniciId],
		references: [kullanici.id],
		relationName: "hastaAnamnez_sonGuncelleyenKullaniciId_kullanici_id"
	}),
}));

export const personelHesapHareketRelations = relations(personelHesapHareket, ({one}) => ({
	klinik: one(klinik, {
		fields: [personelHesapHareket.klinikId],
		references: [klinik.id]
	}),
	personel: one(personel, {
		fields: [personelHesapHareket.personelId],
		references: [personel.id]
	}),
	personelPuantajDonem: one(personelPuantajDonem, {
		fields: [personelHesapHareket.kaynakId],
		references: [personelPuantajDonem.id]
	}),
	kullanici: one(kullanici, {
		fields: [personelHesapHareket.ekleyenKullaniciId],
		references: [kullanici.id]
	}),
	klinikBankaHesaplari: one(klinikBankaHesaplari, {
		fields: [personelHesapHareket.bankaHesapId],
		references: [klinikBankaHesaplari.id]
	}),
}));

export const pozisyonSablonlariRelations = relations(pozisyonSablonlari, ({many}) => ({
	pozisyonlars: many(pozisyonlar),
}));

export const nakitBankaHareketiRelations = relations(nakitBankaHareketi, ({one}) => ({
	klinik: one(klinik, {
		fields: [nakitBankaHareketi.klinikId],
		references: [klinik.id]
	}),
	klinikBankaHesaplari_kaynakBankaHesapId: one(klinikBankaHesaplari, {
		fields: [nakitBankaHareketi.kaynakBankaHesapId],
		references: [klinikBankaHesaplari.id],
		relationName: "nakitBankaHareketi_kaynakBankaHesapId_klinikBankaHesaplari_id"
	}),
	klinikBankaHesaplari_hedefBankaHesapId: one(klinikBankaHesaplari, {
		fields: [nakitBankaHareketi.hedefBankaHesapId],
		references: [klinikBankaHesaplari.id],
		relationName: "nakitBankaHareketi_hedefBankaHesapId_klinikBankaHesaplari_id"
	}),
	kullanici: one(kullanici, {
		fields: [nakitBankaHareketi.ekleyenKullaniciId],
		references: [kullanici.id]
	}),
}));

export const personelEgitimRelations = relations(personelEgitim, ({one}) => ({
	personel: one(personel, {
		fields: [personelEgitim.personelId],
		references: [personel.id]
	}),
}));

export const hastaYorumRelations = relations(hastaYorum, ({one}) => ({
	klinik: one(klinik, {
		fields: [hastaYorum.klinikId],
		references: [klinik.id]
	}),
	hasta: one(hasta, {
		fields: [hastaYorum.hastaId],
		references: [hasta.id]
	}),
	randevu: one(randevu, {
		fields: [hastaYorum.randevuId],
		references: [randevu.id]
	}),
	kullanici: one(kullanici, {
		fields: [hastaYorum.olusturanKullaniciId],
		references: [kullanici.id]
	}),
}));

export const islemTanimiAdimRelations = relations(islemTanimiAdim, ({one, many}) => ({
	klinik: one(klinik, {
		fields: [islemTanimiAdim.klinikId],
		references: [klinik.id]
	}),
	islemTanimi: one(islemTanimi, {
		fields: [islemTanimiAdim.islemTanimiId],
		references: [islemTanimi.id]
	}),
	cihaz: one(cihaz, {
		fields: [islemTanimiAdim.gerekliCihazId],
		references: [cihaz.id]
	}),
	pozisyonlar: one(pozisyonlar, {
		fields: [islemTanimiAdim.uygulayiciPozisyonId],
		references: [pozisyonlar.id]
	}),
	randevuCihazRezervasyons: many(randevuCihazRezervasyon),
}));

export const islemAdimiSablonuRelations = relations(islemAdimiSablonu, ({one}) => ({
	klinik: one(klinik, {
		fields: [islemAdimiSablonu.klinikId],
		references: [klinik.id]
	}),
	pozisyonlar: one(pozisyonlar, {
		fields: [islemAdimiSablonu.uygulayiciPozisyonId],
		references: [pozisyonlar.id]
	}),
	cihaz: one(cihaz, {
		fields: [islemAdimiSablonu.gerekliCihazId],
		references: [cihaz.id]
	}),
}));

export const randevuCihazRezervasyonRelations = relations(randevuCihazRezervasyon, ({one}) => ({
	klinik: one(klinik, {
		fields: [randevuCihazRezervasyon.klinikId],
		references: [klinik.id]
	}),
	randevu: one(randevu, {
		fields: [randevuCihazRezervasyon.randevuId],
		references: [randevu.id]
	}),
	cihaz: one(cihaz, {
		fields: [randevuCihazRezervasyon.cihazId],
		references: [cihaz.id]
	}),
	islemTanimiAdim: one(islemTanimiAdim, {
		fields: [randevuCihazRezervasyon.adimId],
		references: [islemTanimiAdim.id]
	}),
}));

export const kasaDengelemeRelations = relations(kasaDengeleme, ({one}) => ({
	klinik: one(klinik, {
		fields: [kasaDengeleme.klinikId],
		references: [klinik.id]
	}),
	kullanici: one(kullanici, {
		fields: [kasaDengeleme.ekleyenKullaniciId],
		references: [kullanici.id]
	}),
}));

export const klinikCariOdemeRelations = relations(klinikCariOdeme, ({one}) => ({
	klinik: one(klinik, {
		fields: [klinikCariOdeme.klinikId],
		references: [klinik.id]
	}),
	klinikBankaHesaplari: one(klinikBankaHesaplari, {
		fields: [klinikCariOdeme.bankaHesapId],
		references: [klinikBankaHesaplari.id]
	}),
	klinikKrediKartlari: one(klinikKrediKartlari, {
		fields: [klinikCariOdeme.krediKartiId],
		references: [klinikKrediKartlari.id]
	}),
	kullanici: one(kullanici, {
		fields: [klinikCariOdeme.olusturanKullaniciId],
		references: [kullanici.id]
	}),
}));

export const klinikKrediKartiOdemeRelations = relations(klinikKrediKartiOdeme, ({one}) => ({
	klinik: one(klinik, {
		fields: [klinikKrediKartiOdeme.klinikId],
		references: [klinik.id]
	}),
	klinikKrediKartlari: one(klinikKrediKartlari, {
		fields: [klinikKrediKartiOdeme.krediKartiId],
		references: [klinikKrediKartlari.id]
	}),
	klinikBankaHesaplari: one(klinikBankaHesaplari, {
		fields: [klinikKrediKartiOdeme.bankaHesapId],
		references: [klinikBankaHesaplari.id]
	}),
	kullanici: one(kullanici, {
		fields: [klinikKrediKartiOdeme.olusturanKullaniciId],
		references: [kullanici.id]
	}),
}));

export const resmiTatilRelations = relations(resmiTatil, ({one}) => ({
	klinik: one(klinik, {
		fields: [resmiTatil.klinikId],
		references: [klinik.id]
	}),
}));

export const resmiTatilOneriRelations = relations(resmiTatilOneri, ({one}) => ({
	klinik: one(klinik, {
		fields: [resmiTatilOneri.klinikId],
		references: [klinik.id]
	}),
	kullanici: one(kullanici, {
		fields: [resmiTatilOneri.kararVerenId],
		references: [kullanici.id]
	}),
}));

export const auditLogVarsayilanRelations = relations(auditLogVarsayilan, ({one}) => ({
	klinik: one(klinik, {
		fields: [auditLogVarsayilan.klinikId],
		references: [klinik.id]
	}),
	kullanici: one(kullanici, {
		fields: [auditLogVarsayilan.kullaniciId],
		references: [kullanici.id]
	}),
}));

export const auditLog202610Relations = relations(auditLog202610, ({one}) => ({
	klinik: one(klinik, {
		fields: [auditLog202610.klinikId],
		references: [klinik.id]
	}),
	kullanici: one(kullanici, {
		fields: [auditLog202610.kullaniciId],
		references: [kullanici.id]
	}),
}));

export const auditLog202611Relations = relations(auditLog202611, ({one}) => ({
	klinik: one(klinik, {
		fields: [auditLog202611.klinikId],
		references: [klinik.id]
	}),
	kullanici: one(kullanici, {
		fields: [auditLog202611.kullaniciId],
		references: [kullanici.id]
	}),
}));

export const auditLog202612Relations = relations(auditLog202612, ({one}) => ({
	klinik: one(klinik, {
		fields: [auditLog202612.klinikId],
		references: [klinik.id]
	}),
	kullanici: one(kullanici, {
		fields: [auditLog202612.kullaniciId],
		references: [kullanici.id]
	}),
}));

export const auditLog202701Relations = relations(auditLog202701, ({one}) => ({
	klinik: one(klinik, {
		fields: [auditLog202701.klinikId],
		references: [klinik.id]
	}),
	kullanici: one(kullanici, {
		fields: [auditLog202701.kullaniciId],
		references: [kullanici.id]
	}),
}));