import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SifreDegistirFormu } from "./form";

// Geçici şifreyle giriş yapanlar şifreyi değiştirmeden başka sayfaya geçemez (proxy.ts bu sayfaya yönlendirir).
export default function SifreDegistirSayfasi() {
  return (
    <div className="dark flex flex-1 items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Şifrenizi belirleyin</CardTitle>
          <CardDescription>Güvenliğiniz için devam etmeden önce kendi şifrenizi belirlemelisiniz.</CardDescription>
        </CardHeader>
        <CardContent>
          <SifreDegistirFormu />
        </CardContent>
      </Card>
    </div>
  );
}
