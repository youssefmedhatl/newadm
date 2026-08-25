import { useState, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useT, useLocale, useOrderItemName } from '@/lib/i18n'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { useErrorText } from '@/lib/errors'
import { useAuth } from '@/lib/auth'
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
  Button,
  Input,
  Modal,
  ConfirmDialog,
  Spinner,
} from '@/components/ui'
import { ChevronLeft } from 'lucide-react'
import { format } from 'date-fns'
import type { Tables } from '@/lib/supabase'
import type { Json } from '@/lib/database.types'

interface ReturnLine {
  order_item_id: string
  quantity: number
  restock: boolean
}

interface ShippingAddress {
  line1?: string
  line2?: string
  city?: string
  governorate?: string
  landmark?: string
  full_name?: string
  phone?: string
}

function asAddress(v: unknown): ShippingAddress | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as ShippingAddress) : null
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const t = useT()
  const errorText = useErrorText()
  const { locale, isRTL } = useLocale()
  const orderItemName = useOrderItemName()
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  /**
   * Timeline entries written from migration 0026 onward carry a translatable
   * event_code plus params. Older rows have only the English `message`, so they
   * fall back to it rather than rendering blank.
   */
  const eventTitle = useCallback(
    (event: { event_code?: string | null; event_params?: Json; type?: string | null; message?: string | null }): string => {
      if (!event.event_code) return event.message || event.type || ''
      const params =
        event.event_params && typeof event.event_params === 'object' && !Array.isArray(event.event_params)
          ? (event.event_params as Record<string, unknown>)
          : {}
      const label = (kind: 'status' | 'paymentStatus', raw: unknown): string =>
        raw ? t(`${kind}.${String(raw)}` as Parameters<typeof t>[0]) : ''
      const kind = event.event_code === 'order_payment_changed' ? 'paymentStatus' : 'status'
      return t(`orderEvent.${event.event_code}` as Parameters<typeof t>[0], {
        order_number: String(params.order_number ?? ''),
        from: label(kind, params.from),
        to: label(kind, params.to),
      })
    },
    [t]
  )

  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [cancelReason, setCancelReason] = useState<string>('')
  const [showReturnModal, setShowReturnModal] = useState(false)
  const [returnLines, setReturnLines] = useState<ReturnLine[]>([])
  const [returnReason, setReturnReason] = useState<string>('')

  // Fetch order
  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: async () => {
      if (!id) return null

      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        toast.error(errorText(error))
        throw error
      }

      return data
    },
    enabled: !!id,
  })

  useDocumentTitle(order?.order_number || t('nav.orders'))

  // Fetch order items
  const { data: orderItems = [], isLoading: itemsLoading } = useQuery({
    queryKey: ['orderItems', id],
    queryFn: async () => {
      if (!id) return []

      const { data, error } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', id)

      if (error) throw error
      return data || []
    },
    enabled: !!id,
  })

  // Fetch order events
  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ['orderEvents', id],
    queryFn: async () => {
      if (!id) return []

      const { data, error } = await supabase
        .from('order_events')
        .select('*')
        .eq('order_id', id)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data || []
    },
    enabled: !!id,
  })

  // Fetch open shift
  const { data: openShift } = useQuery({
    queryKey: ['openShift', profile?.location_id],
    queryFn: async () => {
      if (!profile?.location_id) return null

      const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .eq('location_id', profile.location_id)
        .eq('status', 'open')
        .single()

      if (error && error.code !== 'PGRST116') throw error
      return data || null
    },
  })

  // Complete order mutation
  const completeOrderMutation = useMutation({
    mutationFn: async () => {
      if (!order?.id) throw new Error(t('orderDetail.errorOrderNotFound'))

      const { data, error } = await supabase.rpc('complete_order', {
        p_order_id: order.id,
        p_shift_id: openShift?.id ?? undefined,
      })

      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success(t('orders.completed'))
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['inventory_levels'] })
      queryClient.invalidateQueries({ queryKey: ['shifts'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (error: Error) => {
      toast.error(errorText(error))
    },
  })

  // Cancel order mutation
  const cancelOrderMutation = useMutation({
    mutationFn: async () => {
      if (!order?.id) throw new Error(t('orderDetail.errorOrderNotFound'))

      const { data, error } = await supabase.rpc('cancel_order', {
        p_order_id: order.id,
        p_reason: cancelReason || undefined,
      })

      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success(t('orders.cancelled'))
      setCancelReason('')
      setShowCancelDialog(false)
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['inventory_levels'] })
    },
    onError: (error: Error) => {
      toast.error(errorText(error))
    },
  })

  // Process return mutation
  const processReturnMutation = useMutation({
    mutationFn: async () => {
      if (!order?.id) throw new Error(t('orderDetail.errorOrderNotFound'))

      const lines = returnLines
        .filter(l => l.quantity > 0)
        .map(l => ({ order_item_id: l.order_item_id, quantity: l.quantity, restock: l.restock }))

      const { data, error } = await supabase.rpc('process_return', {
        p_order_id: order.id,
        p_lines: lines as Json,
        p_reason: returnReason || undefined,
        p_shift_id: openShift?.id ?? undefined,
      })

      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success(t('orders.returnProcessed'))
      setReturnLines([])
      setReturnReason('')
      setShowReturnModal(false)
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['inventory_levels'] })
    },
    onError: (error: Error) => {
      toast.error(errorText(error))
    },
  })

  // Must stay above the early returns below — a hook called after a
  // conditional `return` changes the hook order between renders, which blanked
  // this entire page once the order finished loading.
  //
  // Mirrors order_line_paid_per_unit() in the database: what the customer
  // actually paid for a unit, after the line discount and that line's share of
  // the order-level discount. Anything else would preview a refund larger than
  // the one the server will actually issue.
  const computeRefundTotal = useMemo(() => {
    const linesTotal = orderItems.reduce((sum, i) => sum + num(i.total), 0)
    const orderDiscount = num(order?.discount_total)

    return returnLines.reduce((sum, line) => {
      const item = orderItems.find((i) => i.id === line.order_item_id)
      if (!item || !item.quantity) return sum

      const share = linesTotal > 0 ? num(item.total) / linesTotal : 0
      const netLine = Math.max(num(item.total) - orderDiscount * share, 0)
      return sum + (netLine / item.quantity) * line.quantity
    }, 0)
  }, [returnLines, orderItems, order?.discount_total])

  if (orderLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="space-y-6 p-6">
        <p className="text-moss">{t('error.notFound')}</p>
      </div>
    )
  }

  const canComplete =
    !['completed', 'cancelled'].includes(order.status)
  const canCancel =
    !['completed', 'cancelled'].includes(order.status)
  const canReturn =
    ['completed', 'confirmed', 'ready', 'out_for_delivery'].includes(
      order.status
    ) && !['refunded'].includes(order.payment_status)

  const handleInitializeReturnModal = () => {
    const lines: ReturnLine[] = orderItems.map((item) => ({
      order_item_id: item.id,
      quantity: 0,
      restock: true,
    }))
    setReturnLines(lines)
    setShowReturnModal(true)
  }

  const shippingAddress = asAddress(order.shipping_address)

  return (
    <div className="print-area space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/admin/orders')}
          className="flex items-center gap-2 text-moss hover:text-ink transition-colors"
        >
          <ChevronLeft className={`h-5 w-5 ${isRTL ? 'rotate-180' : ''}`} />
          {t('common.back')}
        </button>
      </div>

      {/* Order Header */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>
                {t('orderDetail.header', { orderNumber: order.order_number })}
              </CardTitle>
              <p className="text-sm text-moss mt-1">
                {t('orderDetail.placed', {
                  date: format(new Date(order.placed_at), 'd MMM yyyy HH:mm'),
                })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={order.channel === 'pos' ? 'neutral' : 'info'}>
                {order.channel === 'pos' ? t('dashboard.pos') : t('dashboard.online')}
              </Badge>
              <Badge
                tone={
                  order.status === 'completed'
                    ? 'success'
                    : order.status === 'cancelled'
                    ? 'danger'
                    : 'warning'
                }
              >
                {t(`status.${order.status}`)}
              </Badge>
              <Badge
                tone={
                  order.payment_status === 'paid'
                    ? 'success'
                    : ['refunded', 'partially_refunded'].includes(
                        order.payment_status
                      )
                    ? 'danger'
                    : 'warning'
                }
              >
                {t(`paymentStatus.${order.payment_status}`)}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <div className="text-3xl font-bold text-ink">
            {formatMoney(order.total, locale)}
          </div>
        </CardBody>
      </Card>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle>{t('orderDetail.lineItems')}</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>{t('orderDetail.product')}</TH>
                  <TH>{t('orderDetail.variant')}</TH>
                  <TH>{t('orderDetail.sku')}</TH>
                  <TH>{t('orderDetail.unitPrice')}</TH>
                  <TH>{t('orderDetail.quantity')}</TH>
                  <TH>{t('orderDetail.returned')}</TH>
                  <TH>{t('orderDetail.lineTotal')}</TH>
                </TR>
              </THead>
              <TBody>
                {orderItems.map((item) => (
                  <TR key={item.id}>
                    <TD>
                      <span className="font-medium">{orderItemName(item)}</span>
                    </TD>
                    <TD className="text-sm text-moss">
                      {item.variant_label || '-'}
                    </TD>
                    <TD>
                      <span dir="ltr" className="font-mono text-xs">
                        {item.sku || '-'}
                      </span>
                    </TD>
                    <TD>
                      <span dir="ltr">{formatMoney(item.unit_price, locale)}</span>
                    </TD>
                    <TD>{item.quantity}</TD>
                    <TD>{item.quantity_returned || 0}</TD>
                    <TD className="font-medium">
                      <span dir="ltr">{formatMoney(item.total, locale)}</span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </CardBody>
      </Card>

      {/* Totals and Customer */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Totals */}
        <Card>
          <CardHeader>
            <CardTitle>{t('orderDetail.totals')}</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-moss">{t('orderDetail.subtotal')}</span>
              <span dir="ltr" className="font-medium">
                {formatMoney(order.subtotal, locale)}
              </span>
            </div>
            {num(order.discount_total) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-moss">{t('orderDetail.discount')}</span>
                <span dir="ltr" className="font-medium">
                  -{formatMoney(order.discount_total, locale)}
                </span>
              </div>
            )}
            {num(order.shipping_total) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-moss">{t('orderDetail.shipping')}</span>
                <span dir="ltr" className="font-medium">
                  {formatMoney(order.shipping_total, locale)}
                </span>
              </div>
            )}
            <div className="border-t border-sand pt-3 flex justify-between text-lg font-bold">
              <span>{t('common.total')}</span>
              <span dir="ltr">{formatMoney(order.total, locale)}</span>
            </div>
            {num(order.amount_paid) > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>{t('orderDetail.paid')}</span>
                <span dir="ltr">{formatMoney(order.amount_paid, locale)}</span>
              </div>
            )}
            {num(order.amount_refunded) > 0 && (
              <div className="flex justify-between text-sm text-red-600">
                <span>{t('orderDetail.refunded')}</span>
                <span dir="ltr">{formatMoney(order.amount_refunded, locale)}</span>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Customer Info */}
        <Card>
          <CardHeader>
            <CardTitle>{t('orderDetail.customer')}</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <div>
              <p className="text-xs text-moss mb-1">{t('orderDetail.contact')}</p>
              <p className="font-medium text-ink">
                {order.contact_name || 'Guest'}
              </p>
            </div>
            {order.contact_phone && (
              <div>
                <p className="text-xs text-moss mb-1">{t('orderDetail.phone')}</p>
                <p dir="ltr" className="font-medium text-ink">
                  {order.contact_phone}
                </p>
              </div>
            )}
            {order.contact_email && (
              <div>
                <p className="text-xs text-moss mb-1">{t('orderDetail.email')}</p>
                <p className="font-medium text-ink">{order.contact_email}</p>
              </div>
            )}

            {shippingAddress && order.fulfillment === 'delivery' && (
              <div className="border-t border-sand pt-4">
                <p className="text-xs text-moss mb-2">{t('orderDetail.shippingAddress')}</p>
                <div className="text-sm text-ink space-y-1">
                  <p>{shippingAddress.full_name ?? ''}</p>
                  <p>{shippingAddress.line1 ?? ''}</p>
                  {shippingAddress.line2 && <p>{shippingAddress.line2}</p>}
                  <p>
                    {shippingAddress.city ?? ''}
                    {shippingAddress.governorate && `, ${shippingAddress.governorate}`}
                  </p>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>{t('orderDetail.timeline')}</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            {eventsLoading ? (
              <Spinner />
            ) : events.length === 0 ? (
              <p className="text-moss text-sm">{t('common.none')}</p>
            ) : (
              events.map((event, idx) => (
                <div
                  key={event.id}
                  className={`flex gap-4 pb-4 ${
                    idx !== events.length - 1 ? 'border-b border-sand' : ''
                  }`}
                >
                  <div className="flex flex-col items-center">
                    <div className="h-3 w-3 rounded-full bg-ink" />
                    {idx !== events.length - 1 && (
                      <div className="h-8 w-0.5 bg-sand mt-2" />
                    )}
                  </div>
                  <div className="flex-1 pt-0.5">
                    <p className="font-medium text-ink text-sm">
                      {eventTitle(event)}
                    </p>
                    <p className="text-xs text-moss mt-1">
                      {format(new Date(event.created_at), 'd MMM yyyy HH:mm')}
                    </p>
                    {!event.event_code && event.message && (
                      <p className="text-sm text-ink mt-2">{event.message}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardBody>
      </Card>

      {/* Actions — controls, never printed */}
      <Card className="no-print">
        <CardHeader>
          <CardTitle>{t('orderDetail.actions')}</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-wrap gap-3">
            {canComplete && (
              <Button
                onClick={() => completeOrderMutation.mutate()}
                loading={completeOrderMutation.isPending}
              >
                {t('orderDetail.collectCash')}
              </Button>
            )}

            {canReturn && (
              <Button
                onClick={handleInitializeReturnModal}
                variant="secondary"
              >
                {t('orderDetail.return')}
              </Button>
            )}

            {canCancel && (
              <Button
                onClick={() => setShowCancelDialog(true)}
                variant="secondary"
              >
                {t('orderDetail.cancel')}
              </Button>
            )}

            <Button
              onClick={() => window.print()}
              variant="secondary"
            >
              {t('orderDetail.printInvoice')}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Cancel Dialog */}
      <ConfirmDialog
        open={showCancelDialog}
        title={t('orderDetail.cancel')}
        message={t('orderDetail.cancelReason')}
        onConfirm={() => cancelOrderMutation.mutate()}
        onCancel={() => {
          setShowCancelDialog(false)
          setCancelReason('')
        }}
        loading={cancelOrderMutation.isPending}
      />

      {/* Return Modal */}
      <Modal
        open={showReturnModal}
        onClose={() => {
          setShowReturnModal(false)
          setReturnLines([])
          setReturnReason('')
        }}
        title={t('orderDetail.return')}
      >
        <div className="space-y-4 max-h-96 overflow-y-auto mb-4">
          {orderItems.map((item) => {
            const returnLine = returnLines.find((l) => l.order_item_id === item.id)
            const maxQuantity = item.quantity - (item.quantity_returned || 0)

            return (
              <div key={item.id} className="border-b border-sand pb-4 last:border-0">
                <p className="font-medium text-sm mb-3">{orderItemName(item)}</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="flex-1 text-sm">
                      {t('orderDetail.returnQuantity')} (max: {maxQuantity})
                    </label>
                    <Input
                      type="number"
                      min="0"
                      max={maxQuantity}
                      value={(returnLine?.quantity || 0).toString()}
                      onChange={(e) => {
                        const newValue = Math.min(
                          parseInt(e.target.value) || 0,
                          maxQuantity
                        )
                        setReturnLines(
                          returnLines.map((l) =>
                            l.order_item_id === item.id
                              ? { ...l, quantity: newValue }
                              : l
                          )
                        )
                      }}
                      className="w-20"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={returnLine?.restock || false}
                      onChange={(e) => {
                        setReturnLines(
                          returnLines.map((l) =>
                            l.order_item_id === item.id
                              ? { ...l, restock: e.target.checked }
                              : l
                          )
                        )
                      }}
                      className="rounded border-sand"
                    />
                    <span>{t('orderDetail.restock')}</span>
                  </label>
                </div>
              </div>
            )
          })}

          <div className="pt-4">
            <Input
              label={t('orderDetail.cancelReason')}
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              placeholder={t('orderDetail.cancelReason')}
            />
          </div>
        </div>

        <div className="flex justify-between items-center mb-4 py-3 border-t border-sand">
          <span className="font-medium">{t('orderDetail.refundTotal')}</span>
          <span dir="ltr" className="font-bold text-lg">
            {formatMoney(computeRefundTotal, locale)}
          </span>
        </div>

        <div className="flex gap-3">
          <Button
            onClick={() => processReturnMutation.mutate()}
            loading={processReturnMutation.isPending}
          >
            {t('orderDetail.confirmAction')}
          </Button>
          <Button
            onClick={() => {
              setShowReturnModal(false)
              setReturnLines([])
              setReturnReason('')
            }}
            variant="secondary"
          >
            {t('common.cancel')}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
