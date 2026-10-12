-- Cari defteri sertleştirme (2026-10-12). İdempotent.
--
-- klinik_cari_odeme: "for all" politikası klinik_admin'in PostgREST ile DOĞRUDAN insert/update yapmasına izin
-- veriyordu; bu, klinik_cari_odeme_ekle RPC'sindeki bakiye aşım kontrolünü (ve advisory lock'u) atlatırdı
-- (tutarı sonradan büyütme dahil). Yazma yalnız RPC'den (SECURITY DEFINER) olur; admin yalnız SİLEBİLİR.
drop policy if exists "klinik_cari_odeme_yonet_admin" on klinik_cari_odeme;
drop policy if exists "klinik_cari_odeme_sil_admin" on klinik_cari_odeme;
create policy "klinik_cari_odeme_sil_admin" on klinik_cari_odeme
  for delete using ((klinik_id = current_klinik_id() and current_rol() = 'klinik_admin') or is_super_admin());

-- klinik_kredi_karti_odeme: kart FK'sı tek başına başka klinikin kartını kabul ederdi; kart aynı klinikten olmalı.
drop policy if exists "klinik_kredi_karti_odeme_yonet_admin" on klinik_kredi_karti_odeme;
create policy "klinik_kredi_karti_odeme_yonet_admin" on klinik_kredi_karti_odeme
  for all using ((klinik_id = current_klinik_id() and current_rol() = 'klinik_admin') or is_super_admin())
  with check (
    (
      (klinik_id = current_klinik_id() and current_rol() = 'klinik_admin') or is_super_admin()
    )
    and exists (
      select 1 from klinik_kredi_kartlari c where c.id = kredi_karti_id and c.klinik_id = klinik_kredi_karti_odeme.klinik_id
    )
  );

-- Kontrol: SELECT polname, polcmd FROM pg_policy WHERE polrelid = 'klinik_cari_odeme'::regclass;  -- select + delete
