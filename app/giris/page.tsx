import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default function GirisSayfasi() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Muayene Asistanı</CardTitle>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  );
}
