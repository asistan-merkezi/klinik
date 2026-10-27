// KALDIRILACAK (Aşama 3 sonu): oturum kapısı artık Better Auth tabanlıdır (lib/auth/proxy-oturum.ts). Bu dosya yalnız eski içe aktarmalar kırılmasın diye
// aynı imzayı yeni uygulamaya yönlendirir; Supabase'e BAĞLANMAZ.
export { oturumKapisi as updateSession } from "@/lib/auth/proxy-oturum";
