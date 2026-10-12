import { describe, expect, it } from "vitest";
import { tedarikciAnahtari } from "./tedarikci-anahtari";

describe("tedarikciAnahtari", () => {
  it("büyük/küçük harf ve fazla boşluğu yok sayar", () => {
    expect(tedarikciAnahtari("  Ofis   Market ")).toBe("ofis market");
    expect(tedarikciAnahtari("ofis market")).toBe("ofis market");
  });

  it("Türkçe İ/I harflerini SQL tedarikci_anahtari() ile aynı eşler", () => {
    expect(tedarikciAnahtari("İPEK ILIK")).toBe("ipek ılık");
    expect(tedarikciAnahtari("ŞEKER")).toBe("şeker");
  });

  it("boş girdi boş anahtar verir", () => {
    expect(tedarikciAnahtari("   ")).toBe("");
  });
});
