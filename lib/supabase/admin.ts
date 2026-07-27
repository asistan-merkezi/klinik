import { createClient } from "@supabase/supabase-js";

/**
 * Servis rolü client'ı — RLS'i bypass eder (auth.admin.createUser gibi işlemler
 * normal client ile yapılamaz). Sadece server action dosyalarından çağrılmalı,
 * asla client component'e veya API response'a sızdırılmamalı.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
