import { Fragment, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, type Tables } from '@/lib/supabase'
import { useT, useLocale, useLocalized } from '@/lib/i18n'
import { useErrorText } from '@/lib/errors'
import { formatMoney, num } from '@/lib/money'
import { toast } from 'sonner'
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  Badge,
  EmptyState,
  Skeleton,
  Pagination,
} from '@/components/ui'
import { History, ChevronDown, ChevronUp } from 'lucide-react'
import { format } from 'date-fns'
import { ar } from 'date-fns/locale'

const PER_PAGE = 20

type ShiftRow = Tables<'shifts'> & {
  locations: { name_en: string; name_ar: string } | null
  opened_by_profile: { full_name: string | null } | null
  closed_by_profile: { full_name: string | null } | null
}
type Movement = Tables<'cash_movements'>

interface ShiftHistoryListProps {
  locationId: string
}

export function ShiftHistoryList({ locationId }: ShiftHistoryListProps) {
  const t = useT()
  const errorText = useErrorText()
  const { locale } = useLocale()
  const getLocalized = useLocalized()
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data: result = { data: [], count: 0 }, isLoading } = useQuery({
    queryKey: ['cash', 'shift_history', locationId, page],
    queryFn: async () => {
      let query = supabase
        .from('shifts')
        .select(
          `*, locations(name_en, name_ar),
           opened_by_profile:profiles!shifts_opened_by_fkey(full_name),
           closed_by_profile:profiles!shifts_closed_by_fkey(full_name)`,
          { count: 'exact' }
        )
        .eq('status', 'closed')

      if (locationId) query = query.eq('location_id', locationId)

      const { data, error, count } = await query
        .order('closed_at', { ascending: false })
        .range((page - 1) * PER_PAGE, page * PER_PAGE - 1)

      if (error) {
        toast.error(errorText(error))
        throw error
      }
      return { data: (data as unknown as ShiftRow[]) || [], count: count || 0 }
    },
  })

  const totalPages = Math.ceil((result.count || 0) / PER_PAGE)

  const varianceTone = (v: number | null) => {
    if (v === null) return 'neutral'
    if (v === 0) return 'success'
    if (Math.abs(v) < 50) return 'warning'
    return 'danger'
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-4 w-4" /> {t('cash.shiftHistory')}
        </CardTitle>
      </CardHeader>
      <CardBody className="p-0">
        {isLoading ? (
          <div className="space-y-3 p-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : result.data.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={History} title={t('cash.noShiftHistory')} />
          </div>
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>{t('reports.branch')}</TH>
                  <TH>{t('cash.openedBy')}</TH>
                  <TH>{t('cash.closedBy')}</TH>
                  <TH className="text-end">{t('pos.openingFloat')}</TH>
                  <TH className="text-end">{t('pos.expectedCash')}</TH>
                  <TH className="text-end">{t('pos.countedCash')}</TH>
                  <TH className="text-end">{t('pos.variance')}</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {result.data.map((s) => (
                  <Fragment key={s.id}>
                    <TR
                      onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                      className="cursor-pointer hover:bg-sand/40"
                    >
                      <TD>{s.locations ? getLocalized(s.locations, 'name') : '—'}</TD>
                      <TD className="text-sm">
                        {s.opened_by_profile?.full_name || '—'}
                        <p className="text-xs text-moss">
                          {format(new Date(s.opened_at), 'd MMM HH:mm', {
                            locale: locale === 'ar' ? ar : undefined,
                          })}
                        </p>
                      </TD>
                      <TD className="text-sm">
                        {s.closed_by_profile?.full_name || '—'}
                        <p className="text-xs text-moss">
                          {s.closed_at
                            ? format(new Date(s.closed_at), 'd MMM HH:mm', {
                                locale: locale === 'ar' ? ar : undefined,
                              })
                            : '—'}
                        </p>
                      </TD>
                      <TD className="text-end" dir="ltr">
                        {formatMoney(s.opening_float, locale)}
                      </TD>
                      <TD className="text-end" dir="ltr">
                        {s.expected_cash !== null ? formatMoney(s.expected_cash, locale) : '—'}
                      </TD>
                      <TD className="text-end" dir="ltr">
                        {s.counted_cash !== null ? formatMoney(s.counted_cash, locale) : '—'}
                      </TD>
                      <TD className="text-end">
                        <Badge tone={varianceTone(s.variance)}>
                          {s.variance !== null ? formatMoney(s.variance, locale) : '—'}
                        </Badge>
                      </TD>
                      <TD>
                        {expanded === s.id ? (
                          <ChevronUp className="h-4 w-4 text-moss" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-moss" />
                        )}
                      </TD>
                    </TR>
                    {expanded === s.id && <ShiftLedgerRow shiftId={s.id} />}
                  </Fragment>
                ))}
              </TBody>
            </Table>
            {totalPages > 1 && (
              <div className="flex items-center justify-center border-t border-sand p-4">
                <Pagination page={page} pageCount={totalPages} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  )
}

function ShiftLedgerRow({ shiftId }: { shiftId: string }) {
  const t = useT()
  const { locale } = useLocale()

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ['cash', 'ledger', shiftId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_movements')
        .select('*, orders(order_number)')
        .eq('shift_id', shiftId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data as unknown as (Movement & { orders: { order_number: string } | null })[]) || []
    },
  })

  return (
    <TR>
      <TD colSpan={8} className="bg-bone/50">
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : movements.length === 0 ? (
          <p className="py-2 text-sm text-moss">{t('cash.noMovements')}</p>
        ) : (
          <div className="divide-y divide-sand">
            {movements.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <Badge tone="neutral">{t(`cash.movementType_${m.type}`)}</Badge>
                <span className="flex-1 text-moss">
                  {m.reason || (m.orders ? `#${m.orders.order_number}` : '—')}
                </span>
                <span className="text-xs text-moss">
                  {format(new Date(m.created_at), 'HH:mm', {
                    locale: locale === 'ar' ? ar : undefined,
                  })}
                </span>
                <span
                  dir="ltr"
                  className={num(m.amount) >= 0 ? 'font-medium text-success' : 'font-medium text-danger'}
                >
                  {formatMoney(m.amount, locale)}
                </span>
              </div>
            ))}
          </div>
        )}
      </TD>
    </TR>
  )
}
