import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PortalLoginForm } from "../../giris/login-form";

// Kliniğe özel portal adresi: /portal/<kısa kod>/giris. Kısa kod QR kısa kodudur; klinik giriş eyleminde tanima şemasından çözülür
// (bilinmeyen kodda sayfa yine açılır, giriş genel hata verir: kodun geçerliliği sızdırılmaz).
export default async function KlinigeOzelPortalGiris({ params, searchParams }: { params: Promise<{ klinikKodu: string }>; searchParams: Promise<{ telefon?: string }> }) {
  const { klinikKodu } = await params;
  const { telefon } = await searchParams;
  return (
    <div className="dark flex flex-1 items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Hasta Portalı</CardTitle>
        </CardHeader>
        <CardContent>
          <PortalLoginForm defaultTelefon={telefon} klinikKodu={klinikKodu} />
        </CardContent>
      </Card>
    </div>
  );
}
