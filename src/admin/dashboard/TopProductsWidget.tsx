import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { TrendingUp } from 'lucide-react'
import { formatMoney, formatNumber, num } from '@/lib/money'
import { useLocale, useLocalized, useT } from '@/lib/i18n'
import type { Views } from '@/lib/supabase'

interface TopProductsWidgetProps {
  data: Views<'v_product_performance'>[]
  loading?: boolean
}

export function TopProductsWidget({ data, loading = false }: TopProductsWidgetProps) {
  const { locale } = useLocale()
  const t = useT()
  const getLocalized = useLocalized()

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.topProducts')}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardBody>
      </Card>
    )
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.topProducts')}</CardTitle>
        </CardHeader>
        <CardBody>
          <EmptyState
            icon={TrendingUp}
            title={t('common.none')}
            description=""
          />
        </CardBody>
      </Card>
    )
  }

  const topProducts = data.slice(0, 5)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('dashboard.topProducts')}</CardTitle>
      </CardHeader>
      <CardBody>
        <div className="space-y-3">
          {topProducts.map((product, idx) => (
            <div key={product.product_id} className="flex items-center justify-between gap-3 pb-3 border-b border-sand last:border-0 last:pb-0">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-ink text-sm truncate">
                  {idx + 1}. {getLocalized({
                    name_ar: product.name_ar,
                    name_en: product.name_en,
                  }, 'name')}
                </div>
                <div className="text-xs text-moss mt-1">
                  {formatNumber(product.units_sold, locale)} {t('dashboard.units')}
                </div>
              </div>
              <div className="text-end">
                <div className="text-sm font-medium text-ink">
                  {formatMoney(product.revenue, locale)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  )
}
