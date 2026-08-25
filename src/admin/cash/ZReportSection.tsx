import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, type Tables } from '@/lib/supabase'
import { useT, useLocale, useLocalized } from '@/lib/i18n'
import { formatMoney, num } from '@/lib/money'
import { Card, CardBody, CardHeader, CardTitle, Button, Input, Badge, Skeleton } from '@/components/ui'
import { Printer } from 'lucide-react'
import { format } from 'date-fns'
import { ar } from 'date-fns/locale'

type Shift = Tables<'shifts'>
type Movement = Tables<'cash_movements'>
type LocationOption = { id: string; name_en: string; name_ar: string }

interface ZReportSectionProps {
  locationId: string
  locations: LocationOption[]
}

export function ZReportSection({ locationId, locations }: ZReportSectionProps) {
  const t = useT()
  const { locale } = useLocale()
  const getLocalized = useLocalized()
  const [day, setDay] = useState(format(new Date(), 'yyyy-MM-dd'))

  const activeLocation = locations.find((l) => l.id === locationId)

  const { data, isLoading } = useQuery({
    queryKey: ['cash', 'zreport', locationId, day],
    queryFn: async () => {
      if (!locationId) return null

      const dayStart = `${day}T00:00:00`
      const dayEnd = `${day}T23:59:59`

      const { data: shifts, error: shiftsError } = await supabase
        .from('shifts')
        .select('*')
        .eq('location_id', locationId)
        .gte('opened_at', dayStart)
        .lte('opened_at', dayEnd)

      if (shiftsError) throw shiftsError
      const shiftRows = (shifts as Shift[]) || []
      if (shiftRows.length === 0) return { shifts: [], movements: [] as Movement[] }

      const { data: movements, error: movementsError } = await supabase
        .from('cash_movements')
        .select('*')
        .in(
          'shift_id',
          shiftRows.map((s) => s.id)
        )

      if (movementsError) throw movementsError
      return { shifts: shiftRows, movements: (movements as Movement[]) || [] }
    },
    enabled: !!locationId,
  })

  const summary = useMemo(() => {
    if (!data) return null
    const sum = (type: string) =>
      data.movements.filter((m) => m.type === type).reduce((s, m) => s + num(m.amount), 0)

    const openingFloat = data.shifts.reduce((s, sh) => s + num(sh.opening_float), 0)
    const cashSales = sum('sale')
    const refunds = sum('refund')
    const payIns = sum('pay_in')
    const payOuts = sum('pay_out')
    const expenses = sum('expense')
    const expectedClose = data.shifts.reduce((s, sh) => s + (num(sh.expected_cash) || 0), 0)
    const counted = data.shifts
      .filter((sh) => sh.status === 'closed')
      .reduce((s, sh) => s + num(sh.counted_cash), 0)
    const allClosed = data.shifts.every((sh) => sh.status === 'closed')
    const variance = allClosed ? counted - expectedClose : null

    return {
      openingFloat,
      cashSales,
      refunds,
      payIns,
      payOuts,
      expenses,
      expectedClose,
      counted,
      variance,
      allClosed,
    }
  }, [data])

  const varianceTone = (v: number) => {
    if (v === 0) return 'success'
    if (Math.abs(v) < 50) return 'warning'
    return 'danger'
  }

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-4">
        <CardTitle>{t('cash.zReport')}</CardTitle>
        <div className="flex items-end gap-3 print:hidden">
          <Input
            label={t('cash.date')}
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
          <Button
            size="sm"
            variant="secondary"
            icon={Printer}
            onClick={() => window.print()}
            disabled={!summary}
          >
            {t('cash.print')}
          </Button>
        </div>
      </CardHeader>
      <CardBody>
        {!locationId ? (
          <p className="text-center text-sm text-moss">{t('cash.pickBranch')}</p>
        ) : isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : !summary || data?.shifts.length === 0 ? (
          <p className="text-center text-sm text-moss">{t('cash.zReportEmpty')}</p>
        ) : (
          <div id="z-report-print" className="print-area space-y-3">
            <div className="mb-2 text-sm text-moss">
              {activeLocation ? getLocalized(activeLocation, 'name') : ''} —{' '}
              <span dir="ltr">
                {format(new Date(day), 'd MMMM yyyy', { locale: locale === 'ar' ? ar : undefined })}
              </span>
            </div>
            <ZLine label={t('cash.openingFloatTotal')} value={formatMoney(summary.openingFloat, locale)} />
            <ZLine label={t('cash.cashSales')} value={formatMoney(summary.cashSales, locale)} />
            <ZLine label={t('cash.refunds')} value={formatMoney(summary.refunds, locale)} />
            <ZLine label={t('cash.payIn')} value={formatMoney(summary.payIns, locale)} />
            <ZLine label={t('cash.payOut')} value={formatMoney(summary.payOuts, locale)} />
            <ZLine label={t('cash.expenses')} value={formatMoney(summary.expenses, locale)} />
            <ZLine label={t('cash.expectedClose')} value={formatMoney(summary.expectedClose, locale)} bold />
            <ZLine
              label={t('pos.countedCash')}
              value={summary.allClosed ? formatMoney(summary.counted, locale) : t('cash.stillOpen')}
              bold
            />
            {summary.variance !== null && (
              <div className="flex items-center justify-between border-t border-sand pt-2">
                <span className="text-sm font-medium text-ink">{t('pos.variance')}</span>
                <Badge tone={varianceTone(summary.variance)}>
                  {formatMoney(summary.variance, locale)}
                </Badge>
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function ZLine({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-moss">{label}</span>
      <span dir="ltr" className={bold ? 'font-semibold text-ink' : 'text-ink'}>
        {value}
      </span>
    </div>
  )
}
