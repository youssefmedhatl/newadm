import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import { translations } from './translations'
import { env } from './env'

export type Locale = 'ar' | 'en'

interface LocaleContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  dir: 'rtl' | 'ltr'
  isRTL: boolean
}

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined)

/**
 * Provides locale management and switches between Arabic (RTL) and English (LTR).
 * Persists locale choice to localStorage['vitality.locale'].
 * Sets document.documentElement.lang and dir on mount and changes.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    // Initial value from localStorage or env default
    if (typeof window === 'undefined') return env.defaultLocale as Locale
    try {
      const stored = localStorage.getItem('vitality.locale')
      // Validate stored locale; fall back to env default if invalid
      return stored === 'ar' || stored === 'en'
        ? stored
        : (env.defaultLocale === 'en' ? 'en' : 'ar')
    } catch {
      return env.defaultLocale as Locale
    }
  })

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale)
    try {
      localStorage.setItem('vitality.locale', newLocale)
    } catch {
      // Ignore localStorage errors (private browsing, etc.)
    }
  }, [])

  useEffect(() => {
    // Update document direction and language
    document.documentElement.lang = locale
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'
  }, [locale])

  const dir = locale === 'ar' ? 'rtl' : 'ltr'
  const isRTL = locale === 'ar'

  return (
    <LocaleContext.Provider value={{ locale, setLocale, dir, isRTL }}>
      {children}
    </LocaleContext.Provider>
  )
}

/**
 * Hook to access and change the current locale.
 */
export function useLocale() {
  const context = useContext(LocaleContext)
  if (!context) {
    throw new Error('useLocale must be used within LocaleProvider')
  }
  return context
}

/**
 * Hook for translation lookup with variable interpolation.
 * Supports {varName} style placeholders.
 * Falls back to English, then the key itself, if a translation is missing.
 *
 * @example
 * const t = useT()
 * t('common.save')                    // -> "Save" or "حفظ"
 * t('auth.welcome', { name: 'John' }) // -> "Welcome, John" or similar
 */
export function useT() {
  const { locale } = useLocale()

  return useCallback(
    (
      key: keyof typeof translations.en,
      vars?: Record<string, string | number>
    ): string => {
      const textRecord = translations[locale] as Record<string, string>
      const fallbackRecord = translations.en as Record<string, string>

      let text: string =
        textRecord[key as string] ||
        fallbackRecord[key as string] ||
        (key as string)

      if (vars) {
        Object.entries(vars).forEach(([name, value]) => {
          text = text.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value))
        })
      }

      return text
    },
    [locale]
  )
}

/**
 * Order lines snapshot the product name at the time of sale so later renames
 * cannot rewrite history. Both languages are stored (`product_name` is English,
 * `product_name_ar` Arabic); this picks the right one and falls back to the
 * other when a product was saved without a translation.
 *
 * Rows written before migration 0013 have no Arabic snapshot, so they fall back
 * to English rather than rendering blank.
 */
export function useOrderItemName() {
  const { locale } = useLocale()

  return useCallback(
    (item: { product_name?: string | null; product_name_ar?: string | null }): string => {
      const ar = item.product_name_ar
      const en = item.product_name
      return (locale === 'ar' ? ar || en : en || ar) || ''
    },
    [locale]
  )
}

/**
 * Hook to render bilingual database columns.
 * Given a row and a base column name (e.g., 'name'),
 * returns the localized value (name_ar or name_en).
 *
 * Priority:
 * - Locale-specific column if it has content
 * - Fallback to the other language
 * - Empty string if neither exists
 *
 * @example
 * const getLocalized = useLocalized()
 * const name = getLocalized(product, 'name')
 * // Returns product.name_ar (if Arabic and not empty) or product.name_en
 */
export function useLocalized() {
  const { locale } = useLocale()

  return useCallback(
    <T extends Record<string, unknown>>(
      row: T,
      base: string
    ): string => {
      const localeKey = `${base}_${locale}` as keyof T
      const otherKey = `${base}_${locale === 'ar' ? 'en' : 'ar'}` as keyof T

      const localeValue = row[localeKey]
      const otherValue = row[otherKey]

      // Prefer locale-specific column if it has content
      if (localeValue && typeof localeValue === 'string') {
        return localeValue
      }

      // Fallback to other language
      if (otherValue && typeof otherValue === 'string') {
        return otherValue
      }

      return ''
    },
    [locale]
  )
}
