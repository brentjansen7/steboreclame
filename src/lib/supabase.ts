import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key || url === "your-supabase-url-here") {
      throw new Error(
        "Supabase niet geconfigureerd. Vul NEXT_PUBLIC_SUPABASE_URL en NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
      );
    }
    // Fix known typo: prfhydvlkzwg -> prifhydvlkzwg
    url = url.replace("tnbwnqwprfhydvlkzwg", "tnbwnqwprifhydvlkzwg");
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// Re-export as `supabase` for convenience — only call at runtime (client components)
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabase() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
