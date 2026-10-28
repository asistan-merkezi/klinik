import Link from "next/link";
import { redirect } from "next/navigation";
import { History } from "lucide-react";
import { withTenant } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { denetimSayfasiGetir, hastaAdlariniGetir, type DenetimEylemFiltresi, type DenetimSatiri } from "@/lib/denetim/sorgu";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import {
  alanEtiketi,
  DENETIM_EYLEM_ETIKETLERI,
  DENETIM_EYLEM_TONLARI,
  DENETIM_GRUP_ETIKETLERI,
  DENETIM_TABLO_ETIKETLERI,
  denetimHastaId,
  denetimOzetiOlustur,
  type DenetimGrubu,
} from "@/lib/denetim/gorunum";

const GUN_SECENEKLERI = [7, 30, 90] as const;
const EYLEMLER = ["insert", "update", "delete", "select", "destek"] as const;
const GRUPLAR: (DenetimGrubu | "hepsi")[] = ["hepsi", "finans", "hasta", "diger"];

type Filtreler = { grup: DenetimGrubu | "hepsi"; eylem: DenetimEylemFiltresi; gun: number; sayfa: number };

function filtreleriCoz(p: { grup?: string; eylem?: string; gun?: string; sayfa?: string }): Filtreler {
  const grup = GRUPLAR.find((g) => g === p.grup) ?? "hepsi";
  const eylem: DenetimEylemFiltresi = EYLEMLER.find((e) => e === p.eylem) ?? "";
  const gunSayi = Number(p.gun);
  const gun = GUN_SECENEKLERI.find((g) => g === gunSayi) ?? 30;
  const sayfa = Math.max(1, Math.floor(Number(p.sayfa)) || 1);
  return { grup, eylem, gun, sayfa };
}

function href(f: Filtreler, degisiklik: Partial<Filtreler>) {
  const s = { ...f, ...degisiklik };
  const q = new URLSearchParams();
  if (s.grup !== "hepsi") q.set("grup", s.grup);
  if (s.eylem) q.set("eylem", s.eylem);
  if (s.gun !== 30) q.set("gun", String(s.gun));
  if (s.sayfa > 1) q.set("sayfa", String(s.sayfa));
  const metin = q.toString();
  return `/panel/yonetim/denetim-gecmisi${metin ? `?${metin}` : ""}`;
}

function FiltreChip({ aktif, href: hedef, children }: { aktif: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link
      href={hedef}
      className={cn(
        buttonVariants({ variant: aktif ? "default" : "outline", size: "sm" }),
        // Seçili olmayan chip'ler soluk kalsın, seçili olan primary
        !aktif && "text-muted-foreground"
      )}
      aria-current={aktif ? "true" : undefined}
    >
      {children}
    </Link>
  );
}

export default async function DenetimGecmisiSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ grup?: string; eylem?: string; gun?: string; sayfa?: string }>;
}) {
  // Yalnız klinik_admin (kendi kliniği) ya da DESTEK BAĞLAMINDAKİ super_admin. Kod + RLS (audit_log_select_admin) aynı kuralı uygular.
  const { ctx, bag } = await panelBaglami();
  if (ctx.rol !== "klinik_admin" && ctx.rol !== "super_admin") redirect("/panel");
  const filtreler = filtreleriCoz(await searchParams);

  let satirlar: DenetimSatiri[] = [];
  let sonrakiVar = false;
  let hastaAdlari = new Map<string, string>();
  let error = false;
  try {
    const sonuc = await withTenant(bag, async (tx) => {
      const r = await denetimSayfasiGetir(tx, { klinikId: bag.tenantId, ...filtreler });
      const ids = [...new Set(r.satirlar.map((x) => denetimHastaId(x)).filter((id): id is string => !!id))];
      return { ...r, hastaAdlari: await hastaAdlariniGetir(tx, ids) };
    });
    ({ satirlar, sonrakiVar, hastaAdlari } = sonuc);
  } catch (e) {
    console.error("Denetim geçmişi yüklenemedi:", e);
    error = true;
  }

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <PageHeader
          title="Denetim Geçmişi"
          description="Kimin, hangi hasta veya finansal kayıt üzerinde ne zaman değişiklik yaptığı. Sağlık ve kimlik verilerinin içeriği gösterilmez, yalnız hangi kaydın/alanın değiştiği görünür."
          icon={History}
        />

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {GRUPLAR.map((g) => (
              <FiltreChip key={g} aktif={filtreler.grup === g} href={href(filtreler, { grup: g, sayfa: 1 })}>
                {g === "hepsi" ? "Tümü" : DENETIM_GRUP_ETIKETLERI[g]}
              </FiltreChip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FiltreChip aktif={filtreler.eylem === ""} href={href(filtreler, { eylem: "", sayfa: 1 })}>
              Tüm eylemler
            </FiltreChip>
            {EYLEMLER.map((e) => (
              <FiltreChip key={e} aktif={filtreler.eylem === e} href={href(filtreler, { eylem: e, sayfa: 1 })}>
                {DENETIM_EYLEM_ETIKETLERI[e]}
              </FiltreChip>
            ))}
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
            {GUN_SECENEKLERI.map((g) => (
              <FiltreChip key={g} aktif={filtreler.gun === g} href={href(filtreler, { gun: g, sayfa: 1 })}>
                Son {g} gün
              </FiltreChip>
            ))}
          </div>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            Denetim geçmişi yüklenemedi, lütfen tekrar deneyin.
          </p>
        ) : satirlar.length === 0 ? (
          <EmptyState
            icon={History}
            title="Bu filtre için kayıt yok."
            description="Denetim kaydı yalnız hasta, finans ve bazı klinik/personel işlemlerinde tutulur; bu özellik açılmadan önceki değişiklikler görünmez."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Zaman</TableHead>
                <TableHead>Kullanıcı</TableHead>
                <TableHead>Eylem</TableHead>
                <TableHead>Kayıt</TableHead>
                <TableHead>Hasta</TableHead>
                <TableHead>Ayrıntı</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {satirlar.map((s) => {
                const ozet = denetimOzetiOlustur(s);
                const hastaId = denetimHastaId(s);
                const hastaAdi = hastaId ? hastaAdlari.get(hastaId) : undefined;
                return (
                  <TableRow key={s.id} className="align-top">
                    <TableCell className="whitespace-nowrap text-muted-foreground tabular">
                      {formatDate(s.created_at)} {formatTime(s.created_at)}
                    </TableCell>
                    <TableCell>{s.kullanici?.ad_soyad ?? <span className="text-muted-foreground">{s.eylem.startsWith("destek_baglami") ? "Destek yetkilisi (platform)" : "Sistem / QR"}</span>}</TableCell>
                    <TableCell>
                      <StatusBadge tone={DENETIM_EYLEM_TONLARI[s.eylem] ?? "slate"}>
                        {DENETIM_EYLEM_ETIKETLERI[s.eylem] ?? s.eylem}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>{DENETIM_TABLO_ETIKETLERI[s.hedef_tablo ?? ""] ?? s.hedef_tablo ?? "—"}</TableCell>
                    <TableCell>
                      {hastaId ? (
                        <Link href={`/panel/hastalar/${hastaId}`} className="text-primary hover:underline">
                          {hastaAdi ?? "Hasta"}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-md">
                      {ozet.satirlar.length > 0 ? (
                        <dl className="flex flex-col gap-0.5 text-xs">
                          {ozet.satirlar.map((d) => (
                            <div key={d.alan} className="flex flex-wrap gap-x-1.5">
                              <dt className="text-muted-foreground">{alanEtiketi(d.alan)}:</dt>
                              <dd>
                                {d.eski !== undefined ? (
                                  <>
                                    <span className="text-muted-foreground line-through">{d.eski}</span>
                                    {" → "}
                                    <span className="font-medium">{d.yeni}</span>
                                  </>
                                ) : (
                                  <span className="font-medium">{d.yeni}</span>
                                )}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      ) : ozet.degisenAlanlar.length > 0 ? (
                        <span className="text-xs text-muted-foreground">
                          Değişen alanlar: {ozet.degisenAlanlar.map(alanEtiketi).join(", ")}
                        </span>
                      ) : ozet.degerGizli ? (
                        <span className="text-xs text-muted-foreground">İçerik gösterilmiyor (hassas veri)</span>
                      ) : ozet.eskiSurum && s.eylem === "update" ? (
                        <span className="text-xs text-muted-foreground">Kayıt güncellendi</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {(filtreler.sayfa > 1 || sonrakiVar) && (
          <div className="flex items-center justify-between">
            {filtreler.sayfa > 1 ? (
              <Link
                href={href(filtreler, { sayfa: filtreler.sayfa - 1 })}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                ‹ Önceki
              </Link>
            ) : (
              <span />
            )}
            <span className="text-xs text-muted-foreground tabular">Sayfa {filtreler.sayfa}</span>
            {sonrakiVar ? (
              <Link
                href={href(filtreler, { sayfa: filtreler.sayfa + 1 })}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Sonraki ›
              </Link>
            ) : (
              <span />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
