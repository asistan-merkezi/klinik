"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { MODULE_TREE, type ModuleNode } from "@/lib/auth/roles";

// Not: @base-ui/react/checkbox-group'un useCheckboxGroupParent hook'u
// paketin public "exports" haritasında yok (sadece checkbox-group/index'ten
// CheckboxGroup export ediliyor) — derin import build'de kırılır. Parent
// checked/indeterminate hesaplaması bu yüzden burada elle yapılıyor (birkaç
// satır, CheckboxRoot'un native `indeterminate` prop'u zaten var).

function yaprakAnahtarlari(dugum: ModuleNode): string[] {
  if (!dugum.children?.length) return [dugum.key];
  return dugum.children.flatMap(yaprakAnahtarlari);
}

function ModulDugumu({
  dugum,
  value,
  onValueChange,
  disabled,
}: {
  dugum: ModuleNode;
  value: string[];
  onValueChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  if (!dugum.children?.length) {
    const secili = value.includes(dugum.key);
    return (
      <label className="flex items-center gap-2 py-1 text-sm">
        <Checkbox
          checked={secili}
          disabled={disabled}
          onCheckedChange={(checked) =>
            onValueChange(checked ? [...value, dugum.key] : value.filter((k) => k !== dugum.key))
          }
        />
        {dugum.label}
      </label>
    );
  }

  const altAnahtarlar = dugum.children.flatMap(yaprakAnahtarlari);
  const seciliSayisi = altAnahtarlar.filter((k) => value.includes(k)).length;
  const tumuSecili = seciliSayisi > 0 && seciliSayisi === altAnahtarlar.length;
  const kismiSecili = seciliSayisi > 0 && !tumuSecili;

  function parentDegisti(checked: boolean) {
    onValueChange(
      checked
        ? [...new Set([...value, ...altAnahtarlar])]
        : value.filter((k) => !altAnahtarlar.includes(k))
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-2 py-1 text-sm font-medium">
        <Checkbox
          checked={tumuSecili}
          indeterminate={kismiSecili}
          disabled={disabled}
          onCheckedChange={parentDegisti}
        />
        {dugum.label}
      </label>
      <div className="ml-2.5 flex flex-col gap-0.5 border-l border-border pl-3">
        {dugum.children.map((cocuk) => (
          <ModulDugumu
            key={cocuk.key}
            dugum={cocuk}
            value={value}
            onValueChange={onValueChange}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Cascading modül-izin ağacı — Ayarlar > Yetkilendirme'de (pozisyon şablonu)
 * ve Personel formunda (kullanıcıya özel override) AYNI bileşen kullanılır.
 * `value` düz bir anahtar listesi (üst modül seçiliyse alt modüller ayrıca
 * listede olmasa da erişimi kapsar — bkz. lib/auth/roles.ts canAccessModule).
 */
export function ModulAgaci({
  value,
  onValueChange,
  disabled,
}: {
  value: string[];
  onValueChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      {MODULE_TREE.filter((dugum) => dugum.key !== "destek").map((dugum) => (
        <ModulDugumu key={dugum.key} dugum={dugum} value={value} onValueChange={onValueChange} disabled={disabled} />
      ))}
    </div>
  );
}
