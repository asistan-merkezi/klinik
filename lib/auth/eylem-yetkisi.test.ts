import { beforeEach, describe, expect, it, vi } from "vitest";

const durum: { user: { id: string } | null; kullanici: { klinik_id: string | null; rol: string } | null } = {
  user: { id: "u1" },
  kullanici: { klinik_id: "k1", rol: "klinik_admin" },
};

vi.mock("next/navigation", () => ({
  redirect: (yol: string) => {
    throw new Error(`REDIRECT:${yol}`);
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: durum.user } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: durum.kullanici }) }) }) }),
  }),
}));

import { eylemYetkisiGetir } from "./eylem-yetkisi";

beforeEach(() => {
  durum.user = { id: "u1" };
  durum.kullanici = { klinik_id: "k1", rol: "klinik_admin" };
});

describe("eylemYetkisiGetir", () => {
  it("izinli rol yetkili", async () => {
    const r = await eylemYetkisiGetir(["klinik_admin"]);
    expect(r.yetkili).toBe(true);
    expect(r.klinikId).toBe("k1");
  });

  it("izin listesinde olmayan rol yetkisiz (resepsiyon paket yönetemez), klinikId yine döner", async () => {
    durum.kullanici = { klinik_id: "k1", rol: "resepsiyon" };
    const r = await eylemYetkisiGetir(["klinik_admin"]);
    expect(r.yetkili).toBe(false);
    expect(r.klinikId).toBe("k1");
  });

  it("oda/cihaz gibi iki rollü kümede resepsiyon yetkili, terapist değil", async () => {
    durum.kullanici = { klinik_id: "k1", rol: "resepsiyon" };
    expect((await eylemYetkisiGetir(["klinik_admin", "resepsiyon"])).yetkili).toBe(true);
    durum.kullanici = { klinik_id: "k1", rol: "terapist" };
    expect((await eylemYetkisiGetir(["klinik_admin", "resepsiyon"])).yetkili).toBe(false);
  });

  it("super_admin her zaman yetkili ama klinik_id taşımaz", async () => {
    durum.kullanici = { klinik_id: null, rol: "super_admin" };
    const r = await eylemYetkisiGetir(["klinik_admin"]);
    expect(r.yetkili).toBe(true);
    expect(r.klinikId).toBeNull();
  });

  it("kullanıcı kaydı yoksa yetkisiz; oturum yoksa /giris", async () => {
    durum.kullanici = null;
    expect((await eylemYetkisiGetir(["klinik_admin"])).yetkili).toBe(false);
    durum.user = null;
    await expect(eylemYetkisiGetir(["klinik_admin"])).rejects.toThrow("REDIRECT:/giris");
  });
});
