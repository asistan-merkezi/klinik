import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { KrediDetay } from "@/components/mesajlasma/KrediDetay";
import { KREDI_PAKETLERI } from "@/lib/mesajlasma/kredi-fiyat";
import { KANAL_ETIKET, type MesajBolum, type MesajKanal, type MesajKrediIslemSatir, type MesajKullanimOzetSatir } from "@/types/mesajlasma";
import { krediYukle } from "./actions";

const GECERLI_KANALLAR: MesajKanal[] = ["sms", "whatsapp", "mail"];

export default async function KrediDetaySayfasi({ params }: { params: Promise<{ kanal: string }> }) {
  const { kanal: kanalParam } = await params;

  if (!GECERLI_KANALLAR.includes(kanalParam as MesajKanal)) {
    notFound();
  }
  const kanal = kanalParam as MesajKanal;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("rol, klinik_id").eq("id", user.id).single();

  if (kullanici?.rol !== "klinik_admin") {
    redirect("/panel/ayarlar/mesajlasma");
  }

  const klinikId = kullanici.klinik_id;
  if (!klinikId) {
    return (
      <div className="flex-1 bg-background p-4 sm:p-8">
        <p className="text-sm text-muted-foreground">Klinik bilgisi bulunamadı.</p>
      </div>
    );
  }

  // Kullanım Raporu "her ay ayrı günlük liste" istediği için sabit bir gün
  // aralığı filtresi yok — yine de tabloyu sınırsız büyütmemek için son 12 ay
  // ile sınırlı (her ay kendi katlanır bölümünde, bkz. KullanimRaporu).
  const oniki_ay_once = new Date();
  oniki_ay_once.setMonth(oniki_ay_once.getMonth() - 12);
  const baslangicIso = oniki_ay_once.toISOString().slice(0, 10);

  const [bakiyeSonuc, islemlerSonuc, logSonuc] = await Promise.all([
    supabase.from("mesaj_kredi_bakiye").select("bakiye").eq("klinik_id", klinikId).eq("kanal", kanal).maybeSingle(),
    supabase
      .from("mesaj_kredi_islem")
      .select("id, kanal, islem_tipi, miktar, tutar, aciklama, created_at")
      .eq("klinik_id", klinikId)
      .eq("kanal", kanal)
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<MesajKrediIslemSatir[]>(),
    supabase
      .from("mesaj_log")
      .select("tarih, bolum")
      .eq("klinik_id", klinikId)
      .eq("kanal", kanal)
      .gte("tarih", baslangicIso)
      .returns<{ tarih: string; bolum: MesajBolum }[]>(),
  ]);

  const ozetMap = new Map<string, MesajKullanimOzetSatir>();
  for (const satir of logSonuc.data ?? []) {
    const anahtar = `${satir.tarih}-${satir.bolum}`;
    const mevcut = ozetMap.get(anahtar);
    if (mevcut) {
      mevcut.toplam_adet += 1;
    } else {
      ozetMap.set(anahtar, { tarih: satir.tarih, bolum: satir.bolum, toplam_adet: 1 });
    }
  }
  const kullanimOzet = Array.from(ozetMap.values()).sort((a, b) => b.tarih.localeCompare(a.tarih));

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header>
          <h1 className="text-xl font-semibold">{KANAL_ETIKET[kanal]} Kredisi</h1>
          <p className="text-sm text-muted-foreground">Kredi yükleyin ve kullanım geçmişini görüntüleyin.</p>
        </header>

        <KrediDetay
          kanal={kanal}
          bakiye={bakiyeSonuc.data?.bakiye ?? 0}
          paketler={KREDI_PAKETLERI}
          islemler={islemlerSonuc.data ?? []}
          kullanimOzet={kullanimOzet}
          action={krediYukle.bind(null, kanal)}
        />
      </div>
    </div>
  );
}
