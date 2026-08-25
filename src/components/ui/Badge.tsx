import { cn } from '@/lib/utils'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
}

export function Badge({ className, tone = 'neutral', children, ...props }: BadgeProps) {
  const toneStyles = {
    neutral: 'bg-sand text-ink',
    success: 'bg-success text-white',
    warning: 'bg-warning text-white',
    danger: 'bg-danger text-white',
    info: 'bg-info text-white',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium',
        toneStyles[tone],
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}
