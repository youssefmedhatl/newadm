/**
 * Environment variable parsing and validation.
 * Provides parsed config without throwing at module scope.
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const defaultLocale = (import.meta.env.VITE_DEFAULT_LOCALE || 'ar') as string
const currency = (import.meta.env.VITE_DEFAULT_CURRENCY || 'EGP') as string

/**
 * True only when both Supabase URL and key are non-empty strings.
 * Used to decide whether to render the app or a "not configured" message.
 */
export const isSupabaseConfigured =
  typeof supabaseUrl === 'string' &&
  supabaseUrl.length > 0 &&
  typeof supabaseAnonKey === 'string' &&
  supabaseAnonKey.length > 0

export const env = {
  supabaseUrl,
  supabaseAnonKey,
  defaultLocale,
  currency,
}
