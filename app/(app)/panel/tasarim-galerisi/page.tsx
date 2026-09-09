import { notFound } from "next/navigation";
import { Users, CalendarDays, Package, Activity, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ModuleCard } from "@/components/panel/module-card";
import { Avatar } from "@/components/ui/avatar";

const TONLAR: { tone: StatusTone; label: string; pulse?: boolean }[] = [
  { tone: "emerald", label: "Tamamlandı" },
  { tone: "amber", label: "Beklemede" },
  { tone: "teal", label: "Seans Başladı", pulse: true },
  { tone: "rose", label: "Gelmedi / İptal" },
  { tone: "indigo", label: "Değerlendirme Bekliyor" },
  { tone: "sky", label: "Ertelendi" },
  { tone: "slate", label: "Nötr" },
  { tone: "primary", label: "Planlandı" },
];

function Bolum({ baslik, children }: { baslik: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-foreground">{baslik}</h2>
      {children}
    </section>
  );
}

export default function TasarimGalerisiSayfasi() {
  // Sadece geliştirme ortamında görünür — super_admin klinik_id=NULL olduğu
  // için panel/layout.tsx'in klinik-scoped sorguları onun için zaten
  // anlamlı bir kabuk üretmiyor (bkz. rapor); dev-only gating pratikte
  // çalışan tek seçenekti.
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-10">
        <PageHeader
          title="Tasarım Galerisi"
          description="components/ui/* — docs/DESIGN.md'ye göre yeniden kurulan ortak bileşen seti (Faz 2). Sadece geliştirme ortamında görünür."
        />

        <Bolum baslik="Page Header">
          <Card>
            <CardContent>
              <PageHeader
                title="Hastalar"
                description="Hasta kayıtlarını görüntüle, ekle ve düzenle."
                breadcrumb={<span>Panel / Hastalar</span>}
                actions={
                  <>
                    <Button variant="outline" size="sm">
                      Bildirimler
                    </Button>
                    <Button size="sm">Yeni Hasta Ekle</Button>
                  </>
                }
              />
            </CardContent>
          </Card>
        </Bolum>

        <Bolum baslik="KPI Kartları">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Aktif Hastalar" value="248" icon={Users} iconTone="blue" trend="+12 bu ay" />
            <KpiCard
              label="Bugünkü Seanslar"
              value="42 / 48"
              icon={CalendarDays}
              iconTone="emerald"
              trend={<ProgressBar value={42} max={48} />}
            />
            <KpiCard label="Bekleyen Talepler" value="7" icon={Package} iconTone="amber" />
            <KpiCard label="Aylık Hakediş" value={null} icon={Wallet} iconTone="violet" trend="Veri kaynağı yok — '—' gösterimi" />
          </div>
        </Bolum>

        <Bolum baslik="Butonlar">
          <Card>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button>Primary — Yeni Randevu</Button>
                <Button variant="clinical">Clinical — Seansı Başlat</Button>
                <Button variant="secondary">Secondary (nötr)</Button>
                <Button variant="outline">Outline — İptal</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="destructive">Destructive</Button>
                <Button variant="link">Link</Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="xs">xs</Button>
                <Button size="sm">sm</Button>
                <Button size="default">default</Button>
                <Button size="lg">lg</Button>
                <Button size="icon" aria-label="İkon">
                  <Activity />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button disabled>Disabled</Button>
                <Button variant="outline" disabled>
                  Disabled Outline
                </Button>
              </div>
            </CardContent>
          </Card>
        </Bolum>

        <Bolum baslik="Durum Rozetleri (StatusBadge)">
          <Card>
            <CardContent className="flex flex-wrap gap-2">
              {TONLAR.map(({ tone, label, pulse }) => (
                <StatusBadge key={tone} tone={tone} pulse={pulse}>
                  {label}
                </StatusBadge>
              ))}
            </CardContent>
          </Card>
        </Bolum>

        <Bolum baslik="Kartlar (Card)">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Z1 (varsayılan)</CardTitle>
                <CardDescription>shadow-z1, rounded-2xl (1rem)</CardDescription>
              </CardHeader>
              <CardContent>Standart kart yüzeyi.</CardContent>
            </Card>
            <Card elevated>
              <CardHeader>
                <CardTitle>Z2 (elevated)</CardTitle>
                <CardDescription>shadow-z2</CardDescription>
              </CardHeader>
              <CardContent>Dropdown/hover-peek gibi öne çıkan yüzeyler.</CardContent>
            </Card>
            <Card feature interactive>
              <CardHeader>
                <CardTitle>Feature + Interactive</CardTitle>
                <CardDescription>rounded-3xl (1.5rem)</CardDescription>
              </CardHeader>
              <CardContent>Hero/öne çıkan kart, hover&apos;da yükselir.</CardContent>
              <CardFooter>
                <Button size="sm">Aksiyon</Button>
              </CardFooter>
            </Card>
          </div>
        </Bolum>

        <Bolum baslik="ModuleCard">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <ModuleCard icon={Users} label="Hastalar" subtitle="248 kayıt" tone="blue" href="#" />
            <ModuleCard icon={CalendarDays} label="Randevular" subtitle="Aktif" tone="emerald" dot="emerald" href="#" active />
            <ModuleCard icon={Package} label="Paketler" subtitle="Eksik bilgi" warning href="#" />
            <ModuleCard icon={Wallet} label="Muhasebe" tone="violet" href="#" />
          </div>
        </Bolum>

        <Bolum baslik="Form Alanları">
          <Card>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Resting</label>
                <Input placeholder="Hasta adı, TC veya randevu ara..." />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Hata durumu</label>
                <Input aria-invalid defaultValue="Geçersiz TC no" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Select</label>
                <Select>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Terapist seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="a">Fzt. Selin Demir</SelectItem>
                    <SelectItem value="b">Fzt. Arda Kaya</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Textarea</label>
                <Textarea placeholder="Seans notu..." />
              </div>
            </CardContent>
          </Card>
        </Bolum>

        <Bolum baslik="Dialog">
          <Dialog>
            <DialogTrigger render={<Button>Dialog Aç</Button>} />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Yeni Randevu</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Z3 gölge + frosted backdrop, rounded-3xl (1.5rem).
              </p>
              <DialogFooter>
                <Button variant="outline">Vazgeç</Button>
                <Button>Kaydet</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Bolum>

        <Bolum baslik="Table">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hasta</TableHead>
                <TableHead>Terapist</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="text-right">Tutar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="flex items-center gap-2">
                  <Avatar name="Mehmet Ali Yılmaz" size="sm" />
                  Mehmet Ali Yılmaz
                </TableCell>
                <TableCell>Fzt. Arda Kaya</TableCell>
                <TableCell>
                  <StatusBadge tone="emerald">Tamamlandı</StatusBadge>
                </TableCell>
                <TableCell className="text-right tabular-nums">₺1.500,00</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="flex items-center gap-2">
                  <Avatar name="Ayşe Nur Çetin" size="sm" />
                  Ayşe Nur Çetin
                </TableCell>
                <TableCell>Fzt. Selin Demir</TableCell>
                <TableCell>
                  <StatusBadge tone="teal" pulse>
                    Seans Başladı
                  </StatusBadge>
                </TableCell>
                <TableCell className="text-right tabular-nums">₺850,00</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Bolum>

        <Bolum baslik="Empty State">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card>
              <CardContent>
                <EmptyState icon={CalendarDays} title="Henüz randevu yok" description="Yeni bir randevu oluşturarak başlayın." />
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <EmptyState icon={Package} title="Kayıt bulunamadı" compact />
              </CardContent>
            </Card>
          </div>
        </Bolum>
      </div>
    </div>
  );
}
