import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useT, useLocale } from '@/lib/i18n'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { useErrorText } from '@/lib/errors'
import { useAuth, useCan } from '@/lib/auth'
import { formatMoney, num } from '@/lib/money'
import { toast } from 'sonner'
import { Tabs } from '@/components/ui/Tabs'
import { KPITile } from '@/admin/dashboard/KPITile'
import { RevenueChart } from '@/admin/dashboard/RevenueChart'
import { ChannelSplit } from '@/admin/dashboard/ChannelSplit'
import { LowStockWidget } from '@/admin/dashboard/LowStockWidget'
import { RecentOrdersWidget } from '@/admin/dashboard/RecentOrdersWidget'
import { TopProductsWidget } from '@/admin/dashboard/TopProductsWidget'
import { OpenShiftWidget } from '@/admin/dashboard/OpenShiftWidget'
import { subDays, format } from 'date-fns'
import type { Tables } from '@/lib/supabase'

type ShiftWithProfile = Tables<'shifts'> & { profiles: { full_name: string | null } | null }

export function DashboardPage() {
  const t = useT()
  useDocumentTitle(t('nav.dashboard'))
  const errorText = useErrorText()
  const { locale } = useLocale()
  const { profile } = useAuth()
  const can = useCan()
  const [dateRange, setDateRange] = useState<'14' | '30' | '90'>('30')

  // Build date range
  const endDate = new Date()
  const startDate = subDays(endDate, parseInt(dateRange))
  const formattedStart = format(startDate, 'yyyy-MM-dd')
  const formattedEnd = format(endDate, 'yyyy-MM-dd')
  const yesterdayStart = format(subDays(startDate, 1), 'yyyy-MM-dd')

  // Fetch today's sales
  const { data: todayData = [], isLoading: todayLoading } = useQuery({
    queryKey: ['dashboard', 'today', locale],
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd')
      const { data, error } = await supabase
        .from('v_daily_sales')
        .select('*')
        .eq('day', today)

      if (error) {
        toast.error(errorText(error))
        throw error
      }

      return data || []
    },
  })

  // Fetch yesterday's sales for comparison
  const { data: yesterdayData = [] } = useQuery({
    queryKey: ['dashboard', 'yesterday'],
    queryFn: async () => {
      const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')
      const { data, error } = await supabase
        .from('v_daily_sales')
        .select('*')
        .eq('day', yesterday)

      if (error) throw error
      return data || []
    },
  })

  // Fetch range data for chart
  const { data: rangeData = [], isLoading: rangeLoading } = useQuery({
    queryKey: ['dashboard', 'range', dateRange],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_daily_sales')
        .select('*')
        .gte('day', formattedStart)
        .lte('day', formattedEnd)

      if (error) throw error
      return data || []
    },
  })

  // Fetch low stock
  const { data: lowStockData = [], isLoading: lowStockLoading } = useQuery({
    queryKey: ['dashboard', 'low_stock'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_low_stock')
        .select('*')
        .order('available', { ascending: true })
        .limit(8)

      if (error) throw error
      return data || []
    },
  })

  // Fetch recent orders
  const { data: recentOrders = [], isLoading: recentOrdersLoading } = useQuery({
    queryKey: ['dashboard', 'recent_orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('placed_at', { ascending: false })
        .limit(8)

      if (error) throw error
      return data || []
    },
  })

  // Fetch top products
  const { data: topProductsData = [], isLoading: topProductsLoading } = useQuery({
    queryKey: ['dashboard', 'top_products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_product_performance')
        .select('*')
        .order('units_sold', { ascending: false })
        .limit(5)

      if (error) throw error
      return data || []
    },
  })

  // Fetch open shift
  const { data: openShift = null, isLoading: openShiftLoading } = useQuery({
    queryKey: ['dashboard', 'open_shift', profile?.location_id],
    queryFn: async () => {
      if (!profile?.location_id) return null

      const { data, error } = await supabase
        .from('shifts')
        .select('*, profiles!shifts_opened_by_fkey(full_name)')
        .eq('location_id', profile.location_id)
        .eq('status', 'open')
        .single()

      if (error && error.code !== 'PGRST116') throw error
      if (!data) return null

      const shiftData = data as ShiftWithProfile
      return {
        ...shiftData,
        opened_by_name: shiftData.profiles?.full_name,
      } as Tables<'shifts'> & { opened_by_name?: string }
    },
  })

  // Fetch expected cash for open shift
  const { data: expectedCash } = useQuery({
    queryKey: ['dashboard', 'expected_cash', openShift?.id],
    queryFn: async () => {
      if (!openShift?.id) return undefined

      const { data, error } = await supabase.rpc('shift_expected_cash', {
        p_shift_id: openShift.id,
      })

      if (error) throw error
      return data
    },
    enabled: !!openShift?.id,
  })

  // Calculate KPIs
  const todayRevenue = useMemo(() => {
    return todayData.reduce((sum, row) => sum + num(row.net_revenue), 0)
  }, [todayData])

  const yesterdayRevenue = useMemo(() => {
    return yesterdayData.reduce((sum, row) => sum + num(row.net_revenue), 0)
  }, [yesterdayData])

  const revenueChange = yesterdayRevenue !== 0
    ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100
    : todayRevenue > 0 ? 100 : 0

  const todayOrders = todayData.reduce((sum, row) => sum + (row.orders || 0), 0)
  const yesterdayOrders = yesterdayData.reduce((sum, row) => sum + (row.orders || 0), 0)
  const ordersChange = yesterdayOrders !== 0
    ? ((todayOrders - yesterdayOrders) / yesterdayOrders) * 100
    : todayOrders > 0 ? 100 : 0

  const todayAOV = todayOrders > 0 ? todayRevenue / todayOrders : 0
  const yesterdayAOV = yesterdayOrders > 0 ? yesterdayRevenue / yesterdayOrders : 0
  const aovChange = yesterdayAOV !== 0
    ? ((todayAOV - yesterdayAOV) / yesterdayAOV) * 100
    : todayAOV > 0 ? 100 : 0

  // For items sold, we need to sum order_items quantities
  const getTodayItemsSold = () => {
    // This would require a separate query or calculation
    // For now, return a placeholder - in a full implementation,
    // this would come from a view or calculation
    return 0
  }

  // Only show dashboard if user has reports permission or is staff
  if (!can('reports') && !profile) {
    return null
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-display text-ink mb-2">{t('nav.dashboard')}</h1>
        <p className="text-moss">{t('page.dashboardDescription')}</p>
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPITile
          label={t('dashboard.todayRevenue')}
          value={todayRevenue}
          change={revenueChange}
          isMoney
          loading={todayLoading}
          compact
        />
        <KPITile
          label={t('dashboard.orderCount')}
          value={todayOrders}
          change={ordersChange}
          isMoney={false}
          loading={todayLoading}
        />
        <KPITile
          label={t('dashboard.averageOrderValue')}
          value={todayAOV}
          change={aovChange}
          isMoney
          loading={todayLoading}
        />
        <KPITile
          label={t('dashboard.itemsSold')}
          value={getTodayItemsSold()}
          change={undefined}
          isMoney={false}
          loading={todayLoading}
        />
      </div>

      {/* Revenue Chart with date range tabs */}
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Tabs
            active={dateRange}
            onChange={(id) => setDateRange(id as '14' | '30' | '90')}
            tabs={[
              { id: '14', label: t('dashboard.last14Days') },
              { id: '30', label: t('dashboard.last30Days') },
              { id: '90', label: t('dashboard.last90Days') },
            ]}
          />
        </div>
        <RevenueChart data={rangeData} loading={rangeLoading} />
      </div>

      {/* Channel Split and Low Stock */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChannelSplit data={rangeData} loading={rangeLoading} />
        <LowStockWidget data={lowStockData} loading={lowStockLoading} />
      </div>

      {/* Recent Orders and Top Products */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RecentOrdersWidget data={recentOrders} loading={recentOrdersLoading} />
        <TopProductsWidget data={topProductsData} loading={topProductsLoading} />
      </div>

      {/* Open Shift */}
      <OpenShiftWidget
        shift={openShift}
        expectedCash={expectedCash}
        loading={openShiftLoading}
      />
    </div>
  )
}
