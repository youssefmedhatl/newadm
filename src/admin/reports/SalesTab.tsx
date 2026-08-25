import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { supabase, type Views } from '@/lib/supabase'
import { useT, useLocale } from '@/lib/i18n'
import { formatMoney, formatNumber, num } from '@/lib/money'
import { Card, CardBody, CardHeader, CardTitle, Button, Skeleton } from '@/components/ui'
import { Download } from 'lucide-react'
import { buildCsv, downloadCsv } from './csv'
import type { DateRange } from './ReportFilters'

type DailySales = Views<'v_daily_sales'>

interface SalesTabProps {
  range: DateRange
  locationId: string
}

export function SalesTab({ range, locationId }: SalesTabProps) {
  const t = useT()
  const { locale, isRTL } = useLocale()

  const { data = [], isLoading } = useQuery({
    queryKey: ['reports', 'sales', range.from, range.to, locationId],
    queryFn: async () => {
      let query = supabase
        .from('v_daily_sales')
        .select('*')
        .gte('day', range.from)
        .lte('day', range.to)

      if (locationId) query = query.eq('location_id', locationId)

      const { data, error } = await query.order('day', { ascending: true })
      if (error) throw error
      return (data as DailySales[]) || []
    },
  })

  const chartData = useMemo(() => {
    const byDay = new Map<string, { day: string; pos: number; online: number }>()
    for (const row of data) {
      const day = row.day || ''
      if (!byDay.has(day)) byDay.set(day, { day, pos: 0, online: 0 })
      const entry = byDay.get(day)!
      if (row.channel === 'pos') entry.pos += num(row.net_revenue)
      else if (row.channel === 'online') entry.online += num(row.net_revenue)
    }
    return Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day))
  }, [data])

  const totals = useMemo(() => {
    const orders = data.reduce((s, r) => s + (r.orders || 0), 0)
    const revenue = data.reduce((s, r) => s + num(r.revenue), 0)
    const discounts = data.reduce((s, r) => s + num(r.discounts), 0)
    const refunded = data.reduce((s, r) => s + num(r.refunded), 0)
    const netRevenue = data.reduce((s, r) => s + num(r.net_revenue), 0)
    const aov = orders > 0 ? netRevenue / orders : 0
    return { orders, revenue, discounts, refunded, netRevenue, aov }
  }, [data])

  const handleExport = () => {
    const headers = [
      t('reports.day'),
      t('reports.channel'),
      t('orders.table.total'),
      t('discounts.value'),
      t('reports.refunded'),
      t('reports.netRevenue'),
    ]
    const rows = data.map((r) => [
      r.day || '',
      r.channel === 'pos' ? t('dashboard.pos') : t('dashboard.online'),
      num(r.revenue),
      num(r.discounts),
      num(r.refunded),
      num(r.net_revenue),
    ])
    downloadCsv(`sales-${range.from}-to-${range.to}.csv`, buildCsv(headers, rows))
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" icon={Download} onClick={handleExport}>
          {t('reports.exportCsv')}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <TotalTile label={t('reports.orders')} value={formatNumber(totals.orders, locale)} />
        <TotalTile label={t('reports.grossRevenue')} value={formatMoney(totals.revenue, locale)} />
        <TotalTile label={t('reports.discounts')} value={formatMoney(totals.discounts, locale)} />
        <TotalTile label={t('reports.refunds')} value={formatMoney(totals.refunded, locale)} />
        <TotalTile label={t('reports.netRevenue')} value={formatMoney(totals.netRevenue, locale)} />
        <TotalTile label={t('dashboard.averageOrderValue')} value={formatMoney(totals.aov, locale)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.revenueChart')}</CardTitle>
        </CardHeader>
        <CardBody>
          {chartData.length === 0 ? (
            <p className="py-8 text-center text-sm text-moss">{t('reports.noData')}</p>
          ) : (
            <div className="-mx-6 h-80 w-full px-6">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 10, right: isRTL ? 10 : 30, left: isRTL ? 30 : 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E4D8C3" />
                  <XAxis dataKey="day" stroke="#7A6A55" reversed={isRTL} style={{ fontSize: 12 }} />
                  <YAxis
                    stroke="#7A6A55"
                    orientation={isRTL ? 'right' : 'left'}
                    style={{ fontSize: 12 }}
                    tickFormatter={(v) => formatNumber(v, locale)}
                  />
                  <Tooltip
                    formatter={(value: number) => formatMoney(value, locale)}
                    labelFormatter={(label) => label}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="pos"
                    name={t('dashboard.pos')}
                    stroke="#7A6A55"
                    fill="#7A6A55"
                    fillOpacity={0.25}
                  />
                  <Area
                    type="monotone"
                    dataKey="online"
                    name={t('dashboard.online')}
                    stroke="#3F2E22"
                    fill="#3F2E22"
                    fillOpacity={0.25}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

function TotalTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-sand bg-white p-3">
      <p className="text-xs text-moss">{label}</p>
      <p className="mt-1 text-lg font-semibold text-ink" dir="ltr">
        {value}
      </p>
    </div>
  )
}
