import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, type Views } from '@/lib/supabase'
import { useT, useLocale } from '@/lib/i18n'
import { formatMoney, formatNumber, num } from '@/lib/money'
import { Table, THead, TBody, TR, TH, TD, EmptyState, Skeleton, Button } from '@/components/ui'
import { Trophy, Download, Info } from 'lucide-react'
import { buildCsv, downloadCsv } from './csv'
import type { DateRange } from './ReportFilters'

type StaffSales = Views<'v_staff_sales'>

interface StaffTabProps {
  range: DateRange
}

export function StaffTab({ range }: StaffTabProps) {
  const t = useT()
  const { locale } = useLocale()

  const { data = [], isLoading } = useQuery({
    queryKey: ['reports', 'staff_sales', range.from, range.to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_staff_sales')
        .select('*')
        .gte('day', range.from)
        .lte('day', range.to)
      if (error) throw error
      return (data as StaffSales[]) || []
    },
  })

  const byStaff = useMemo(() => {
    const map = new Map<string, { name: string; orders: number; revenue: number }>()
    for (const row of data) {
      const key = row.cashier_id || 'unknown'
      const name = row.cashier_name || t('staff.auditSystem')
      if (!map.has(key)) map.set(key, { name, orders: 0, revenue: 0 })
      const entry = map.get(key)!
      entry.orders += row.orders || 0
      entry.revenue += num(row.revenue)
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue)
  }, [data, t])

  const handleExport = () => {
    const headers = [t('staff.name'), t('reports.orders'), t('orderDetail.lineTotal'), t('reports.avgSale')]
    const rows = byStaff.map((s) => [
      s.name,
      s.orders,
      s.revenue,
      s.orders > 0 ? s.revenue / s.orders : 0,
    ])
    downloadCsv(`staff-performance-${range.from}-to-${range.to}.csv`, buildCsv(headers, rows))
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-sand bg-bone/50 p-3">
        <p className="flex items-center gap-2 text-xs text-moss">
          <Info className="h-4 w-4 shrink-0" />
          {t('reports.staffNoBranchHint')}
        </p>
        <Button variant="secondary" size="sm" icon={Download} onClick={handleExport}>
          {t('reports.exportCsv')}
        </Button>
      </div>

      {byStaff.length === 0 ? (
        <EmptyState icon={Trophy} title={t('reports.noData')} />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{t('staff.name')}</TH>
              <TH className="text-end">{t('reports.orders')}</TH>
              <TH className="text-end">{t('orderDetail.lineTotal')}</TH>
              <TH className="text-end">{t('reports.avgSale')}</TH>
            </TR>
          </THead>
          <TBody>
            {byStaff.map((s, i) => (
              <TR key={`${s.name}-${i}`}>
                <TD className="font-medium">
                  {i === 0 && <Trophy className="me-1 inline h-4 w-4 text-warning" />}
                  {s.name}
                </TD>
                <TD className="text-end" dir="ltr">
                  {formatNumber(s.orders, locale)}
                </TD>
                <TD className="text-end" dir="ltr">
                  {formatMoney(s.revenue, locale)}
                </TD>
                <TD className="text-end" dir="ltr">
                  {formatMoney(s.orders > 0 ? s.revenue / s.orders : 0, locale)}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  )
}
