import { useState, useMemo, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, Tables, Enums } from '@/lib/supabase'
import { useT, useLocale, useLocalized } from '@/lib/i18n'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { useErrorText } from '@/lib/errors'
import { useAuth, useCan } from '@/lib/auth'
import { formatMoney, num } from '@/lib/money'
import { cn } from '@/lib/utils'
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
  Tabs,
  ConfirmDialog,
  Button,
} from '@/components/ui'
import { Shirt, Grid, List, Trash2 } from 'lucide-react'

const ITEMS_PER_PAGE = 24

type Product = Tables<'products'>
type ProductStatus = Enums<'product_status'>

export function ProductsPage() {
  const navigate = useNavigate()
  const t = useT()
  useDocumentTitle(t('nav.products'))
  const errorText = useErrorText()
  const { locale, isRTL } = useLocale()
  const { profile } = useAuth()
  const can = useCan()
  const getLocalized = useLocalized()
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<ProductStatus | ''>('')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [viewMode, setViewMode] = useState<'table' | 'grid'>(() => {
    if (typeof window === 'undefined') return 'table'
    try {
      return (localStorage.getItem('vitality.products.viewMode') as 'table' | 'grid') || 'table'
    } catch {
      return 'table'
    }
  })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmDialog, setConfirmDialog] = useState<{
    action: 'publish' | 'unpublish' | 'archive' | null
    count: number
  }>({ action: null, count: 0 })

  // Save view mode
  useEffect(() => {
    try {
      localStorage.setItem('vitality.products.viewMode', viewMode)
    } catch {
      // Storage can be unavailable (private browsing, quota) — the view
      // mode preference just won't persist; not worth surfacing to the user.
    }
  }, [viewMode])

  // Sanitize search
  const sanitizedSearch = useMemo(() => {
    return searchTerm.replace(/[,()."\\%_*]/g, '').trim()
  }, [searchTerm])

  // Fetch categories
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name_en, name_ar')
        .eq('is_active', true)
        .order('position', { ascending: true })

      if (error) throw error
      return data || []
    },
  })

  // Fetch products with filters
  const { data: result = { data: [], count: 0 }, isLoading, error } = useQuery({
    queryKey: [
      'products',
      page,
      categoryFilter,
      statusFilter,
      lowStockOnly,
      sanitizedSearch,
    ],
    queryFn: async () => {
      let query = supabase
        .from('products')
        // cost_price deliberately omitted — cost lives in product_costs now and
        // this list never displayed it.
        .select('id, name_en, name_ar, category_id, price, status, created_at', {
          count: 'exact',
        })

      if (statusFilter) {
        query = query.eq('status', statusFilter)
      }

      if (categoryFilter) {
        query = query.eq('category_id', categoryFilter)
      }

      if (sanitizedSearch) {
        query = query.or(
          `name_en.ilike.%${sanitizedSearch}%,name_ar.ilike.%${sanitizedSearch}%`
        )
      }

      query = query.order('created_at', { ascending: false })
        .range((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE - 1)

      const { data, error, count } = await query

      if (error) throw error

      return {
        data: data || [],
        count: count || 0,
      }
    },
  })

  // Stock per product — summed from v_variant_stock (available units across all
  // variants) so the list can show a plain in-stock / low-stock / out-of-stock
  // badge instead of making staff dig into each product to find out.
  const { data: stockByProduct = {} } = useQuery({
    queryKey: ['productStockSummary', result.data.map(p => p.id)],
    queryFn: async () => {
      if (result.data.length === 0) return {}
      const productIds = result.data.map(p => p.id)
      const { data, error } = await supabase
        .from('v_variant_stock')
        .select('product_id, available, reorder_point')
        .in('product_id', productIds)

      if (error) throw error

      const summary: Record<string, { available: number; reorderPoint: number }> = {}
      for (const row of data || []) {
        const pid = row.product_id as string
        if (!summary[pid]) summary[pid] = { available: 0, reorderPoint: 0 }
        summary[pid].available += row.available ?? 0
        summary[pid].reorderPoint = Math.max(summary[pid].reorderPoint, row.reorder_point ?? 0)
      }
      return summary
    },
    enabled: result.data.length > 0,
  })

  const stockStatus = useCallback(
    (productId: string): 'out' | 'low' | 'in' | 'unknown' => {
      const s = stockByProduct[productId]
      if (!s) return 'unknown'
      if (s.available <= 0) return 'out'
      if (s.reorderPoint > 0 && s.available <= s.reorderPoint) return 'low'
      return 'in'
    },
    [stockByProduct]
  )

  const filteredByStock = useMemo(() => {
    if (!lowStockOnly) return result.data
    return result.data.filter(p => {
      const status = stockStatus(p.id)
      return status === 'low' || status === 'out'
    })
  }, [result.data, lowStockOnly, stockStatus])

  // Fetch variant counts for each product
  const { data: variantCounts = {} } = useQuery({
    queryKey: ['productVariantCounts', result.data.map(p => p.id)],
    queryFn: async () => {
      if (result.data.length === 0) return {}

      const productIds = result.data.map(p => p.id)
      const { data, error } = await supabase
        .from('product_variants')
        .select('product_id, id')

      if (error) throw error

      const counts: Record<string, number> = {}
      productIds.forEach(id => {
        counts[id] = (data || []).filter(v => v.product_id === id).length
      })
      return counts
    },
  })

  // Bulk actions mutation
  const bulkActionMutation = useMutation({
    mutationFn: async (params: {
      action: 'publish' | 'unpublish' | 'archive'
      ids: string[]
    }) => {
      const { action, ids } = params

      const statusMap = {
        publish: 'active' as const,
        unpublish: 'draft' as const,
        archive: 'archived' as const,
      }

      const { error } = await supabase
        .from('products')
        .update({ status: statusMap[action] })
        .in('id', ids)

      if (error) throw error
    },
    onSuccess: (_, { action, ids }) => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success(t(`products.${action}`))
      setSelectedIds(new Set())
      setConfirmDialog({ action: null, count: 0 })
    },
    onError: (error) => {
      toast.error(errorText(error))
    },
  })

  // Handle bulk action
  const handleBulkAction = (action: 'publish' | 'unpublish' | 'archive') => {
    if (selectedIds.size === 0) {
      toast.error(t('products.noSelection'))
      return
    }
    setConfirmDialog({ action, count: selectedIds.size })
  }

  const handleConfirmAction = () => {
    if (confirmDialog.action && selectedIds.size > 0) {
      bulkActionMutation.mutate({
        action: confirmDialog.action,
        ids: Array.from(selectedIds),
      })
    }
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(result.data.map(p => p.id)))
    } else {
      setSelectedIds(new Set())
    }
  }

  const handleSelectProduct = (id: string, checked: boolean) => {
    const newSet = new Set(selectedIds)
    if (checked) {
      newSet.add(id)
    } else {
      newSet.delete(id)
    }
    setSelectedIds(newSet)
  }

  // Guard: check permission
  const canEditProducts = can('products')
  if (!canEditProducts) {
    return null
  }

  const totalPages = Math.ceil((result.count || 0) / ITEMS_PER_PAGE)
  const allSelected = result.data.length > 0 && selectedIds.size === result.data.length

  if (error) {
    return (
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-3xl font-display text-ink mb-2">{t('nav.products')}</h1>
          <p className="text-moss">{t('page.productsDescription')}</p>
        </div>
        <Card>
          <CardBody>
            <p className="text-center text-moss">{t('common.error')}</p>
          </CardBody>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display text-ink mb-2">{t('nav.products')}</h1>
          <p className="text-moss">{t('page.productsDescription')}</p>
        </div>
        <Button onClick={() => navigate('/admin/products/new')}>
          {t('products.createNew')}
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>{t('products.filters')}</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            <SearchInput
              value={searchTerm}
              onValueChange={(value) => {
                setSearchTerm(value)
                setPage(1)
              }}
              placeholder={t('products.search')}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Select
                label={t('products.category')}
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value)
                  setPage(1)
                }}
              >
                <option value="">{t('common.all')}</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {getLocalized(cat, 'name')}
                  </option>
                ))}
              </Select>

              <Select
                label={t('products.status')}
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter((e.target.value || '') as ProductStatus | '')
                  setPage(1)
                }}
              >
                <option value="">{t('common.all')}</option>
                <option value="active">{t('productStatus.active')}</option>
                <option value="draft">{t('productStatus.draft')}</option>
                <option value="archived">{t('productStatus.archived')}</option>
              </Select>

              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={lowStockOnly}
                    onChange={(e) => {
                      setLowStockOnly(e.target.checked)
                      setPage(1)
                    }}
                    className="rounded border-sand"
                  />
                  <span className="text-sm font-medium text-ink">
                    {t('products.lowStock')}
                  </span>
                </label>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <Card className="border border-sand bg-sand/30">
          <CardBody>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-ink">
                {selectedIds.size} {selectedIds.size === 1 ? 'product' : 'products'} selected
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => handleBulkAction('publish')}
                >
                  {t('products.bulkPublish')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => handleBulkAction('unpublish')}
                >
                  {t('products.bulkUnpublish')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => handleBulkAction('archive')}
                >
                  {t('products.bulkArchive')}
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* View Mode Tabs */}
      <div className="flex justify-end">
        <Tabs
          tabs={[
            { id: 'table', label: t('products.viewTable'), icon: List },
            { id: 'grid', label: t('products.viewGrid'), icon: Grid },
          ]}
          active={viewMode}
          onChange={(mode) => setViewMode(mode as 'table' | 'grid')}
        />
      </div>

      {/* Products Table/Grid */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredByStock.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Shirt}
                title={t('products.noResults')}
                description=""
              />
            </div>
          ) : viewMode === 'table' ? (
            // Table View
            <>
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <TR>
                      <TH className="w-12">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={(e) => handleSelectAll(e.target.checked)}
                          className="rounded border-sand"
                        />
                      </TH>
                      <TH>{t('products.table.name')}</TH>
                      <TH>{t('products.table.category')}</TH>
                      <TH>{t('products.table.price')}</TH>
                      <TH>{t('products.table.variants')}</TH>
                      <TH>{t('products.table.stock')}</TH>
                      <TH>{t('products.table.status')}</TH>
                      <TH>{t('common.actions')}</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {filteredByStock.map((product) => (
                      <TR
                        key={product.id}
                        className="hover:bg-sand/30 transition-colors"
                      >
                        <TD>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(product.id)}
                            onChange={(e) => handleSelectProduct(product.id, e.target.checked)}
                            className="rounded border-sand"
                          />
                        </TD>
                        <TD
                          className="font-medium cursor-pointer hover:text-ink"
                          onClick={() => navigate(`/admin/products/${product.id}`)}
                        >
                          {getLocalized(product, 'name')}
                        </TD>
                        <TD className="text-sm text-moss">
                          {product.category_id
                            ? getLocalized(
                                categories.find(c => c.id === product.category_id) || { name_en: '', name_ar: '' },
                                'name'
                              ) || t('common.none')
                            : t('common.none')}
                        </TD>
                        <TD className="font-medium">
                          <span dir="ltr">
                            {formatMoney(product.price, locale)}
                          </span>
                        </TD>
                        <TD className="text-center">
                          {variantCounts[product.id] || 0}
                        </TD>
                        <TD>
                          {(() => {
                            const status = stockStatus(product.id)
                            if (status === 'unknown') {
                              return <span className="text-xs text-moss">—</span>
                            }
                            const label =
                              status === 'out'
                                ? t('products.stockOut')
                                : status === 'low'
                                  ? t('products.stockLow')
                                  : t('products.stockIn')
                            const tone = status === 'out' ? 'danger' : status === 'low' ? 'warning' : 'success'
                            return (
                              <Badge tone={tone}>
                                {label}
                                {stockByProduct[product.id] !== undefined && (
                                  <span className="ms-1 opacity-70">
                                    ({stockByProduct[product.id].available})
                                  </span>
                                )}
                              </Badge>
                            )
                          })()}
                        </TD>
                        <TD>
                          <Badge
                            tone={
                              product.status === 'active'
                                ? 'success'
                                : product.status === 'archived'
                                  ? 'neutral'
                                  : 'warning'
                            }
                          >
                            {t(`productStatus.${product.status}`)}
                          </Badge>
                        </TD>
                        <TD>
                          <button
                            onClick={() => navigate(`/admin/products/${product.id}`)}
                            className="text-sm font-medium text-ink hover:underline"
                          >
                            {t('common.edit')}
                          </button>
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
          ) : (
            // Grid View
            <>
              <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredByStock.map((product) => (
                  <div
                    key={product.id}
                    className="border border-sand rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer group"
                    onClick={() => navigate(`/admin/products/${product.id}`)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(product.id)}
                        onChange={(e) => {
                          e.stopPropagation()
                          handleSelectProduct(product.id, e.target.checked)
                        }}
                        className="rounded border-sand"
                      />
                      <Badge
                        tone={
                          product.status === 'active'
                            ? 'success'
                            : product.status === 'archived'
                              ? 'neutral'
                              : 'warning'
                        }
                      >
                        {t(`productStatus.${product.status}`)}
                      </Badge>
                    </div>

                    {/* Placeholder Image */}
                    <div className="mb-3 aspect-square bg-sand/30 rounded-lg flex items-center justify-center">
                      <Shirt className="h-8 w-8 text-moss" />
                    </div>

                    <h3 className="font-medium text-ink text-sm mb-1 line-clamp-2">
                      {getLocalized(product, 'name')}
                    </h3>

                    <p className="text-xs text-moss mb-2">
                      {variantCounts[product.id] || 0} variants
                    </p>

                    {(() => {
                      const status = stockStatus(product.id)
                      if (status === 'unknown') return null
                      const label =
                        status === 'out'
                          ? t('products.stockOut')
                          : status === 'low'
                            ? t('products.stockLow')
                            : t('products.stockIn')
                      const tone = status === 'out' ? 'danger' : status === 'low' ? 'warning' : 'success'
                      return (
                        <Badge tone={tone} className="mb-2">
                          {label}
                        </Badge>
                      )
                    })()}

                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-ink" dir="ltr">
                        {formatMoney(product.price, locale)}
                      </span>
                    </div>
                  </div>
                ))}
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

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmDialog.action !== null}
        title={t('common.confirm')}
        message={
          confirmDialog.action === 'publish'
            ? t('products.publishConfirm', { count: confirmDialog.count })
            : confirmDialog.action === 'unpublish'
              ? t('products.unpublishConfirm', { count: confirmDialog.count })
              : t('products.archiveConfirm', { count: confirmDialog.count })
        }
        confirmLabel={t('common.confirm')}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmDialog({ action: null, count: 0 })}
        loading={bulkActionMutation.isPending}
      />
    </div>
  )
}
