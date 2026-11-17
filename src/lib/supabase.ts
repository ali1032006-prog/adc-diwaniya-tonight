import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// The publishable key is meant for browsers; every table is behind RLS and anon gets nothing.
// Both values come from .env.local at build time (never committed). Google sign-in returns with a
// one-time ?code= (PKCE), which keeps the hash free for the app's own routes.
let client: SupabaseClient | null | undefined;

export function supabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  client = url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } }) : null;
  return client;
}

/** Tests swap the client for a fake. */
export function setSupabaseForTests(c: SupabaseClient | null): void {
  client = c;
}
