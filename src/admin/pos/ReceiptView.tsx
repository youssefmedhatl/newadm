import { useQuery } from '@tanstack/react-query'
import { Printer } from 'lucide-react'
import { supabase, Tables } from '@/lib/supabase'
import { useT, useLocale, useLocalized } from '@/lib/i18n'
import { formatMoney, num } from '@/lib/money'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { format } from 'date-fns'
import { ar as dateAr } from 'date-fns/locale'

interface OrderItem {
  id: string
  quantity: number
  unit_price: number | string
  discount?: number | string
  product_variants?: {
    products?: {
      name_en?: string
      name_ar?: string
    }
  }
}

export interface ReceiptViewProps {
  order: {
    order_number?: string | number
    created_at?: string
    profiles?: { full_name?: string }
    locations?: { name?: string }
    customers?: { full_name?: string }
    order_items?: OrderItem[]
    total_amount: number | string
    discount_code_amount?: number | string | null
    manual_discount?: number | string | null
    amount_tendered?: number | string | null
  }
  onClose: () => void
}

export function ReceiptView({ order, onClose }: ReceiptViewProps) {
  const t = useT()
  const { locale } = useLocale()
  const getLocalized = useLocalized()

  // Fetch receipt footer from settings
  const { data: receiptFooter = '' } = useQuery({
    queryKey: ['settings', 'receipt'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_setting', {
        p_key: 'receipt',
        p_default: '',
      })

      if (error) throw error
      if (!data) return ''
      if (typeof data === 'string') return data
      return JSON.stringify(data)
    },
  })

  const handlePrint = () => {
    window.print()
  }

  const totalDiscount =
    order.discount_code_amount && num(order.discount_code_amount) > 0
      ? num(order.discount_code_amount)
      : 0

  const manualDiscount =
    order.manual_discount && num(order.manual_discount) > 0
      ? num(order.manual_discount)
      : 0

  const change =
    order.amount_tendered && num(order.amount_tendered) > 0
      ? num(order.amount_tendered) - num(order.total_amount)
      : 0

  const formatDateTime = (date: string | null | undefined) => {
    if (!date) return ''
    return format(new Date(date), 'PPpp', {
      locale: locale === 'ar' ? dateAr : undefined,
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Print rules live in index.css. The old block here used
          `body * { display: none }`, which hid .receipt-container itself — its
          children were told to display but had no rendered parent, so the
          receipt printed blank. */}
      <Card>
        <CardBody className="receipt-container print-area space-y-4">
          {/* Header */}
          <div className="text-center pb-4 border-b border-sand">
            <h2 className="text-lg font-display text-ink uppercase">
              {t('pos.receipt')}
            </h2>
            <p className="text-sm text-moss mt-1">
              #{order.order_number}
            </p>
          </div>

          {/* Order Info */}
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-moss">{t('pos.receiptTime')}</span>
              <span className="text-ink text-end">
                {formatDateTime(order.created_at)}
              </span>
            </div>
            {order.profiles?.full_name && (
              <div className="flex justify-between">
                <span className="text-moss">{t('pos.receiptCashier')}</span>
                <span className="text-ink text-end">
                  {order.profiles.full_name}
                </span>
              </div>
            )}
            {order.locations?.name && (
              <div className="flex justify-between">
                <span className="text-moss">{t('pos.receiptLocation')}</span>
                <span className="text-ink text-end">{order.locations.name}</span>
              </div>
            )}
            {order.customers?.full_name && (
              <div className="flex justify-between">
                <span className="text-moss">{t('pos.customer')}</span>
                <span className="text-ink text-end">
                  {order.customers.full_name}
                </span>
              </div>
            )}
          </div>

          {/* Items */}
          <div className="space-y-2 py-4 border-t border-b border-sand">
            {order.order_items && Array.isArray(order.order_items) && order.order_items.map((item: OrderItem) => (
              <div key={item.id} className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-ink flex-1">
                    {item.product_variants?.products?.name_en ||
                      item.product_variants?.products?.name_ar ||
                      '—'}
                  </span>
                  <span className="text-sm font-medium text-ink" dir="ltr">
                    {item.quantity}×{formatMoney(item.unit_price, locale)}
                  </span>
                </div>
                {item.discount && num(item.discount) > 0 && (
                  <div className="text-xs text-danger text-end">
                    -{formatMoney(item.discount, locale)}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-moss">{t('pos.subtotal')}</span>
              <span className="text-ink" dir="ltr">
                {formatMoney(
                  num(order.total_amount) + totalDiscount + manualDiscount,
                  locale
                )}
              </span>
            </div>
            {totalDiscount > 0 && (
              <div className="flex justify-between">
                <span className="text-moss">{t('pos.discountCode')}</span>
                <span className="text-danger" dir="ltr">
                  -{formatMoney(totalDiscount, locale)}
                </span>
              </div>
            )}
            {manualDiscount > 0 && (
              <div className="flex justify-between">
                <span className="text-moss">{t('pos.manualDiscount')}</span>
                <span className="text-danger" dir="ltr">
                  -{formatMoney(manualDiscount, locale)}
                </span>
              </div>
            )}
            <div className="flex justify-between font-semibold pt-1 border-t border-sand">
              <span className="text-ink">{t('pos.grandTotal')}</span>
              <span className="text-ink" dir="ltr">
                {formatMoney(order.total_amount, locale)}
              </span>
            </div>
            {order.amount_tendered && (
              <>
                <div className="flex justify-between">
                  <span className="text-moss">{t('pos.amountTendered')}</span>
                  <span className="text-ink" dir="ltr">
                    {formatMoney(order.amount_tendered, locale)}
                  </span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span className="text-ink">{t('pos.change')}</span>
                  <span className="text-success" dir="ltr">
                    {formatMoney(change, locale)}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          {receiptFooter && (
            <div className="text-xs text-center text-moss pt-4 border-t border-sand whitespace-pre-wrap">
              {receiptFooter}
            </div>
          )}

          {/* Thank you */}
          <p className="text-center text-xs text-moss pt-2">
            {t('common.welcome')}
          </p>
        </CardBody>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-2 no-print">
        <Button
          variant="secondary"
          onClick={handlePrint}
          className="flex-1 flex items-center justify-center gap-2"
        >
          <Printer className="h-4 w-4" />
          {t('pos.print')}
        </Button>
        <Button variant="primary" onClick={onClose} className="flex-1">
          {t('pos.done')}
        </Button>
      </div>
    </div>
  )
}
