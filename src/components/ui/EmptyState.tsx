import { LucideIcon } from 'lucide-react'
import { ReactNode } from 'react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <Icon className="h-12 w-12 mb-4 text-moss" />
      <h3 className="mb-2 text-lg font-semibold text-ink">{title}</h3>
      {description && <p className="mb-4 text-sm text-moss">{description}</p>}
      {action && <div>{action}</div>}
    </div>
  )
}
