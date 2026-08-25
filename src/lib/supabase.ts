import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { env, isSupabaseConfigured } from './env'

/**
 * Typed Supabase client configured with session persistence and auto-refresh.
 *
 * If VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing, createClient()
 * throws immediately at import time — before React ever mounts — which
 * produces a blank white screen with no visible error. Falling back to a
 * harmless placeholder URL here lets the app boot normally so App.tsx's own
 * "Supabase isn't configured" screen (gated on isSupabaseConfigured) can
 * actually render and tell the user what's missing.
 */
export const supabase = createClient<Database>(
  isSupabaseConfigured ? env.supabaseUrl : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? env.supabaseAnonKey : 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
)

/**
 * Helper types derived from the generated database types.
 * Makes it easier to reference rows from specific tables.
 */
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T]

export type Views<T extends keyof Database['public']['Views']> =
  Database['public']['Views'][T]['Row']
