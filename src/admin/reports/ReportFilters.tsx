import { useMemo, useState } from 'react'
import { format, startOfMonth, endOfMonth, subMonths, subDays } from 'date-fns'
import { useT, useLocalized } from '@/lib/i18n'
import { Select, Input, Card, CardBody } from '@/components/ui'

export type DatePreset =
  | 'today'
  | 'last7'
  | 'last30'
  | 'thisMonth'
  | 'lastMonth'
  | 'custom'

export interface DateRange {
  preset: DatePreset
  from: string // yyyy-MM-dd
  to: string // yyyy-MM-dd
}

export type LocationOption = {
  id: string
  name_en: string
  name_ar: string
}

function rangeForPreset(preset: DatePreset, customFrom: string, customTo: string): {
  from: string
  to: string
} {
  const today = new Date()
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd')

  switch (preset) {
    case 'today':
      return { from: fmt(today), to: fmt(today) }
    case 'last7':
      return { from: fmt(subDays(today, 6)), to: fmt(today) }
    case 'last30':
      return { from: fmt(subDays(today, 29)), to: fmt(today) }
    case 'thisMonth':
      return { from: fmt(startOfMonth(today)), to: fmt(today) }
    case 'lastMonth': {
      const lastMonth = subMonths(today, 1)
      return { from: fmt(startOfMonth(lastMonth)), to: fmt(endOfMonth(lastMonth)) }
    }
    case 'custom':
      return { from: customFrom || fmt(subDays(today, 29)), to: customTo || fmt(today) }
  }
}

interface UseReportFiltersResult {
  range: DateRange
  setPreset: (p: DatePreset) => void
  setCustomFrom: (v: string) => void
  setCustomTo: (v: string) => void
  locationId: string
  setLocationId: (v: string) => void
}

export function useReportFilters(): UseReportFiltersResult {
  const [preset, setPresetState] = useState<DatePreset>('last30')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [locationId, setLocationId] = useState('')

  const { from, to } = rangeForPreset(preset, customFrom, customTo)

  const setPreset = (p: DatePreset) => setPresetState(p)

  return {
    range: { preset, from, to },
    setPreset,
    setCustomFrom,
    setCustomTo,
    locationId,
    setLocationId,
  }
}

interface ReportFiltersBarProps {
  filters: UseReportFiltersResult
  locations: LocationOption[]
}

export function ReportFiltersBar({ filters, locations }: ReportFiltersBarProps) {
  const t = useT()
  const getLocalized = useLocalized()
  const { range, setPreset, setCustomFrom, setCustomTo, locationId, setLocationId } = filters

  const presets: { id: DatePreset; label: string }[] = useMemo(
    () => [
      { id: 'today', label: t('reports.rangeToday') },
      { id: 'last7', label: t('reports.rangeLast7') },
      { id: 'last30', label: t('reports.rangeLast30') },
      { id: 'thisMonth', label: t('reports.rangeThisMonth') },
      { id: 'lastMonth', label: t('reports.rangeLastMonth') },
      { id: 'custom', label: t('reports.rangeCustom') },
    ],
    [t]
  )

  return (
    <Card>
      <CardBody>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              {t('orders.dateRange')}
            </label>
            <Select
              value={range.preset}
              onChange={(e) => setPreset(e.target.value as DatePreset)}
              className="w-40"
            >
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>

          {range.preset === 'custom' && (
            <>
              <Input
                label={t('orders.from')}
                type="date"
                value={range.from}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <Input
                label={t('orders.to')}
                type="date"
                value={range.to}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              {t('reports.branch')}
            </label>
            <Select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="w-44"
            >
              <option value="">{t('reports.allBranches')}</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {getLocalized(loc, 'name')}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </CardBody>
    </Card>
  )
}
