import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Clock } from 'lucide-react'
import { formatMoney, num } from '@/lib/money'
import { useLocale, useLocalized, useT } from '@/lib/i18n'
import type { Tables } from '@/lib/supabase'

interface OpenShiftWidgetProps {
  shift: (Tables<'shifts'> & { opened_by_name?: string }) | null
  expectedCash?: number
  loading?: boolean
}

export function OpenShiftWidget({
  shift,
  expectedCash,
  loading = false,
}: OpenShiftWidgetProps) {
  const { locale } = useLocale()
  const t = useT()
  const getLocalized = useLocalized()

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.openShift')}</CardTitle>
        </CardHeader>
        <CardBody>
          <Skeleton className="h-32 w-full" />
        </CardBody>
      </Card>
    )
  }

  if (!shift) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.openShift')}</CardTitle>
        </CardHeader>
        <CardBody>
          <EmptyState
            icon={Clock}
            title={t('pos.noOpenShift')}
            description=""
          />
        </CardBody>
      </Card>
    )
  }

  return (
    <Card className="border-amber-300 bg-amber-50">
      <CardHeader>
        <CardTitle className="text-amber-900">{t('dashboard.openShift')}</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        <div>
          <p className="text-xs text-amber-700">
            {t('dashboard.openedBy', { name: shift.opened_by_name || 'Unknown' })}
          </p>
          <p className="text-sm font-medium text-amber-900 mt-1">
            {formatMoney(shift.opening_float, locale)}
          </p>
        </div>
        {expectedCash !== undefined && (
          <div>
            <p className="text-xs text-amber-700">{t('pos.expectedCash')}</p>
            <p className="text-sm font-medium text-amber-900 mt-1">
              {formatMoney(expectedCash, locale)}
            </p>
          </div>
        )}
      </CardBody>
    </Card>
  )
}
