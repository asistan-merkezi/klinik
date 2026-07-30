import { Card, CardContent } from "@/components/ui/card";

export function PlaceholderSekmesi({ baslik, aciklama }: { baslik: string; aciklama: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-1 py-10 text-center">
        <p className="text-sm font-medium">{baslik}</p>
        <p className="text-sm text-muted-foreground">{aciklama}</p>
      </CardContent>
    </Card>
  );
}
