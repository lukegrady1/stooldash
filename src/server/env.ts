/** Server-side environment access. Supabase is optional in local dev (see store.ts). */
export function supabaseEnv(): { url: string; serviceKey: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!url || !serviceKey) return null;
  return { url, serviceKey, anonKey };
}

export function hasSupabase(): boolean {
  return supabaseEnv() !== null;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}
