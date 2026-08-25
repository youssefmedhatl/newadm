import { useT } from '@/lib/i18n'

/** Maps a database error code to a translated, user-facing sentence. */
export function useErrorText() {
  const t = useT()
  return (err: unknown): string => {
    const raw =
      typeof err === 'object' && err && 'message' in err
        ? String((err as { message: unknown }).message)
        : ''
    const detail =
      typeof err === 'object' && err && 'details' in err
        ? String((err as { details: unknown }).details ?? '')
        : ''
    const parts = detail ? detail.split('|') : []
    const key = `dbError.${raw.trim()}` as Parameters<typeof t>[0]
    const translated = t(key, { 0: parts[0] ?? '', 1: parts[1] ?? '', 2: parts[2] ?? '' })
    // Unknown code: fall back rather than showing a raw code to the user.
    return translated === key ? t('common.error') : translated
  }
}
