import { useNavigate } from 'react-router-dom'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { AlertTriangle } from 'lucide-react'
import { useLocalized, useT } from '@/lib/i18n'
import type { Views } from '@/lib/supabase'

interface LowStockWidgetProps {
  data: Views<'v_low_stock'>[]
  loading?: boolean
}

export function LowStockWidget({ data, loading = false }: LowStockWidgetProps) {
  const navigate = useNavigate()
  const t = useT()
  const getLocalized = useLocalized()

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.lowStock')}</CardTitle>
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
          <CardTitle>{t('dashboard.lowStock')}</CardTitle>
        </CardHeader>
        <CardBody>
          <EmptyState
            icon={AlertTriangle}
            title={t('common.none')}
            description="All items are well stocked"
          />
        </CardBody>
      </Card>
    )
  }

  const topLow = data.slice(0, 8)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('dashboard.lowStock')}</CardTitle>
      </CardHeader>
      <CardBody>
        <div className="space-y-3">
          {topLow.map((item) => (
            <button
              key={item.level_id}
              onClick={() => navigate('/admin/inventory')}
              className="group flex items-center justify-between gap-3 rounded-lg border border-sand p-3 text-start hover:bg-sand transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-ink text-sm truncate">
                  {getLocalized(
                    {
                      name_ar: item.product_name_ar,
                      name_en: item.product_name_en,
                    },
                    'name'
                  )}
                </div>
                <div className="text-xs text-moss mt-1">
                  {item.size && (
                    <span>{item.size}</span>
                  )}
                  {item.size && item.color_name && <span> / </span>}
                  {item.color_name && (
                    <span>{item.color_name}</span>
                  )}
                  {(item.size || item.color_name) && item.location_name_en && (
                    <span> • </span>
                  )}
                  {item.location_name_en && (
                    <span>{getLocalized({
                      name_ar: item.location_name_ar,
                      name_en: item.location_name_en,
                    }, 'name')}</span>
                  )}
                </div>
              </div>
              <Badge
                tone={item.available === 0 ? 'danger' : 'warning'}
              >
                {item.available || 0}
              </Badge>
            </button>
          ))}
        </div>
      </CardBody>
    </Card>
  )
}
