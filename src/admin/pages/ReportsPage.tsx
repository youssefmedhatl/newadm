import { useState, lazy, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { useCan } from '@/lib/auth'
import { Card, CardBody, Tabs, Spinner } from '@/components/ui'
import { useReportFilters, ReportFiltersBar, type LocationOption } from '@/admin/reports/ReportFilters'

// The five report tabs each pull in their own queries and chart code, and only
// one is ever on screen. They load on demand.
const SalesTab = lazy(() => import('@/admin/reports/SalesTab').then((m) => ({ default: m.SalesTab })))
const ProductsTab = lazy(() => import('@/admin/reports/ProductsTab').then((m) => ({ default: m.ProductsTab })))
const BusiestTimesTab = lazy(() => import('@/admin/reports/BusiestTimesTab').then((m) => ({ default: m.BusiestTimesTab })))
const StaffTab = lazy(() => import('@/admin/reports/StaffTab').then((m) => ({ default: m.StaffTab })))
const InventoryTab = lazy(() => import('@/admin/reports/InventoryTab').then((m) => ({ default: m.InventoryTab })))

type TabId = 'sales' | 'products' | 'busiest' | 'staff' | 'inventory'

export function ReportsPage() {
  const t = useT()
  useDocumentTitle(t('nav.reports'))
  const can = useCan()
  const allowed = can('reports')

  const [activeTab, setActiveTab] = useState<TabId>('sales')
  const filters = useReportFilters()

  const { data: locations = [] } = useQuery({
    queryKey: ['locations', 'all'],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('locations')
        .select('id, name_en, name_ar')
        .eq('is_active', true)
        .order('position')
      if (error) return []
      return (data as LocationOption[]) || []
    },
  })

  // Rule 1: guard after every hook.
  if (!allowed) {
    return (
      <div className="space-y-6 p-6">
        <h1 className="text-3xl font-display text-ink mb-2">{t('nav.reports')}</h1>
        <Card>
          <CardBody>
            <p className="text-center text-moss">{t('error.notAuthorised')}</p>
          </CardBody>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-display text-ink mb-2">{t('nav.reports')}</h1>
        <p className="text-moss">{t('page.reportsDescription')}</p>
      </div>

      <ReportFiltersBar filters={filters} locations={locations} />

      <Tabs
        active={activeTab}
        onChange={(id) => setActiveTab(id as TabId)}
        tabs={[
          { id: 'sales', label: t('reports.tabSales') },
          { id: 'products', label: t('reports.tabProducts') },
          { id: 'busiest', label: t('reports.tabBusiest') },
          { id: 'staff', label: t('reports.tabStaff') },
          { id: 'inventory', label: t('reports.tabInventory') },
        ]}
      />

      <Suspense
        fallback={
          <div className="flex min-h-[40vh] items-center justify-center">
            <Spinner />
          </div>
        }
      >
        {activeTab === 'sales' && (
          <SalesTab range={filters.range} locationId={filters.locationId} />
        )}
        {activeTab === 'products' && <ProductsTab />}
        {activeTab === 'busiest' && <BusiestTimesTab />}
        {activeTab === 'staff' && <StaffTab range={filters.range} />}
        {activeTab === 'inventory' && <InventoryTab locationId={filters.locationId} />}
      </Suspense>
    </div>
  )
}
