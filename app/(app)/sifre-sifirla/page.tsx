import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SifreSifirlaFormu } from "./form";

// Better Auth /api/auth/reset-password/:jeton bağlantısı geçerliyse buraya ?token=... ile, değilse ?error=INVALID_TOKEN ile yönlendirir.
export default async function SifreSifirlaSayfasi({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  return (
    <div className="dark flex flex-1 items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Yeni şifre belirleyin</CardTitle>
          <CardDescription>Bağlantı 30 dakika geçerlidir ve yalnız bir kez kullanılabilir.</CardDescription>
        </CardHeader>
        <CardContent>
          {token && !error ? (
            <SifreSifirlaFormu jeton={token} />
          ) : (
            <p role="alert" className="text-sm text-destructive">
              Bağlantı geçersiz veya süresi dolmuş. Lütfen yeni bir sıfırlama isteyin.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
