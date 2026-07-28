import { describe, expect, it } from "vitest";
import {
  CLINIC_TZ,
  endOfDayUTC,
  formatDate,
  formatDateForInput,
  formatDateTime,
  formatTime,
  startOfDayUTC,
  toUTC,
} from "./datetime";

describe("CLINIC_TZ", () => {
  it("İstanbul olarak sabit (DST yok, yıl boyunca sabit UTC+3)", () => {
    expect(CLINIC_TZ).toBe("Europe/Istanbul");
  });
});

describe("toUTC / formatTime round-trip", () => {
  it("09:00 girdi -> DB'de 06:00Z -> ekranda tekrar 09:00", () => {
    const utcIso = toUTC("2026-07-28T09:00:00");
    expect(utcIso).toBe("2026-07-28T06:00:00.000Z");
    expect(formatTime(utcIso)).toBe("09:00");
  });

  it("14:30 girdi -> DB'de 11:30Z (raporlanan hatadaki tam senaryo)", () => {
    const utcIso = toUTC("2026-07-28T14:30:00");
    expect(utcIso).toBe("2026-07-28T11:30:00.000Z");
    expect(formatTime(utcIso)).toBe("14:30");
  });

  it("saat başı olmayan bir değeri de doğru çevirir", () => {
    const utcIso = toUTC("2026-01-15T07:47:00");
    expect(formatTime(utcIso)).toBe("07:47");
  });
});

describe("formatDateTime / formatDate", () => {
  it("dd.MM.yyyy HH:mm formatlar", () => {
    expect(formatDateTime("2026-07-28T11:30:00.000Z")).toBe("28.07.2026 14:30");
  });

  it("sadece tarih formatlar", () => {
    expect(formatDate("2026-07-28T11:30:00.000Z")).toBe("28.07.2026");
  });

  it("formatDateForInput <input type=date> için yyyy-MM-dd döner", () => {
    expect(formatDateForInput("2026-07-28T11:30:00.000Z")).toBe("2026-07-28");
  });
});

describe("gece yarısı sınır vakaları", () => {
  it("23:30 İstanbul girdisi doğru UTC'ye çevrilir ve geri okununca 23:30 kalır", () => {
    const utcIso = toUTC("2026-07-28T23:30:00");
    expect(utcIso).toBe("2026-07-28T20:30:00.000Z");
    expect(formatTime(utcIso)).toBe("23:30");
    expect(formatDateForInput(utcIso)).toBe("2026-07-28");
  });

  it("00:15 İstanbul girdisi (gün başı) doğru UTC'ye çevrilir, tarih kaymaz", () => {
    const utcIso = toUTC("2026-07-28T00:15:00");
    expect(utcIso).toBe("2026-07-27T21:15:00.000Z");
    expect(formatTime(utcIso)).toBe("00:15");
    // UTC anı önceki güne düşse de (21:15Z, 27'sinde), İstanbul takviminde hâlâ 28'i.
    expect(formatDateForInput(utcIso)).toBe("2026-07-28");
  });
});

describe("startOfDayUTC / endOfDayUTC — 'bugünün randevuları' gün sınırı", () => {
  it("günün ortasında bir an için doğru İstanbul gün sınırlarını verir", () => {
    const ogleUstuIstanbul = new Date("2026-07-28T11:30:00.000Z"); // 14:30 İstanbul
    expect(startOfDayUTC(ogleUstuIstanbul)).toBe("2026-07-27T21:00:00.000Z"); // 28'i 00:00 İstanbul
    expect(endOfDayUTC(ogleUstuIstanbul)).toBe("2026-07-28T21:00:00.000Z"); // 29'u 00:00 İstanbul
  });

  it("İstanbul'da 00:15 gibi gün başına yakın bir an, UTC takviminde önceki günde olsa da doğru günü verir", () => {
    // 2026-07-28T00:15 İstanbul == 2026-07-27T21:15Z (UTC takviminde hâlâ 27'si)
    const gunBasiAn = new Date("2026-07-27T21:15:00.000Z");
    expect(startOfDayUTC(gunBasiAn)).toBe("2026-07-27T21:00:00.000Z"); // 28'i İstanbul 00:00, doğru gün
    expect(endOfDayUTC(gunBasiAn)).toBe("2026-07-28T21:00:00.000Z");
  });

  it("İstanbul'da 23:30 gibi gün sonuna yakın bir an, UTC takviminde ertesi güne sarksa da doğru günü verir", () => {
    // 2026-07-28T23:30 İstanbul == 2026-07-28T20:30Z (UTC takviminde hâlâ 28'i, gün sonuna 90dk kala)
    const gunSonuAn = new Date("2026-07-28T20:30:00.000Z");
    expect(startOfDayUTC(gunSonuAn)).toBe("2026-07-27T21:00:00.000Z");
    expect(endOfDayUTC(gunSonuAn)).toBe("2026-07-28T21:00:00.000Z");
  });

  it("eski (hatalı) UTC-takvimi mantığından farklı sonuç üretir — regresyon kanıtı", () => {
    // Eski gunAraligi() UTC takvimiyle Date.UTC(2026,6,28) -> "2026-07-28T00:00:00.000Z" derdi.
    // Doğrusu İstanbul 00:00 = "2026-07-27T21:00:00.000Z" olmalı.
    const an = new Date("2026-07-28T11:30:00.000Z");
    expect(startOfDayUTC(an)).not.toBe("2026-07-28T00:00:00.000Z");
    expect(startOfDayUTC(an)).toBe("2026-07-27T21:00:00.000Z");
  });
});
