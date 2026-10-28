// Next.js sunucu başlangıcı: tüm sunucu günlükleri gizli/kişisel değerlerden arındırılır (lib/guvenlik/log-temizle.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { consoleTemizleyiciKur } = await import("./lib/guvenlik/log-temizle");
    consoleTemizleyiciKur();
  }
}
