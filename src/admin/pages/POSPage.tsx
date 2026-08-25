import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useCan } from '@/lib/auth'
import { useT, useLocale } from '@/lib/i18n'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { useErrorText } from '@/lib/errors'
import { formatMoney } from '@/lib/money'
import { supabase } from '@/lib/supabase'
import { useAutoShift } from '@/admin/pos/useAutoShift'
import { ProductSearchPanel } from '@/admin/pos/ProductSearchPanel'
import { CartPanel } from '@/admin/pos/CartPanel'
import { PaymentModal } from '@/admin/pos/PaymentModal'
import { useCart } from '@/admin/pos/useCart'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { toast } from 'sonner'

export function POSPage() {
  // All hooks MUST run unconditionally; permission check comes after
  const t = useT()
  useDocumentTitle(t('nav.pos'))
  const errorText = useErrorText()
  const { locale } = useLocale()
  const can = useCan()

  // No branch picker, no open/close-shift step — this shop runs one branch
  // and the shift stays open in the background automatically.
  const { locationId: selectedLocationId, openShift } = useAutoShift()

  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>()
  const [selectedCustomerData, setSelectedCustomerData] = useState<{ id: string; full_name: string; phone: string | null; loyalty_points?: number } | null>(null)
  const [discountCode, setDiscountCode] = useState('')
  const [codeDiscountAmount, setCodeDiscountAmount] = useState(0)
  const [manualDiscount, setManualDiscount] = useState(0)
  const [discountCodeError, setDiscountCodeError] = useState('')
  const [customerSearchText, setCustomerSearchText] = useState('')

  const cart = useCart()

  // Search customers
  const { data: customers = [], isLoading: isSearchingCustomers } = useQuery({
    queryKey: ['customers', 'search', customerSearchText],
    queryFn: async () => {
      if (!customerSearchText.trim()) return []
      // Sanitize the query to prevent filter injection
      const query = customerSearchText.trim().toLowerCase().replace(/[,()."\\%_*]/g, ' ').trim()
      if (!query) return []

      const { data, error } = await supabase
        .from('customers')
        .select('id, full_name, phone, loyalty_points')
        .or(
          `full_name.ilike.%${query}%,phone.ilike.%${query}%`
        )
        .limit(10)

      if (error) throw error
      return data || []
    },
    enabled: customerSearchText.length > 0,
  })

  // Use stored customer data, not lookup from search results (which may be empty)
  const selectedCustomer = selectedCustomerData || undefined

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't hijack if input is focused
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        if (e.key === 'Escape') {
          setShowPaymentModal(false)
          setShowCustomerModal(false)
        }
        return
      }

      if (e.key === '/' || e.key === 'F2') {
        e.preventDefault()
        const input = document.querySelector('[data-pos-search="true"]') as HTMLInputElement | null
        input?.focus()
      } else if (e.key === 'F4') {
        if (cart.items.length > 0 && openShift) {
          setShowPaymentModal(true)
        }
      } else if (e.key === 'Escape') {
        setShowPaymentModal(false)
        setShowCustomerModal(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [cart.items.length, openShift])

  const handleAddCustomer = async (name: string, phone: string) => {
    if (!name.trim() || !phone.trim()) {
      toast.error(t('common.error'))
      return
    }

    const { data, error } = await supabase
      .from('customers')
      .insert({
        full_name: name,
        phone: phone,
      })
      .select()
      .single()

    if (error) {
      toast.error(errorText(error))
      return
    }

    setSelectedCustomerId(data.id)
    setSelectedCustomerData(data)
    setCustomerSearchText('')
    setShowCustomerModal(false)
    toast.success(t('common.add'))
  }

  // Permission check AFTER all hooks
  if (!can('pos')) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-moss">{t('error.notAuthorised')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 bg-bone min-h-screen">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-display text-ink mb-2">{t('nav.pos')}</h1>
        <p className="text-moss">{t('page.posDescription')}</p>
      </div>

      {/* Keyboard Hints */}
      <Card className="bg-info/10 border-info/30">
        <CardBody className="text-xs text-info">{t('pos.keyboardHints')}</CardBody>
      </Card>

      {/* Main Layout */}
      {openShift ? (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Product Search - ~60% */}
          <div className="lg:col-span-3 flex flex-col gap-6">
            <ProductSearchPanel
              locationId={selectedLocationId}
              onAddItem={(item, available) => {
                const currentAvailable = available
                cart.addItem(item, currentAvailable)
                toast.success(t('pos.cart') + ': ' + item.name)
              }}
              onInventoryLoaded={(availableByVariantId, priceByVariantId) => {
                cart.reconcileAgainstStock(availableByVariantId, priceByVariantId)
              }}
            />
          </div>

          {/* Cart and Payment - ~40% */}
          <div className="lg:col-span-2 flex flex-col gap-6 lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:min-h-0">
            {/* Discount Panel */}
            <Card>
              <CardBody className="space-y-3">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-ink">
                    {t('pos.discountCode')}
                  </label>
                  <div className="flex gap-2">
                    <Input
                      value={discountCode}
                      onChange={(e) => {
                        setDiscountCode(e.target.value)
                        setCodeDiscountAmount(0)
                        setDiscountCodeError('')
                      }}
                      placeholder={t('pos.discountCode')}
                      className="flex-1"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={async () => {
                        if (!discountCode.trim()) {
                          setDiscountCodeError(t('common.error'))
                          return
                        }

                        const { data, error } = await supabase.rpc(
                          'validate_discount',
                          {
                            p_code: discountCode,
                            p_subtotal: cart.subtotal - cart.totalDiscount,
                            p_customer_id: selectedCustomerId || undefined,
                          }
                        )

                        if (error) {
                          setDiscountCodeError(error.message)
                          return
                        }

                        const response = data as { valid: boolean; reason?: string; amount?: number } | null
                        if (!response || !response.valid) {
                          setCodeDiscountAmount(0)
                          setDiscountCodeError(
                            response?.reason || t('pos.codeInvalid')
                          )
                          return
                        }

                        const amount = response.amount ? Number(response.amount) : 0
                        setCodeDiscountAmount(amount)
                        setDiscountCodeError('')
                        toast.success(t('common.confirm'))
                      }}
                    >
                      {t('pos.applyCode')}
                    </Button>
                  </div>
                  {discountCodeError && (
                    <p className="text-xs text-danger">{discountCodeError}</p>
                  )}
                  {!discountCodeError && codeDiscountAmount > 0 && (
                    <p className="text-xs text-success">
                      {t('pos.discount')}: {formatMoney(codeDiscountAmount, locale)}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-ink">
                    {t('pos.manualDiscount')}
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={manualDiscount}
                    onChange={(e) => setManualDiscount(Number(e.target.value))}
                    placeholder="0.00"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-ink">
                    {t('pos.customer')}
                  </label>
                  {selectedCustomer ? (
                    <div className="flex items-center justify-between bg-bone p-3 rounded-lg border border-sand">
                      <div>
                        <p className="text-sm font-medium text-ink">
                          {selectedCustomer.full_name}
                        </p>
                        {selectedCustomer.loyalty_points && (
                          <p className="text-xs text-moss">
                            {t('pos.loyaltyPoints')}: {selectedCustomer.loyalty_points}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setSelectedCustomerId(undefined)
                          setSelectedCustomerData(null)
                          setCustomerSearchText('')
                        }}
                      >
                        {t('pos.removeCustomer')}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowCustomerModal(true)}
                      className="w-full"
                    >
                      {t('pos.addCustomer')}
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>

            {/* Cart Panel */}
            <div className="flex-1 min-h-0 flex flex-col">
            <CartPanel
              items={cart.items}
              parkedCount={cart.parkedTickets.length}
              locationId={selectedLocationId}
              onUpdateQuantity={(id, qty) => {
                const item = cart.items.find((i) => i.variant_id === id)
                if (item) {
                  // Get current stock to enforce cap
                  const available = 999 // This will be capped by the cart
                  cart.updateQuantity(id, qty, available)
                }
              }}
              onUpdateDiscount={cart.updateDiscount}
              onRemoveItem={cart.removeItem}
              onClear={() => {
                cart.clear()
                setCodeDiscountAmount(0)
                setDiscountCode('')
              }}
              onPark={() => {
                cart.parkTicket(
                  selectedCustomerId,
                  discountCode || undefined,
                  manualDiscount
                )
                setCodeDiscountAmount(0)
                setDiscountCode('')
                setManualDiscount(0)
                toast.success(t('pos.parkCart'))
              }}
              onResumeTicket={(ticketId) => {
                const ticket = cart.parkedTickets.find((t) => t.id === ticketId)
                if (ticket) {
                  cart.resumeTicket(ticketId)
                  if (ticket.customer_id) setSelectedCustomerId(ticket.customer_id)
                  if (ticket.discount_code) setDiscountCode(ticket.discount_code)
                  if (ticket.manual_discount) setManualDiscount(ticket.manual_discount)
                  // Re-validate the discount code
                  if (ticket.discount_code) {
                    supabase.rpc('validate_discount', {
                      p_code: ticket.discount_code,
                      p_subtotal: cart.subtotal - cart.totalDiscount,
                      p_customer_id: ticket.customer_id || undefined,
                    }).then(({ data }) => {
                      const resp = data as { valid: boolean; amount?: number; reason?: string } | null
                      if (resp?.valid && resp?.amount) {
                        setCodeDiscountAmount(Number(resp.amount))
                      }
                    })
                  }
                }
              }}
              parkedTickets={cart.parkedTickets}
              subtotal={cart.subtotal}
              totalDiscount={cart.totalDiscount}
              codeDiscountAmount={codeDiscountAmount}
              manualDiscount={manualDiscount}
              grandTotal={Math.max(
                0,
                cart.subtotal - cart.totalDiscount - codeDiscountAmount - manualDiscount
              )}
              onCheckout={() => {
                if (openShift) {
                  setShowPaymentModal(true)
                }
              }}
              checkoutDisabled={!openShift}
            />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}

      {/* Payment Modal */}
      <PaymentModal
        open={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onSaleComplete={() => {
          cart.clear()
          setDiscountCode('')
          setCodeDiscountAmount(0)
          setManualDiscount(0)
          setSelectedCustomerId(undefined)
        }}
        items={cart.items}
        subtotal={cart.subtotal}
        totalDiscount={cart.totalDiscount}
        codeDiscountAmount={codeDiscountAmount}
        manualDiscount={manualDiscount}
        grandTotal={Math.max(
          0,
          cart.subtotal - cart.totalDiscount - codeDiscountAmount - manualDiscount
        )}
        locationId={selectedLocationId}
        shiftId={openShift?.id}
        customerId={selectedCustomerId}
        discountCode={discountCode}
      />

      {/* Customer Modal */}
      <Modal
        open={showCustomerModal}
        onClose={() => {
          setShowCustomerModal(false)
          setCustomerSearchText('')
        }}
        title={t('pos.customer')}
        size="md"
      >
        <div className="space-y-4">
          <Input
            label={t('pos.searchCustomer')}
            value={customerSearchText}
            onChange={(e) => setCustomerSearchText(e.target.value)}
            placeholder={t('pos.customerPhone')}
          />

          {/* Search Results */}
          {customerSearchText && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {isSearchingCustomers ? (
                <p className="text-xs text-moss text-center">
                  {t('common.loading')}
                </p>
              ) : customers.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-sm text-moss mb-4">
                    {t('pos.createCustomer')}
                  </p>
                  <QuickCustomerForm
                    searchText={customerSearchText}
                    onSubmit={handleAddCustomer}
                  />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {customers.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setSelectedCustomerId(c.id)
                          setSelectedCustomerData(c)
                          setShowCustomerModal(false)
                          setCustomerSearchText('')
                        }}
                        className="w-full text-start p-3 rounded-lg border border-sand hover:bg-bone transition-colors"
                      >
                        <p className="font-medium text-ink">{c.full_name}</p>
                        <p className="text-xs text-moss">
                          {c.phone}
                        </p>
                      </button>
                    ))}
                  </div>
                  <QuickCustomerForm
                    searchText={customerSearchText}
                    onSubmit={handleAddCustomer}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

function QuickCustomerForm({
  searchText,
  onSubmit,
}: {
  searchText: string
  onSubmit: (name: string, phone: string) => void
}) {
  const t = useT()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState(searchText)

  return (
    <div className="space-y-3 pt-4 border-t border-sand">
      <h3 className="text-sm font-medium text-ink">{t('pos.createCustomer')}</h3>
      <Input
        label={t('pos.customerName')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('pos.customerName')}
      />
      <Input
        label={t('pos.customerPhone')}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder={t('pos.customerPhone')}
      />
      <Button
        variant="primary"
        onClick={() => onSubmit(name, phone)}
        className="w-full"
        size="sm"
      >
        {t('common.add')}
      </Button>
    </div>
  )
}
