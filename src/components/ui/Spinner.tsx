import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  /** Set when the spinner sits inside an already-labelled control (e.g. a
   *  loading Button) — it is then decorative and must not be announced. */
  decorative?: boolean
  ariaLabel?: string
}

export function Spinner({ size = 'md', decorative = false, ariaLabel }: SpinnerProps) {
  const t = useT()
  const sizeStyles = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-4',
    lg: 'h-12 w-12 border-4',
  }

  return (
    <div
      className={cn(
        'animate-spin rounded-full border-sand border-t-ink',
        sizeStyles[size]
      )}
      {...(decorative
        ? { 'aria-hidden': true }
        : { role: 'status', 'aria-label': ariaLabel ?? t('common.loading') })}
    />
  )
}
