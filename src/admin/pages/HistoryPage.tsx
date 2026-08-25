import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase, type Enums } from '@/lib/supabase'
import { useT, useLocale } from '@/lib/i18n'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { useErrorText } from '@/lib/errors'
import { useAuth, useCan } from '@/lib/auth'
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
  SearchInput,
  Select,
  Input,
  Pagination,
  EmptyState,
  Skeleton,
} from '@/components/ui'
import { ShoppingBag } from 'lucide-react'
import { format } from 'date-fns'

const ITEMS_PER_PAGE = 25

// History shows finished orders — the inverse of the active queue on the
// Orders page.
const PAST_STATUSES: Enums<'order_status'>[] = ['completed', 'cancelled']

export function HistoryPage() {
  const navigate = useNavigate()
  const t = useT()
  useDocumentTitle(t('nav.history'))
  const errorText = useErrorText()
  const { locale, isRTL } = useLocale()
  const { profile } = useAuth()
  const can = useCan()

  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<Enums<'order_status'> | ''>('')
  const [channelFilter, setChannelFilter] = useState<Enums<'order_channel'> | ''>('')
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<Enums<'payment_status'> | ''>('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  // Sanitize search term
  const sanitizedSearch = useMemo(() => {
    return searchTerm.replace(/[,()."\\%_*]/g, '').trim()
  }, [searchTerm])

  // Build filters
  const buildFilters = () => {
    let query = supabase
      .from('orders')
      .select('*', { count: 'exact' })

    // Status filter — History only ever shows finished orders. A specific
    // status narrows it further; otherwise show both completed and cancelled.
    if (statusFilter) {
      query = query.eq('status', statusFilter)
    } else {
      query = query.in('status', PAST_STATUSES)
    }

    // Channel filter
    if (channelFilter) {
      query = query.eq('channel', channelFilter)
    }

    // Payment status filter
    if (paymentStatusFilter) {
      query = query.eq('payment_status', paymentStatusFilter)
    }

    // Date range
    if (fromDate) {
      query = query.gte('placed_at', `${fromDate}T00:00:00Z`)
    }
    if (toDate) {
      query = query.lte('placed_at', `${toDate}T23:59:59Z`)
    }

    // Search filter - order number, phone, or contact name
    if (sanitizedSearch) {
      query = query.or(
        `order_number.ilike.%${sanitizedSearch}%,contact_phone.ilike.%${sanitizedSearch}%,contact_name.ilike.%${sanitizedSearch}%`
      )
    }

    return query
  }

  // Fetch order history
  const { data: result = { data: [], count: 0 }, isLoading, error } = useQuery({
    queryKey: [
      'orderHistory',
      page,
      statusFilter,
      channelFilter,
      paymentStatusFilter,
      fromDate,
      toDate,
      sanitizedSearch,
    ],
    queryFn: async () => {
      const query = buildFilters()
        .order('placed_at', { ascending: false })
        .range((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE - 1)

      const { data, error, count } = await query

      if (error) {
        toast.error(errorText(error))
        throw error
      }

      return {
        data: data || [],
        count: count || 0,
      }
    },
  })

  if (error) {
    return (
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-3xl font-display text-ink mb-2">{t('history.title')}</h1>
          <p className="text-moss">{t('page.historyDescription')}</p>
        </div>
        <Card>
          <CardBody>
            <p className="text-center text-moss">{t('common.error')}</p>
          </CardBody>
        </Card>
      </div>
    )
  }

  const totalPages = Math.ceil((result.count || 0) / ITEMS_PER_PAGE)

  const getStatusBadgeTone = (status: string) => {
    if (status === 'completed') return 'success'
    if (status === 'cancelled') return 'danger'
    if (status === 'pending') return 'warning'
    return 'neutral'
  }

  const getPaymentBadgeTone = (status: string) => {
    if (status === 'paid') return 'success'
    if (status === 'refunded' || status === 'partially_refunded') return 'danger'
    return 'warning'
  }

  const canViewOrders = can('orders')

  if (!canViewOrders) {
    return null
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-display text-ink mb-2">{t('history.title')}</h1>
        <p className="text-moss">{t('page.historyDescription')}</p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>{t('orders.filters')}</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            <SearchInput
              value={searchTerm}
              onValueChange={(value) => {
                setSearchTerm(value)
                setPage(1)
              }}
              placeholder={t('orders.search')}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Select
                label={t('orders.status')}
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as Enums<'order_status'> | '')
                  setPage(1)
                }}
              >
                <option value="">{t('common.all')}</option>
                <option value="completed">{t('status.completed')}</option>
                <option value="cancelled">{t('status.cancelled')}</option>
              </Select>

              <Select
                label={t('orders.channel')}
                value={channelFilter}
                onChange={(e) => {
                  setChannelFilter(e.target.value as Enums<'order_channel'> | '')
                  setPage(1)
                }}
              >
                <option value="">{t('common.all')}</option>
                <option value="pos">{t('dashboard.pos')}</option>
                <option value="online">{t('dashboard.online')}</option>
              </Select>

              <Select
                label={t('orders.paymentStatus')}
                value={paymentStatusFilter}
                onChange={(e) => {
                  setPaymentStatusFilter(e.target.value as Enums<'payment_status'> | '')
                  setPage(1)
                }}
              >
                <option value="">{t('common.all')}</option>
                <option value="unpaid">{t('paymentStatus.unpaid')}</option>
                <option value="paid">{t('paymentStatus.paid')}</option>
                <option value="partially_refunded">{t('paymentStatus.partially_refunded')}</option>
                <option value="refunded">{t('paymentStatus.refunded')}</option>
              </Select>

              <Input
                label={t('orders.from')}
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value)
                  setPage(1)
                }}
              />

              <Input
                label={t('orders.to')}
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value)
                  setPage(1)
                }}
              />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : result.data.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={ShoppingBag}
                title={t('orders.noResults')}
                description=""
              />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <TR>
                      <TH>{t('orders.table.number')}</TH>
                      <TH>{t('orders.table.date')}</TH>
                      <TH>{t('orders.table.customer')}</TH>
                      <TH>{t('orders.table.channel')}</TH>
                      <TH>{t('orders.table.status')}</TH>
                      <TH>{t('orders.table.payment')}</TH>
                      <TH>{t('orders.table.total')}</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {result.data.map((order) => (
                      <TR
                        key={order.id}
                        onClick={() => navigate(`/admin/orders/${order.id}`)}
                        className="cursor-pointer hover:bg-sand transition-colors"
                      >
                        <TD>
                          <span dir="ltr" className="font-medium">
                            {order.order_number}
                          </span>
                        </TD>
                        <TD className="text-sm">
                          {format(new Date(order.placed_at), 'd MMM yyyy')}
                        </TD>
                        <TD className="text-sm">
                          {order.contact_name || 'Guest'}
                        </TD>
                        <TD>
                          <Badge tone="neutral">
                            {order.channel === 'pos' ? t('dashboard.pos') : t('dashboard.online')}
                          </Badge>
                        </TD>
                        <TD>
                          <Badge tone={getStatusBadgeTone(order.status)}>
                            {t(`status.${order.status}`)}
                          </Badge>
                        </TD>
                        <TD>
                          <Badge tone={getPaymentBadgeTone(order.payment_status)}>
                            {t(`paymentStatus.${order.payment_status}`)}
                          </Badge>
                        </TD>
                        <TD className="font-medium">
                          <span dir="ltr">
                            {formatMoney(order.total, locale)}
                          </span>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-center border-t border-sand p-6">
                <Pagination
                  page={page}
                  pageCount={totalPages}
                  onPageChange={setPage}
                />
              </div>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
