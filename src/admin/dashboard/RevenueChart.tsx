import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { Tabs } from '@/components/ui/Tabs'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatMoney, num } from '@/lib/money'
import { useLocale, useT } from '@/lib/i18n'
import type { Views } from '@/lib/supabase'

interface ChartTooltipEntry {
  name?: string
  value?: number
  color?: string
  dataKey?: string | number
  payload?: Record<string, unknown>
}

interface ChartTooltipProps {
  active?: boolean
  payload?: ChartTooltipEntry[]
  label?: string | number
}

interface RevenueChartProps {
  data: Views<'v_daily_sales'>[]
  loading?: boolean
}

// Module scope, same reasoning as ChannelTooltip in ChannelSplit.tsx.
function RevenueTooltip({
  active,
  payload,
  locale,
}: ChartTooltipProps & { locale: 'ar' | 'en' }): React.ReactNode {
  if (active && payload && payload.length) {
    const dayData = payload[0].payload as Record<string, string | number | undefined> | undefined
    return (
      <div className="rounded-lg border border-sand bg-white p-3 shadow-lg">
        <p className="text-sm font-medium text-ink">{dayData?.day}</p>
        {payload.map((entry: ChartTooltipEntry, idx: number) => (
          <p key={idx} style={{ color: entry.color }} className="text-sm">
            {entry.name}: {formatMoney(entry.value, locale)}
          </p>
        ))}
      </div>
    )
  }
  return null
}

export function RevenueChart({ data, loading = false }: RevenueChartProps) {
  const { locale, isRTL } = useLocale()
  const t = useT()

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.revenueChart')}</CardTitle>
        </CardHeader>
        <CardBody>
          <Skeleton className="h-96 w-full" />
        </CardBody>
      </Card>
    )
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.revenueChart')}</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-moss text-center py-8">{t('common.loading')}</p>
        </CardBody>
      </Card>
    )
  }

  // Group data by day and channel
  const groupedData = data.reduce((acc, row) => {
    const dayIndex = acc.findIndex((d) => d.day === row.day)
    if (dayIndex === -1) {
      acc.push({
        day: row.day || '',
        pos: row.channel === 'pos' ? num(row.net_revenue) : 0,
        online: row.channel === 'online' ? num(row.net_revenue) : 0,
      })
    } else {
      if (row.channel === 'pos') {
        acc[dayIndex].pos = num(row.net_revenue)
      } else if (row.channel === 'online') {
        acc[dayIndex].online = num(row.net_revenue)
      }
    }
    return acc
  }, [] as Array<{ day: string; pos: number; online: number }>)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('dashboard.revenueChart')}</CardTitle>
      </CardHeader>
      <CardBody>
        <div className="w-full h-96 -mx-6 px-6">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={groupedData}
              margin={{
                top: 10,
                right: isRTL ? 10 : 30,
                left: isRTL ? 30 : 10,
                bottom: 0,
              }}
            >
              <defs>
                <linearGradient id="colorPos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7A6A55" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#7A6A55" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorOnline" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3F2E22" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3F2E22" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E4D8C3" />
              <XAxis
                dataKey="day"
                stroke="#7A6A55"
                reversed={isRTL}
                style={{ fontSize: '12px' }}
              />
              <YAxis
                stroke="#7A6A55"
                orientation={isRTL ? 'right' : 'left'}
                style={{ fontSize: '12px' }}
              />
              <Tooltip content={<RevenueTooltip locale={locale} />} />
              <Legend />
              <Area
                type="monotone"
                dataKey="pos"
                stroke="#7A6A55"
                fillOpacity={1}
                fill="url(#colorPos)"
                name={t('dashboard.pos')}
              />
              <Area
                type="monotone"
                dataKey="online"
                stroke="#3F2E22"
                fillOpacity={1}
                fill="url(#colorOnline)"
                name={t('dashboard.online')}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardBody>
    </Card>
  )
}
