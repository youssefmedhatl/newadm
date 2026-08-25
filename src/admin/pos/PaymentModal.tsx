import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useT, useLocale } from '@/lib/i18n'
import { useErrorText } from '@/lib/errors'
import { formatMoney } from '@/lib/money'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { toast } from 'sonner'
import { CartItem } from './useCart'
import { ReceiptView, ReceiptViewProps } from './ReceiptView'

interface PaymentModalProps {
  open: boolean
  onClose: () => void
  onSaleComplete: () => void
  items: CartItem[]
  subtotal: number
  totalDiscount: number
  codeDiscountAmount: number
  manualDiscount: number
  grandTotal: number
  locationId: string
  shiftId?: string
  customerId?: string
  discountCode?: string
}

export function PaymentModal({
  open,
  onClose,
  onSaleComplete,
  items,
  subtotal,
  totalDiscount,
  codeDiscountAmount,
  manualDiscount,
  grandTotal,
  locationId,
  shiftId,
  customerId,
  discountCode,
}: PaymentModalProps) {
  const t = useT()
  const errorText = useErrorText()
  const { locale } = useLocale()
  const queryClient = useQueryClient()
  const [completedOrder, setCompletedOrder] = useState<ReceiptViewProps['order'] | null>(null)

  // Mutation for creating POS sale
  const createSaleMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_pos_sale', {
        p_location_id: locationId,
        p_items: items.map((item) => ({
          variant_id: item.variant_id,
          quantity: item.quantity,
          discount: item.discount || 0,
        })),
        p_shift_id: shiftId || undefined,
        p_customer_id: customerId || undefined,
        p_discount_code: discountCode || undefined,
        p_manual_discount: manualDiscount || 0,
        // Exact amount — change calculation removed, sale confirms directly.
        p_amount_tendered: grandTotal,
        p_notes: undefined,
      })

      if (error) throw error
      return data
    },
    onSuccess: (order) => {
      setCompletedOrder(order as unknown as ReceiptViewProps['order'])

      // The sale is committed — clear the cart so the register is ready
      // for the next order right away, rather than leaving the same
      // items sitting there able to be "sold" again.
      onSaleComplete()

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['inventory_levels'] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['shifts'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: (err: Error) => {
      toast.error(errorText(err))
    },
  })

  // Reset when the modal closes. Guarded during render (instead of a
  // useEffect) so closing doesn't cost an extra render pass.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) setCompletedOrder(null)
  }

  if (completedOrder) {
    return (
      <Modal
        open={open}
        onClose={() => {
          onClose()
          setCompletedOrder(null)
        }}
        size="lg"
      >
        <ReceiptView
          order={completedOrder}
          onClose={() => {
            onClose()
            setCompletedOrder(null)
          }}
        />
      </Modal>
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('pos.payment')}
      size="md"
      footer={
        <div className="flex gap-3 justify-end">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={createSaleMutation.isPending}
          >
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => createSaleMutation.mutate()}
            loading={createSaleMutation.isPending}
            autoFocus
          >
            {t('pos.completeSale')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Total Summary */}
        <Card>
          <CardBody className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-moss">{t('pos.subtotal')}</span>
              <span className="text-sm text-ink" dir="ltr">
                {formatMoney(subtotal, locale)}
              </span>
            </div>
            {totalDiscount > 0 && (
              <div className="flex justify-between">
                <span className="text-sm text-moss">{t('pos.totalDiscount')}</span>
                <span className="text-sm text-danger" dir="ltr">
                  -{formatMoney(totalDiscount, locale)}
                </span>
              </div>
            )}
            {codeDiscountAmount > 0 && (
              <div className="flex justify-between">
                <span className="text-sm text-moss">{t('pos.discountCode')}</span>
                <span className="text-sm text-danger" dir="ltr">
                  -{formatMoney(codeDiscountAmount, locale)}
                </span>
              </div>
            )}
            {manualDiscount > 0 && (
              <div className="flex justify-between">
                <span className="text-sm text-moss">
                  {t('pos.manualDiscount')}
                </span>
                <span className="text-sm text-danger" dir="ltr">
                  -{formatMoney(manualDiscount, locale)}
                </span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-sand font-semibold">
              <span className="text-ink">{t('pos.grandTotal')}</span>
              <span className="text-ink" dir="ltr">
                {formatMoney(grandTotal, locale)}
              </span>
            </div>
          </CardBody>
        </Card>
      </div>
    </Modal>
  )
}
