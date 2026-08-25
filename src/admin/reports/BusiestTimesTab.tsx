import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, type Views } from '@/lib/supabase'
import { useT, useLocale } from '@/lib/i18n'
import { formatMoney, num } from '@/lib/money'
import { Skeleton } from '@/components/ui'
import { Info } from 'lucide-react'

type HourRow = Views<'v_sales_by_hour'>

const DAY_KEYS = [
  'reports.sun',
  'reports.mon',
  'reports.tue',
  'reports.wed',
  'reports.thu',
  'reports.fri',
  'reports.sat',
] as const

export function BusiestTimesTab() {
  const t = useT()
  const { locale } = useLocale()

  const { data = [], isLoading } = useQuery({
    queryKey: ['reports', 'sales_by_hour'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_sales_by_hour').select('*')
      if (error) throw error
      return (data as HourRow[]) || []
    },
  })

  const grid = useMemo(() => {
    const cells = new Map<string, number>()
    let max = 0
    for (const row of data) {
      if (row.day_of_week === null || row.hour_of_day === null) continue
      const key = `${row.day_of_week}-${row.hour_of_day}`
      const revenue = num(row.revenue)
      cells.set(key, revenue)
      if (revenue > max) max = revenue
    }
    return { cells, max }
  }, [data])

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />
  }

  const hours = Array.from({ length: 24 }, (_, i) => i)

  const cellColor = (value: number) => {
    if (value <= 0 || grid.max === 0) return 'transparent'
    const intensity = Math.min(1, value / grid.max)
    return `rgba(26, 26, 24, ${0.08 + intensity * 0.72})`
  }

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 rounded-xl border border-sand bg-bone/50 p-3 text-xs text-moss">
        <Info className="h-4 w-4 shrink-0" />
        {t('reports.busiestAllTimeHint')}
      </p>

      <div className="overflow-x-auto rounded-xl border border-sand">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky start-0 bg-white px-2 py-1 text-start text-moss"></th>
              {hours.map((h) => (
                <th key={h} className="px-1 py-1 text-center font-normal text-moss" dir="ltr">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAY_KEYS.map((dayKey, dow) => (
              <tr key={dayKey}>
                <td className="sticky start-0 whitespace-nowrap bg-white px-2 py-1 font-medium text-ink">
                  {t(dayKey)}
                </td>
                {hours.map((h) => {
                  const value = grid.cells.get(`${dow}-${h}`) || 0
                  return (
                    <td
                      key={h}
                      title={value > 0 ? formatMoney(value, locale) : undefined}
                      style={{ backgroundColor: cellColor(value) }}
                      className="h-7 w-7 border border-sand/50"
                    />
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
