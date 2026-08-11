import type { PaketSatisSatir } from "@/types/odeme";

export function AktifPaketSatiri({ paketSatis }: { paketSatis: PaketSatisSatir }) {
  const toplam = paketSatis.paket?.seans_sayisi ?? 0;
  const kullanilan = Math.max(toplam - paketSatis.kalan_adet, 0);
  const baslamaTarihi = new Date(paketSatis.satis_tarihi).toLocaleDateString("tr-TR");

  return (
    <li className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col">
        <span className="font-medium">{paketSatis.paket?.ad ?? "—"}</span>
        <span className="text-xs text-muted-foreground">
          Başlama {baslamaTarihi} · {toplam} seans
        </span>
      </div>
      <span className="text-muted-foreground">
        {kullanilan} kullanıldı · {paketSatis.kalan_adet} kaldı
      </span>
    </li>
  );
}
