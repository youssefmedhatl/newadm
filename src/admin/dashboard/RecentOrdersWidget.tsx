import { useNavigate } from 'react-router-dom'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ShoppingBag } from 'lucide-react'
import { formatMoney, num } from '@/lib/money'
import { useLocale, useT } from '@/lib/i18n'
import { formatDistanceToNow } from 'date-fns'
import { ar, enUS } from 'date-fns/locale'
import type { Tables } from '@/lib/supabase'

interface RecentOrdersWidgetProps {
  data: Tables<'orders'>[]
  loading?: boolean
}

export function RecentOrdersWidget({ data, loading = false }: RecentOrdersWidgetProps) {
  const navigate = useNavigate()
  const { locale, isRTL } = useLocale()
  const t = useT()

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.recentOrders')}</CardTitle>
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
          <CardTitle>{t('dashboard.recentOrders')}</CardTitle>
        </CardHeader>
        <CardBody>
          <EmptyState
            icon={ShoppingBag}
            title={t('orders.noResults')}
            description=""
          />
        </CardBody>
      </Card>
    )
  }

  const getStatusBadgeTone = (status: string) => {
    if (status === 'completed') return 'success'
    if (status === 'cancelled') return 'danger'
    if (status === 'pending') return 'warning'
    return 'neutral'
  }

  const getPaymentBadgeTone = (status: string) => {
    if (status === 'paid') return 'success'
    if (status === 'refunded' || status === 'partially_refunded') return 'danger'
    return 'warning'
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('dashboard.recentOrders')}</CardTitle>
      </CardHeader>
      <CardBody>
        <div className="space-y-2">
          {data.map((order) => (
            <button
              key={order.id}
              onClick={() => navigate(`/admin/orders/${order.id}`)}
              className="group w-full rounded-lg border border-sand p-3 text-start hover:bg-sand transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="font-medium text-ink text-sm">
                  <span dir="ltr">{order.order_number}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Badge tone={getStatusBadgeTone(order.status)}>
                    {t(`status.${order.status}`)}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-moss flex-1">
                  {order.contact_name || 'Guest'}
                  {order.contact_phone && (
                    <>
                      {' • '}
                      <span dir="ltr">{order.contact_phone}</span>
                    </>
                  )}
                </div>
                <div className="text-sm font-medium text-ink">
                  {formatMoney(order.total, locale)}
                </div>
              </div>
            </button>
          ))}
        </div>
      </CardBody>
    </Card>
  )
}
