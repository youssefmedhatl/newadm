import { useMemo, useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, type Views } from '@/lib/supabase'
import { useT, useLocale, useLocalized } from '@/lib/i18n'
import { formatMoney, formatNumber, formatPercent, num } from '@/lib/money'
import {
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  Button,
  Skeleton,
  EmptyState,
} from '@/components/ui'
import { Download, PackageSearch, Info, ArrowUp, ArrowDown } from 'lucide-react'
import { buildCsv, downloadCsv } from './csv'

type ProductPerf = Views<'v_product_performance'>
type SortKey = 'units_sold' | 'revenue' | 'cost' | 'profit' | 'margin' | 'units_returned'

export function ProductsTab() {
  const t = useT()
  const { locale } = useLocale()
  const getLocalized = useLocalized()
  const [sortKey, setSortKey] = useState<SortKey>('revenue')
  const [sortDesc, setSortDesc] = useState(true)

  const { data = [], isLoading } = useQuery({
    queryKey: ['reports', 'products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_product_performance').select('*')
      if (error) throw error
      return (data as ProductPerf[]) || []
    },
  })

  const withMargin = useMemo(
    () =>
      data.map((row) => {
        const revenue = num(row.revenue)
        const profit = num(row.profit)
        const margin = revenue > 0 ? (profit / revenue) * 100 : 0
        return { ...row, margin }
      }),
    [data]
  )

  const zeroCostCount = data.filter((row) => num(row.cost) === 0 && (row.units_sold || 0) > 0).length

  const sortValue = useCallback(
    (row: ProductPerf & { margin: number }): number => {
      switch (sortKey) {
        case 'margin':
          return row.margin
        case 'units_sold':
          return row.units_sold || 0
        case 'units_returned':
          return row.units_returned || 0
        case 'revenue':
          return num(row.revenue)
        case 'cost':
          return num(row.cost)
        case 'profit':
          return num(row.profit)
      }
    },
    [sortKey]
  )

  const sorted = useMemo(() => {
    const copy = [...withMargin]
    copy.sort((a, b) => {
      const av = sortValue(a)
      const bv = sortValue(b)
      return sortDesc ? bv - av : av - bv
    })
    return copy
  }, [withMargin, sortDesc, sortValue])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDesc((d) => !d)
    else {
      setSortKey(key)
      setSortDesc(true)
    }
  }

  const handleExport = () => {
    const headers = [
      t('orderDetail.product'),
      t('reports.unitsSold'),
      t('orderDetail.lineTotal'),
      t('reports.cost'),
      t('reports.profit'),
      t('reports.margin'),
      t('orderDetail.returned'),
    ]
    const rows = sorted.map((row) => [
      getLocalized(row, 'name'),
      row.units_sold || 0,
      num(row.revenue),
      num(row.cost),
      num(row.profit),
      row.margin.toFixed(1),
      row.units_returned || 0,
    ])
    downloadCsv('products-performance.csv', buildCsv(headers, rows))
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  const sortHeader = (label: string, sortField: SortKey) => (
    <TH className="cursor-pointer select-none text-end" onClick={() => toggleSort(sortField)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === sortField &&
          (sortDesc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
      </span>
    </TH>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-sand bg-bone/50 p-3">
        <p className="flex items-center gap-2 text-xs text-moss">
          <Info className="h-4 w-4 shrink-0" />
          {t('reports.productsAllTimeHint')}
          {zeroCostCount > 0 && ` ${t('reports.costZeroHint', { count: zeroCostCount })}`}
        </p>
        <Button variant="secondary" size="sm" icon={Download} onClick={handleExport}>
          {t('reports.exportCsv')}
        </Button>
      </div>

      {sorted.length === 0 ? (
        <EmptyState icon={PackageSearch} title={t('reports.noData')} />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{t('orderDetail.product')}</TH>
              {sortHeader(t('reports.unitsSold'), 'units_sold')}
              {sortHeader(t('orderDetail.lineTotal'), 'revenue')}
              {sortHeader(t('reports.cost'), 'cost')}
              {sortHeader(t('reports.profit'), 'profit')}
              {sortHeader(t('reports.margin'), 'margin')}
              {sortHeader(t('orderDetail.returned'), 'units_returned')}
            </TR>
          </THead>
          <TBody>
            {sorted.map((row) => {
              const negative = row.margin < 0
              return (
                <TR key={row.product_id} className={negative ? 'bg-danger/10' : undefined}>
                  <TD className="font-medium">
                    {getLocalized(row, 'name')}
                  </TD>
                  <TD className="text-end" dir="ltr">
                    {formatNumber(row.units_sold, locale)}
                  </TD>
                  <TD className="text-end" dir="ltr">
                    {formatMoney(row.revenue, locale)}
                  </TD>
                  <TD className="text-end" dir="ltr">
                    {formatMoney(row.cost, locale)}
                  </TD>
                  <TD className={negative ? 'text-end text-danger font-medium' : 'text-end'} dir="ltr">
                    {formatMoney(row.profit, locale)}
                  </TD>
                  <TD className={negative ? 'text-end text-danger font-medium' : 'text-end'} dir="ltr">
                    {formatPercent(row.margin / 100, locale)}
                  </TD>
                  <TD className="text-end" dir="ltr">
                    {formatNumber(row.units_returned, locale)}
                  </TD>
                </TR>
              )
            })}
          </TBody>
        </Table>
      )}
    </div>
  )
}
