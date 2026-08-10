import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function KamuFormKarti({
  klinikAd,
  baslik,
  aciklama,
  genis,
  children,
}: {
  klinikAd: string;
  baslik: string;
  aciklama: string;
  genis?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="dark flex flex-1 items-center justify-center bg-background p-4">
      <Card className={genis ? "w-full max-w-2xl" : "w-full max-w-md"}>
        <CardHeader>
          <CardDescription>{klinikAd}</CardDescription>
          <CardTitle>{baslik}</CardTitle>
          <p className="text-xs text-muted-foreground">{aciklama}</p>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}

export function KamuFormBulunamadi() {
  return (
    <div className="dark flex flex-1 items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Klinik bulunamadı</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Bu bağlantı geçersiz görünüyor. Lütfen kare kodu tekrar okutun veya klinikle iletişime geçin.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
