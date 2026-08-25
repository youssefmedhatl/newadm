import { TrendingUp, TrendingDown } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatMoney } from '@/lib/money'
import { useLocale, useT } from '@/lib/i18n'

interface KPITileProps {
  label: string
  value: string | number | null | undefined
  change?: string | number | null | undefined
  isMoney?: boolean
  loading?: boolean
  compact?: boolean
}

export function KPITile({
  label,
  value,
  change,
  isMoney = true,
  loading = false,
  compact = false,
}: KPITileProps) {
  const { locale } = useLocale()
  const t = useT()

  if (loading) {
    return (
      <Card>
        <CardBody className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-32" />
        </CardBody>
      </Card>
    )
  }

  const changeNum = typeof change === 'string' ? parseFloat(change) : change ?? 0
  const isPositive = changeNum >= 0
  const changePercent = Math.abs(changeNum)

  let displayValue = value
  if (isMoney && value !== null && value !== undefined) {
    displayValue = formatMoney(value, locale, { compact })
  } else if (!isMoney && typeof value === 'number') {
    displayValue = value.toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US')
  }

  return (
    <Card>
      <CardBody>
        <p className="text-sm text-moss mb-2">{label}</p>
        <div className="flex items-end justify-between gap-2">
          <div className="text-2xl font-bold text-ink">{displayValue}</div>
          {change !== null && change !== undefined && (
            <div
              className={`flex items-center gap-1 text-sm font-medium ${
                isPositive ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {isPositive ? (
                <TrendingUp className="h-4 w-4" />
              ) : (
                <TrendingDown className="h-4 w-4" />
              )}
              <span>{changePercent.toFixed(1)}%</span>
            </div>
          )}
        </div>
        {change !== null && change !== undefined && (
          <p className="text-xs text-moss mt-1">{t('dashboard.vs')}</p>
        )}
      </CardBody>
    </Card>
  )
}
