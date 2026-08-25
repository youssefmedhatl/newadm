import { forwardRef, useId } from 'react'
import { cn } from '@/lib/utils'

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  hint?: string
  required?: boolean
  options?: Array<{ value: string | number; label: string }>
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      label,
      error,
      hint,
      required,
      id,
      options,
      children,
      ...props
    },
    ref
  ) => {
    const generatedId = useId()
    const selectId = id || generatedId

    return (
      <div className="space-y-1">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-sm font-medium text-ink"
          >
            {label}
            {required && <span className="text-danger ms-1">*</span>}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={cn(
            'w-full rounded-xl border border-sand bg-bone px-4 py-2.5 text-ink transition-colors focus:border-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
            error && 'border-danger',
            className
          )}
          {...props}
        >
          {children
            ? children
            : options?.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
        </select>
        {error && (
          <p className="text-sm text-danger">{error}</p>
        )}
        {hint && !error && (
          <p className="text-sm text-moss">{hint}</p>
        )}
      </div>
    )
  }
)

Select.displayName = 'Select'
