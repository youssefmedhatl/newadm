import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, type Enums, type Tables, type Views } from '@/lib/supabase'
import { useT, useLocale, useLocalized } from '@/lib/i18n'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { useErrorText } from '@/lib/errors'
import { useCan } from '@/lib/auth'
import { formatMoney, num } from '@/lib/money'
import { toast } from 'sonner'
import {
  Card,
  CardBody,
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
  Button,
  Modal,
  Tabs,
  EmptyState,
  Pagination,
} from '@/components/ui'
import { Boxes, TrendingDown } from 'lucide-react'
import { format } from 'date-fns'
import { ar } from 'date-fns/locale'

const ITEMS_PER_PAGE = 25

type InventoryLevel = Tables<'inventory_levels'> & {
  product_variants?: {
    id: string
    sku: string
    barcode: string | null
    size: string | null
    color_name: string | null
    color_hex: string | null
    products?: {
      id: string
      name_en: string
      name_ar: string
      status: Enums<'product_status'>
    }
  }
  locations?: {
    id: string
    name_en: string
    name_ar: string
  }
}

type MovementRow = Tables<'inventory_movements'> & {
  product_variants?: {
    sku: string
    size: string | null
    color_name: string | null
    products?: {
      name_en: string
      name_ar: string
    }
  }
  locations?: {
    name_en: string
    name_ar: string
  }
  created_by?: {
    full_name: string | null
  }
}

export function InventoryPage() {
  const t = useT()
  useDocumentTitle(t('nav.inventory'))
  const can = useCan()

  const [activeTab, setActiveTab] = useState('stock')

  if (!can('inventory')) {
    return (
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-3xl font-display text-ink mb-2">{t('nav.inventory')}</h1>
          <p className="text-moss">{t('page.inventoryDescription')}</p>
        </div>
        <Card>
          <CardBody>
            <p className="text-center text-moss">{t('error.notAuthorised')}</p>
          </CardBody>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-display text-ink mb-2">{t('nav.inventory')}</h1>
        <p className="text-moss">{t('page.inventoryDescription')}</p>
      </div>

      <Tabs
        tabs={[
          { id: 'stock', label: t('inventory.stockOnHand') },
          { id: 'movements', label: t('inventory.movements') },
          { id: 'valuation', label: t('inventory.valuation') },
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'stock' && <StockOnHandTab />}
      {activeTab === 'movements' && <MovementLedgerTab />}
      {activeTab === 'valuation' && <ValuationTab />}
    </div>
  )
}

function StockOnHandTab() {
  const t = useT()
  const errorText = useErrorText()
  const { locale } = useLocale()
  const getLocalized = useLocalized()
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [adjustingId, setAdjustingId] = useState<string | null>(null)
  const [adjustDelta, setAdjustDelta] = useState('')
  const [adjustReason, setAdjustReason] = useState<Enums<'movement_reason'> | ''>('')
  const [adjustNote, setAdjustNote] = useState('')

  const sanitizedSearch = useMemo(() => {
    return searchTerm.replace(/[,()."\\%_*]/g, '').trim()
  }, [searchTerm])

  const { data: result = { data: [], count: 0 }, isLoading, error } = useQuery({
    queryKey: [
      'inventory_levels',
      page,
      lowStockOnly,
      sanitizedSearch,
    ],
    queryFn: async () => {
      const query = supabase.from('inventory_levels').select(
        `id, quantity, reserved, reorder_point, reorder_qty, location_id, variant_id,
        product_variants!inner ( id, sku, barcode, size, color_name, color_hex,
          products!inner ( id, name_en, name_ar, status ) ),
        locations!inner ( id, name_en, name_ar )`,
        { count: sanitizedSearch || lowStockOnly ? undefined : 'exact' }
      )

      // PostgREST's `.or()` combinator can't reach two levels deep into
      // embedded relations at once (product_variants -> products), so a
      // name search here always returned a 400. Instead, pull a generous
      // unfiltered batch and match name/sku/barcode client-side, then
      // paginate the filtered result in JS — same approach the POS product
      // search already uses successfully.
      if (sanitizedSearch || lowStockOnly) {
        const { data, error } = await query.order('updated_at', { ascending: false }).limit(1000)

        if (error) {
          toast.error(errorText(error))
          throw error
        }

        const needle = sanitizedSearch.toLowerCase()
        const matches = ((data as InventoryLevel[]) || []).filter((row) => {
          if (needle) {
            const pv = row.product_variants
            const matchesText =
              (pv?.sku || '').toLowerCase().includes(needle) ||
              (pv?.barcode || '').toLowerCase().includes(needle) ||
              (pv?.products?.name_en || '').toLowerCase().includes(needle) ||
              (pv?.products?.name_ar || '').toLowerCase().includes(needle)
            if (!matchesText) return false
          }
          if (lowStockOnly) {
            const available = row.quantity - row.reserved
            if (available > row.reorder_point) return false
          }
          return true
        })

        return {
          data: matches.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE),
          count: matches.length,
        }
      }

      const { data, error, count } = await query
        .order('updated_at', { ascending: false })
        .range((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE - 1)

      if (error) {
        toast.error(errorText(error))
        throw error
      }

      return {
        data: (data as InventoryLevel[]) || [],
        count: count || 0,
      }
    },
  })

  const adjustMutation = useMutation({
    mutationFn: async (levelId: string) => {
      const level = result.data.find(l => l.id === levelId)
      if (!level) throw new Error(t('inventory.errorVariantNotFound'))

      const delta = parseInt(adjustDelta)
      if (isNaN(delta) || delta === 0) {
        throw new Error(t('inventory.errorValidDeltaRequired'))
      }

      const { error } = await supabase.rpc('adjust_stock', {
        p_variant_id: level.variant_id,
        p_location_id: level.location_id,
        p_delta: delta,
        p_reason: (adjustReason || 'adjustment') as Enums<'movement_reason'>,
        p_note: adjustNote || undefined,
      })

      if (error) throw error
    },
    onSuccess: () => {
      toast.success(t('common.saved'))
      setAdjustingId(null)
      setAdjustDelta('')
      setAdjustReason('')
      setAdjustNote('')
      queryClient.invalidateQueries({ queryKey: ['inventory_levels'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (error) => {
      toast.error(errorText(error))
    },
  })

  const totalPages = Math.ceil((result.count || 0) / ITEMS_PER_PAGE)

  if (error) {
    return (
      <Card>
        <CardBody>
          <p className="text-center text-moss">{t('common.error')}</p>
        </CardBody>
      </Card>
    )
  }

  const getAvailabilityBadgeTone = (quantity: number, reserved: number, reorderPoint: number) => {
    const available = quantity - reserved
    if (available <= 0) return 'danger'
    if (available <= reorderPoint) return 'warning'
    return 'success'
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <SearchInput
          placeholder={t('inventory.search.placeholder')}
          value={searchTerm}
          onValueChange={setSearchTerm}
          className="flex-1 min-w-xs"
        />
        <label className="flex items-center gap-2 px-3 py-2 rounded-full border border-sand bg-bone hover:bg-sand cursor-pointer transition-colors">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(e) => setLowStockOnly(e.target.checked)}
            className="rounded"
          />
          <span className="text-sm text-ink">{t('inventory.filter.lowStockOnly')}</span>
        </label>
      </div>

      {isLoading ? (
        <div className="text-center py-8">
          <p className="text-moss">{t('common.loading')}</p>
        </div>
      ) : result.data.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title={t('common.none')}
          description={t('inventory.search.placeholder')}
        />
      ) : (
        <>
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>{t('inventory.table.product')}</TH>
                  <TH>{t('inventory.table.variant')}</TH>
                  <TH dir="ltr">{t('inventory.table.sku')}</TH>
                  <TH>{t('inventory.table.branch')}</TH>
                  <TH className="text-end">{t('inventory.table.onHand')}</TH>
                  <TH className="text-end">{t('inventory.table.reserved')}</TH>
                  <TH className="text-end">{t('inventory.table.available')}</TH>
                  <TH className="text-end">{t('inventory.table.reorderPoint')}</TH>
                  <TH>{t('common.actions')}</TH>
                </TR>
              </THead>
              <TBody>
                {result.data.map(level => {
                  const variant = level.product_variants
                  const product = variant?.products
                  const available = num(level.quantity) - num(level.reserved)
                  const tone = getAvailabilityBadgeTone(
                    num(level.quantity),
                    num(level.reserved),
                    num(level.reorder_point)
                  )

                  return (
                    <TR key={level.id}>
                      <TD>{product ? getLocalized(product, 'name') : '-'}</TD>
                      <TD>
                        {variant?.color_name && (
                          <div className="flex items-center gap-2">
                            {variant.color_hex && (
                              <div
                                className="w-4 h-4 rounded-full border border-sand"
                                style={{ backgroundColor: variant.color_hex }}
                              />
                            )}
                            <span>{variant.color_name}</span>
                            {variant.size && <span className="text-moss text-sm">{variant.size}</span>}
                          </div>
                        )}
                      </TD>
                      <TD dir="ltr">{variant?.sku || '-'}</TD>
                      <TD>{level.locations ? getLocalized(level.locations, 'name') : '-'}</TD>
                      <TD className="text-end">{num(level.quantity)}</TD>
                      <TD className="text-end">{num(level.reserved)}</TD>
                      <TD className="text-end">
                        <Badge tone={tone}>{available}</Badge>
                      </TD>
                      <TD className="text-end">{num(level.reorder_point)}</TD>
                      <TD>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setAdjustingId(level.id)}
                        >
                          {t('inventory.adjust')}
                        </Button>
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          </Card>

          {totalPages > 1 && (
            <Pagination
              page={page}
              pageCount={totalPages}
              onPageChange={setPage}
            />
          )}
        </>
      )}

      {adjustingId && (
        <Modal open={true} onClose={() => setAdjustingId(null)} size="sm">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1">
                {t('inventory.adjustDelta')}
              </label>
              <Input
                type="number"
                value={adjustDelta}
                onChange={(e) => setAdjustDelta(e.target.value)}
                placeholder="e.g., +5 or -3"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1">
                {t('inventory.adjustReason')}
              </label>
              <Select
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value as Enums<'movement_reason'>)}
              >
                <option value="">Select reason</option>
                <option value="adjustment">{t('inventory.reasonAdjustment')}</option>
                <option value="damage">{t('inventory.reasonDamage')}</option>
                <option value="return">{t('inventory.reasonReturn')}</option>
                <option value="initial">{t('inventory.reasonInitial')}</option>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1">
                {t('inventory.adjustNote')}
              </label>
              <Input
                type="text"
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
                placeholder="Optional notes"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setAdjustingId(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={() => adjustMutation.mutate(adjustingId)}
                disabled={adjustMutation.isPending}
              >
                {t('common.save')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function MovementLedgerTab() {
  const t = useT()
  const errorText = useErrorText()
  const { locale } = useLocale()
  const getLocalized = useLocalized()

  const [page, setPage] = useState(1)
  const [reasonFilter, setReasonFilter] = useState<Enums<'movement_reason'> | ''>('')

  const { data: result = { data: [], count: 0 }, isLoading } = useQuery({
    queryKey: ['inventory_movements', page, reasonFilter],
    queryFn: async () => {
      let query = supabase.from('inventory_movements').select(
        `id, delta, reason, note, created_at,
        product_variants!inner ( sku, size, color_name,
          products!inner ( name_en, name_ar ) ),
        locations!inner ( name_en, name_ar ),
        created_by: profiles ( full_name )`,
        { count: 'exact' }
      )

      if (reasonFilter) {
        query = query.eq('reason', reasonFilter)
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE - 1)

      if (error) {
        toast.error(errorText(error))
        throw error
      }

      return {
        data: (data as MovementRow[]) || [],
        count: count || 0,
      }
    },
  })

  const totalPages = Math.ceil((result.count || 0) / ITEMS_PER_PAGE)

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Select
          value={reasonFilter}
          onChange={(e) => setReasonFilter(e.target.value as Enums<'movement_reason'>)}
        >
          <option value="">{t('common.all')}</option>
          <option value="initial">{t('inventory.reasonInitial')}</option>
          <option value="sale">{t('inventory.reasonSale')}</option>
          <option value="return">{t('inventory.reasonReturn')}</option>
          <option value="purchase">{t('inventory.reasonPurchase')}</option>
          <option value="adjustment">{t('inventory.reasonAdjustment')}</option>
          <option value="transfer_in">{t('inventory.reasonTransferIn')}</option>
          <option value="transfer_out">{t('inventory.reasonTransferOut')}</option>
          <option value="damage">{t('inventory.reasonDamage')}</option>
          <option value="stocktake">{t('inventory.reasonStocktake')}</option>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-8">
          <p className="text-moss">{t('common.loading')}</p>
        </div>
      ) : result.data.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title={t('common.none')}
          description={t('inventory.movementsDescription')}
        />
      ) : (
        <>
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>{t('inventory.table.product')}</TH>
                  <TH>{t('inventory.table.variant')}</TH>
                  <TH>{t('inventory.table.branch')}</TH>
                  <TH className="text-end">{t('common.total')}</TH>
                  <TH>{t('inventory.adjustReason')}</TH>
                  <TH>Note</TH>
                  <TH>By</TH>
                  <TH>When</TH>
                </TR>
              </THead>
              <TBody>
                {result.data.map(movement => {
                  const product = movement.product_variants?.products
                  const variant = movement.product_variants
                  const deltaNum = num(movement.delta)
                  const deltaClass = deltaNum > 0 ? 'text-success' : 'text-danger'

                  return (
                    <TR key={movement.id}>
                      <TD>{product ? getLocalized(product, 'name') : '-'}</TD>
                      <TD>
                        {variant?.color_name && (
                          <span>{variant.color_name} {variant.size && `/ ${variant.size}`}</span>
                        )}
                      </TD>
                      <TD>{movement.locations ? getLocalized(movement.locations, 'name') : '-'}</TD>
                      <TD className={`text-end font-medium ${deltaClass}`}>
                        {deltaNum > 0 ? '+' : ''}{deltaNum}
                      </TD>
                      <TD>
                        <Badge tone="neutral">{movement.reason}</Badge>
                      </TD>
                      <TD className="text-sm text-moss max-w-xs truncate">{movement.note || '-'}</TD>
                      <TD className="text-sm">{movement.created_by?.full_name || '-'}</TD>
                      <TD className="text-sm whitespace-nowrap">
                        {format(new Date(movement.created_at), 'dd MMM', {
                          locale: locale === 'ar' ? ar : undefined,
                        })}
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          </Card>

          {totalPages > 1 && (
            <Pagination
              page={page}
              pageCount={totalPages}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </div>
  )
}

function ValuationTab() {
  const t = useT()
  const errorText = useErrorText()
  const { locale } = useLocale()
  const getLocalized = useLocalized()

  const { data: valuations = [], isLoading: loadingValuation } = useQuery({
    queryKey: ['v_inventory_valuation'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_inventory_valuation')
        .select('*')

      if (error) {
        toast.error(errorText(error))
        return []
      }
      return (data as Views<'v_inventory_valuation'>[]) || []
    },
  })

  const { data: lowStock = [], isLoading: loadingLowStock } = useQuery({
    queryKey: ['v_low_stock'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_low_stock')
        .select('*')

      if (error) {
        toast.error(errorText(error))
        return []
      }
      return (data as Views<'v_low_stock'>[]) || []
    },
  })

  return (
    <div className="space-y-6">
      {loadingValuation ? (
        <div className="text-center py-8">
          <p className="text-moss">{t('common.loading')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {valuations.map((val, idx) => (
            <Card key={idx}>
              <CardBody className="space-y-3">
                <p className="font-bold text-ink">{val.location_name_en || '-'}</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-moss">{t('dashboard.units')}</span>
                    <span className="font-medium text-ink">{num(val.units)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-moss">Cost Value</span>
                    <span className="font-medium text-ink">
                      {formatMoney(val.cost_value, locale)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-moss">Retail Value</span>
                    <span className="font-medium text-ink">
                      {formatMoney(val.retail_value, locale)}
                    </span>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <div>
        <h3 className="text-lg font-bold text-ink mb-4">{t('dashboard.lowStock')}</h3>
        {loadingLowStock ? (
          <div className="text-center py-8">
            <p className="text-moss">{t('common.loading')}</p>
          </div>
        ) : lowStock.length === 0 ? (
          <EmptyState
            icon={TrendingDown}
            title={t('common.none')}
            description="No items below reorder points"
          />
        ) : (
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>{t('inventory.table.product')}</TH>
                  <TH>{t('inventory.table.variant')}</TH>
                  <TH>{t('inventory.table.branch')}</TH>
                  <TH className="text-end">{t('inventory.table.available')}</TH>
                  <TH className="text-end">{t('inventory.table.reorderPoint')}</TH>
                  <TH className="text-end">Reorder Qty</TH>
                </TR>
              </THead>
              <TBody>
                {lowStock.map((item, idx) => (
                  <TR key={idx}>
                    <TD>{item.product_name_en || '-'}</TD>
                    <TD>
                      {item.color_name && (
                        <span>
                          {item.color_name}
                          {item.size && ` / ${item.size}`}
                        </span>
                      )}
                    </TD>
                    <TD>{item.location_name_en || '-'}</TD>
                    <TD className="text-end">
                      <Badge tone={num(item.available || 0) <= 0 ? 'danger' : 'warning'}>
                        {num(item.available)}
                      </Badge>
                    </TD>
                    <TD className="text-end">{num(item.reorder_point)}</TD>
                    <TD className="text-end">{num(item.reorder_qty)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  )
}

