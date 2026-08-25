import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

interface TabItem {
  id: string
  label: string
  icon?: LucideIcon
}

interface TabsProps {
  tabs: TabItem[]
  active: string
  onChange: (id: string) => void
}

export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div className="flex gap-2 border-b border-sand overflow-x-auto">
      {tabs.map((tab) => {
        const Icon = tab.icon
        const isActive = active === tab.id

        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap',
              isActive
                ? 'bg-ink text-bone'
                : 'bg-transparent text-moss hover:text-ink'
            )}
          >
            {Icon && <Icon className="h-4 w-4" />}
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
