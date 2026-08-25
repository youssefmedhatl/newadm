import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Trash2, Plus, Minus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useT, useLocale } from '@/lib/i18n'
import { formatMoney, num } from '@/lib/money'
import { Card, CardBody, CardHeader, CardTitle, CardFooter } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Modal } from '@/components/ui/Modal'
import { ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'
import { CartItem } from './useCart'

interface ParkedTicket {
  id: string
  items: CartItem[]
  timestamp: number
  customer_id?: string
  discount_code?: string
  manual_discount: number
}

interface CartPanelProps {
  items: CartItem[]
  parkedCount: number
  locationId: string
  onUpdateQuantity: (variant_id: string, quantity: number) => void
  onUpdateDiscount: (variant_id: string, discount: number) => void
  onRemoveItem: (variant_id: string) => void
  onClear: () => void
  onPark: () => void
  onResumeTicket: (id: string) => void
  parkedTickets: ParkedTicket[]
  subtotal: number
  totalDiscount: number
  codeDiscountAmount: number
  manualDiscount: number
  grandTotal: number
  onCheckout: () => void
  checkoutDisabled?: boolean
}

export function CartPanel({
  items,
  parkedCount,
  locationId,
  onUpdateQuantity,
  onUpdateDiscount,
  onRemoveItem,
  onClear,
  onPark,
  onResumeTicket,
  parkedTickets,
  subtotal,
  totalDiscount,
  codeDiscountAmount,
  manualDiscount,
  grandTotal,
  onCheckout,
  checkoutDisabled,
}: CartPanelProps) {
  const t = useT()
  const { locale } = useLocale()
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showParkedDrawer, setShowParkedDrawer] = useState(false)
  const [editingDiscount, setEditingDiscount] = useState<string | null>(null)
  const [discountValue, setDiscountValue] = useState('')

  // Fetch current stock for quantity cap enforcement
  const { data: currentStock = {} } = useQuery({
    queryKey: ['inventory_levels', locationId, items.map((i) => i.variant_id)],
    queryFn: async () => {
      if (items.length === 0) return {}

      const { data, error } = await supabase
        .from('inventory_levels')
        .select('variant_id, quantity, reserved')
        .eq('location_id', locationId)
        .in(
          'variant_id',
          items.map((i) => i.variant_id)
        )

      if (error) throw error

      const map: Record<string, number> = {}
      data?.forEach((inv) => {
        map[inv.variant_id] = inv.quantity - inv.reserved
      })
      return map
    },
    enabled: !!locationId && items.length > 0,
  })

  const handleQuantityChange = (variant_id: string, newQuantity: number) => {
    const available = currentStock[variant_id] || 0
    if (newQuantity > available) {
      toast.error(
        t('pos.quantityExceedsStock', { max: String(available) })
      )
      onUpdateQuantity(variant_id, available)
    } else {
      onUpdateQuantity(variant_id, newQuantity)
    }
  }

  const handleDiscountSave = (variant_id: string) => {
    const discount = num(discountValue)
    onUpdateDiscount(variant_id, discount)
    setEditingDiscount(null)
    setDiscountValue('')
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Cart Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">{t('pos.cart')}</h2>
          {parkedCount > 0 && (
            <Badge tone="info" className="mt-2">
              {t('pos.parked')}: {parkedCount}
            </Badge>
          )}
        </div>
        {parkedCount > 0 && (
          <Button
            variant="secondary"
            onClick={() => setShowParkedDrawer(true)}
            size="sm"
          >
            {t('pos.parked')} ({parkedCount})
          </Button>
        )}
      </div>

      {/* Cart Items or Empty State */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title={t('pos.emptyCart')}
            description={t('pos.addProductsToStart')}
          />
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const available = currentStock[item.variant_id] || 0
              const lineTotal =
                num(item.unit_price) * item.quantity - num(item.discount)

              return (
                <Card key={item.variant_id}>
                  <CardBody className="space-y-3">
                    {/* Item name and details */}
                    <div className="flex-1">
                      <h4 className="font-medium text-ink line-clamp-2">
                        {item.name}
                      </h4>
                      <div className="flex items-center gap-2 mt-1">
                        {item.color_hex && (
                          <div
                            className="w-3 h-3 rounded-full border border-sand"
                            style={{ backgroundColor: item.color_hex }}
                          />
                        )}
                        {item.size && (
                          <span className="text-xs text-moss">{item.size}</span>
                        )}
                        {item.color_name && (
                          <span className="text-xs text-moss">
                            {item.color_name}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-moss mt-1">
                        SKU: <span dir="ltr">{item.sku}</span>
                      </p>
                    </div>

                    {/* Quantity and price */}
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-sand">
                      <div>
                        <p className="text-xs text-moss mb-1">{t('pos.price')}</p>
                        <p className="text-sm font-medium text-ink" dir="ltr">
                          {formatMoney(item.unit_price, locale)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-moss mb-1">{t('pos.quantity')}</p>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              handleQuantityChange(item.variant_id, item.quantity - 1)
                            }
                            aria-label={t('pos.quantityDecrease')}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <input
                            type="number"
                            min="1"
                            max={available}
                            value={item.quantity}
                            onChange={(e) =>
                              handleQuantityChange(
                                item.variant_id,
                                parseInt(e.target.value) || 1
                              )
                            }
                            className="w-12 border border-sand rounded-lg text-center text-sm p-1"
                          />
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              handleQuantityChange(item.variant_id, item.quantity + 1)
                            }
                            aria-label={t('pos.quantityIncrease')}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      <div>
                        <p className="text-xs text-moss mb-1">
                          {t('pos.lineTotal')}
                        </p>
                        <p className="text-sm font-semibold text-ink" dir="ltr">
                          {formatMoney(lineTotal, locale)}
                        </p>
                      </div>
                    </div>

                    {/* Discount editor */}
                    {editingDiscount === item.variant_id ? (
                      <div className="flex gap-2 items-end pt-2 border-t border-sand">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={discountValue}
                          onChange={(e) => setDiscountValue(e.target.value)}
                          placeholder={t('pos.discount')}
                          className="flex-1"
                        />
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() =>
                            handleDiscountSave(item.variant_id)
                          }
                        >
                          {t('common.save')}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setEditingDiscount(null)
                            setDiscountValue('')
                          }}
                        >
                          {t('common.cancel')}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center pt-2 border-t border-sand">
                        <button
                          onClick={() => {
                            setEditingDiscount(item.variant_id)
                            setDiscountValue(String(num(item.discount)))
                          }}
                          className="text-xs text-moss hover:text-ink transition-colors"
                        >
                          {item.discount > 0
                            ? `${t('pos.discount')}: ${formatMoney(item.discount, locale)}`
                            : t('pos.discount')}
                        </button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onRemoveItem(item.variant_id)}
                          aria-label={t('pos.remove')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </CardBody>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Cart Totals and Actions */}
      {items.length > 0 && (
        <Card>
          <CardBody className="space-y-3">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-moss">{t('pos.subtotal')}</span>
                <span className="font-medium text-ink" dir="ltr">
                  {formatMoney(subtotal, locale)}
                </span>
              </div>
              {totalDiscount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-moss">{t('pos.totalDiscount')}</span>
                  <span className="font-medium text-danger" dir="ltr">
                    -{formatMoney(totalDiscount, locale)}
                  </span>
                </div>
              )}
              {codeDiscountAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-moss">{t('pos.discountCode')}</span>
                  <span className="font-medium text-danger" dir="ltr">
                    -{formatMoney(codeDiscountAmount, locale)}
                  </span>
                </div>
              )}
              {manualDiscount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-moss">{t('pos.manualDiscount')}</span>
                  <span className="font-medium text-danger" dir="ltr">
                    -{formatMoney(manualDiscount, locale)}
                  </span>
                </div>
              )}
            </div>
            <div className="flex justify-between pt-2 border-t border-sand">
              <span className="font-semibold text-ink">{t('pos.grandTotal')}</span>
              <span
                className="font-bold text-lg text-ink"
                dir="ltr"
              >
                {formatMoney(grandTotal, locale)}
              </span>
            </div>
          </CardBody>

          <CardFooter className="flex flex-col gap-2">
            <Button
              variant="primary"
              onClick={onCheckout}
              disabled={checkoutDisabled}
              className="w-full"
              size="lg"
            >
              {t('pos.completeSale')}
            </Button>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="secondary"
                onClick={() => setShowClearConfirm(true)}
                className="flex-1"
                size="sm"
              >
                {t('pos.clearCart')}
              </Button>
              <Button
                variant="secondary"
                onClick={onPark}
                className="flex-1"
                size="sm"
              >
                {t('pos.parkCart')}
              </Button>
            </div>
          </CardFooter>
        </Card>
      )}

      {/* Confirm Clear Dialog */}
      <ConfirmDialog
        open={showClearConfirm}
        title={t('pos.clearCart')}
        message={t('pos.clearCartConfirm')}
        tone="danger"
        onConfirm={() => {
          onClear()
          setShowClearConfirm(false)
          toast.success(t('common.cancel'))
        }}
        onCancel={() => setShowClearConfirm(false)}
      />

      {/* Parked Tickets Drawer */}
      <Modal
        open={showParkedDrawer}
        onClose={() => setShowParkedDrawer(false)}
        title={t('pos.parked')}
        size="md"
      >
        <div className="space-y-3">
          {parkedTickets.map((ticket) => (
            <Card key={ticket.id as string}>
              <CardBody className="space-y-2">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-ink">
                      {ticket.items.length} {t('pos.lineItem')}
                    </p>
                    <p className="text-xs text-moss">
                      {new Date(ticket.timestamp).toLocaleTimeString(
                        locale === 'ar' ? 'ar-EG' : 'en-US'
                      )}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-ink" dir="ltr">
                    {formatMoney(
                      ticket.items.reduce(
                        (sum: number, i: CartItem) => sum + num(i.unit_price) * i.quantity,
                        0
                      ),
                      locale
                    )}
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    onResumeTicket(ticket.id)
                    setShowParkedDrawer(false)
                    toast.success(t('pos.resumeCart'))
                  }}
                  className="w-full"
                >
                  {t('pos.resumeCart')}
                </Button>
              </CardBody>
            </Card>
          ))}
        </div>
      </Modal>
    </div>
  )
}
