import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PortalLoginForm } from "./login-form";

export default async function PortalGirisSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ telefon?: string }>;
}) {
  const { telefon } = await searchParams;

  return (
    <div className="dark flex flex-1 items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Hasta Portalı</CardTitle>
        </CardHeader>
        <CardContent>
          <PortalLoginForm defaultTelefon={telefon} />
        </CardContent>
      </Card>
    </div>
  );
}
