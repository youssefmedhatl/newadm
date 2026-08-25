import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useT, useLocale, useLocalized } from '@/lib/i18n'
import { formatMoney, num } from '@/lib/money'
import { SearchInput } from '@/components/ui/SearchInput'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Package } from 'lucide-react'
import { toast } from 'sonner'
import { CartItem } from './useCart'

interface ProductVariantWithStock {
  id: string
  sku: string
  barcode: string | null
  size: string | null
  color_name: string | null
  color_hex: string | null
  price: number | null
  is_active: boolean
  quantity: number
  reserved: number
  products: {
    id: string
    name_en: string
    name_ar: string
    status: string
    price: number
  }
}

interface ProductSearchPanelProps {
  locationId: string
  onAddItem: (item: CartItem, available: number) => void
  onInventoryLoaded?: (
    availableByVariantId: Record<string, number>,
    priceByVariantId: Record<string, number>
  ) => void
}

export function ProductSearchPanel({
  locationId,
  onAddItem,
  onInventoryLoaded,
}: ProductSearchPanelProps) {
  const t = useT()
  const { locale } = useLocale()
  const getLocalized = useLocalized()
  const [searchText, setSearchText] = useState('')

  // Fetch inventory for location
  const { data: inventory = [], isLoading } = useQuery({
    queryKey: ['inventory_levels', locationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_levels')
        .select(
          `quantity, reserved, variant_id,
          product_variants!inner(
            id, sku, barcode, size, color_name, color_hex, price, is_active,
            products!inner(id, name_en, name_ar, status, price)
          )`
        )
        .eq('location_id', locationId)

      if (error) throw error

      // Flatten and filter. A variant's own `price` is an override — when it's
      // null the variant inherits the product's price (mirrors the DB's
      // `variant_price()` function), so resolve that here rather than letting
      // a null price silently ring up as EGP 0 at checkout.
      return (data || [])
        .map((inv) => ({
          ...inv.product_variants,
          price:
            inv.product_variants.price ?? inv.product_variants.products.price,
          quantity: inv.quantity,
          reserved: inv.reserved,
        }))
        .filter(
          (v) => v.is_active && v.products.status === 'active'
        )
    },
    enabled: !!locationId,
  })

  // Reconcile cart against stock when inventory loads
  useEffect(() => {
    if (inventory.length > 0 && onInventoryLoaded) {
      const availableByVariantId: Record<string, number> = {}
      const priceByVariantId: Record<string, number> = {}
      inventory.forEach((inv) => {
        availableByVariantId[inv.id] = Math.max(0, inv.quantity - inv.reserved)
        priceByVariantId[inv.id] = num(inv.price)
      })
      onInventoryLoaded(availableByVariantId, priceByVariantId)
    }
  }, [inventory, onInventoryLoaded])

  // Filter products based on search
  const filteredProducts = inventory.filter((p) => {
    const query = searchText.toLowerCase()
    if (!query) return true

    const productName = getLocalized(p.products, 'name').toLowerCase()
    const sku = (p.sku || '').toLowerCase()
    const barcode = (p.barcode || '').toLowerCase()

    return (
      productName.includes(query) ||
      sku.includes(query) ||
      barcode.includes(query)
    )
  })

  // Handle barcode entry (Enter key on exact barcode match)
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return

    const exact = inventory.find((p) => p.barcode === searchText.trim())
    if (exact) {
      const available = exact.quantity - exact.reserved
      if (available > 0) {
        onAddItem(
          {
            variant_id: exact.id,
            sku: exact.sku,
            name: getLocalized(exact.products, 'name'),
            size: exact.size || undefined,
            color_name: exact.color_name || undefined,
            color_hex: exact.color_hex || undefined,
            unit_price: num(exact.price),
            quantity: 1,
            discount: 0,
          },
          available
        )
        setSearchText('')
        toast.success(
          t('pos.cart') + ': ' + getLocalized(exact.products, 'name')
        )
      }
    }
  }

  return (
    <div className="flex flex-col h-full gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('pos.productSearch')}</CardTitle>
        </CardHeader>
        <CardBody>
          <SearchInput
            value={searchText}
            onValueChange={setSearchText}
            placeholder={t('pos.searchByName')}
            onKeyDown={handleSearchKeyDown}
            data-pos-search="true"
          />
        </CardBody>
      </Card>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <EmptyState
            icon={Package}
            title={t('common.search')}
            description={
              searchText
                ? t('common.none')
                : t('pos.addProductsToStart')
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filteredProducts.map((variant) => {
              const available = variant.quantity - variant.reserved
              const isOutOfStock = available <= 0

              return (
                <Card
                  key={variant.id}
                  className={isOutOfStock ? 'opacity-50' : ''}
                >
                  <CardBody className="space-y-3">
                    <div>
                      <h3 className="font-medium text-ink line-clamp-2">
                        {getLocalized(variant.products, 'name')}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        {variant.color_hex && (
                          <div
                            className="w-4 h-4 rounded-full border border-sand"
                            style={{
                              backgroundColor: variant.color_hex,
                            }}
                            title={variant.color_name || ''}
                          />
                        )}
                        {variant.size && (
                          <span className="text-xs text-moss">
                            {variant.size}
                          </span>
                        )}
                        {variant.color_name && (
                          <span className="text-xs text-moss">
                            {variant.color_name}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-sand">
                      <div>
                        <p className="text-xs text-moss mb-1">{t('pos.price')}</p>
                        <p
                          className="font-semibold text-ink"
                          dir="ltr"
                        >
                          {formatMoney(variant.price, locale)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-moss mb-1 text-end">
                          {t('pos.available')}
                        </p>
                        <p
                          className={`font-semibold text-end ${
                            isOutOfStock ? 'text-danger' : 'text-ink'
                          }`}
                        >
                          {available}
                        </p>
                      </div>
                    </div>

                    <Button
                      variant={isOutOfStock ? 'secondary' : 'primary'}
                      onClick={() => {
                        if (!isOutOfStock) {
                          onAddItem(
                            {
                              variant_id: variant.id,
                              sku: variant.sku,
                              name: getLocalized(variant.products, 'name'),
                              size: variant.size || undefined,
                              color_name: variant.color_name || undefined,
                              color_hex: variant.color_hex || undefined,
                              unit_price: num(variant.price),
                              quantity: 1,
                              discount: 0,
                            },
                            available
                          )
                        }
                      }}
                      disabled={isOutOfStock}
                      className="w-full"
                    >
                      {isOutOfStock ? t('pos.outOfStock') : t('common.add')}
                    </Button>

                    <p className="text-xs text-moss text-center">
                      SKU: <span dir="ltr">{variant.sku}</span>
                    </p>
                  </CardBody>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
