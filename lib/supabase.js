import { createClient } from "@supabase/supabase-js";

// Fallbacks let the module evaluate during Next.js build/prerender without
// throwing. At runtime the real env vars must be set in your environment.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "https://placeholder.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "placeholder-anon-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
