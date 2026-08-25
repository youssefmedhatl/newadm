import { useState, useCallback, useEffect, useId } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string
  onValueChange: (value: string) => void
}

export function SearchInput({
  value,
  onValueChange,
  className,
  placeholder = 'Search...',
  ...props
}: SearchInputProps) {
  const t = useT()
  const [localValue, setLocalValue] = useState(value)
  // Re-sync the local echo when the controlled `value` prop changes from
  // outside (e.g. a parent clearing the search). Comparing during render
  // and calling setState here — instead of in a useEffect — avoids an
  // extra render pass on every external value change.
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    setLocalValue(value)
  }
  const timeoutRef = useCallback(
    () => {
      const timer = setTimeout(() => {
        onValueChange(localValue)
      }, 300)
      return timer
    },
    [localValue, onValueChange]
  )

  useEffect(() => {
    const timer = timeoutRef()
    return () => clearTimeout(timer)
  }, [timeoutRef])

  const inputId = useId()

  const handleClear = () => {
    setLocalValue('')
    onValueChange('')
  }

  return (
    <div className="relative">
      <Search className="absolute inset-y-0 start-3 h-5 w-5 text-moss" />
      <input
        id={inputId}
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full rounded-xl border border-sand bg-bone ps-10 pe-10 py-2.5 text-ink placeholder-moss transition-colors focus:border-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
          className
        )}
        {...props}
      />
      {localValue && (
        <button
          onClick={handleClear}
          className="absolute inset-y-0 end-3 rounded-lg p-1 hover:bg-sand/50 transition-colors"
          aria-label={t('common.clearSearch')}
        >
          <X className="h-5 w-5 text-moss" />
        </button>
      )}
    </div>
  )
}
