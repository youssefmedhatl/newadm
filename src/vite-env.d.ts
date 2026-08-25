/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_DEFAULT_LOCALE: string
  readonly VITE_DEFAULT_CURRENCY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
