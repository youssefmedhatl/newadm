import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, type Enums, type Tables } from '@/lib/supabase'
import { useT, useLocale, useLocalized } from '@/lib/i18n'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { useErrorText } from '@/lib/errors'
import { useCan } from '@/lib/auth'
import { formatMoney, num } from '@/lib/money'
import { toast } from 'sonner'
import type { Json } from '@/lib/database.types'
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
  Select,
  Input,
  Button,
  Modal,
  Tabs,
  EmptyState,
  Pagination,
  Textarea,
} from '@/components/ui'
import { Truck, Plus, Edit2, Trash2, Check } from 'lucide-react'
import { format } from 'date-fns'
import { ar } from 'date-fns/locale'

const ITEMS_PER_PAGE = 25

type Supplier = Tables<'suppliers'>

type PurchaseOrder = Tables<'purchase_orders'> & {
  suppliers?: Supplier | null
  locations?: {
    id: string
    name_en: string
    name_ar: string
  } | null
  created_by?: {
    full_name: string | null
  } | null
}

export function PurchasingPage() {
  const t = useT()
  useDocumentTitle(t('nav.purchasing'))
  const can = useCan()

  const [activeTab, setActiveTab] = useState('suppliers')

  if (!can('purchasing')) {
    return (
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-3xl font-display text-ink mb-2">{t('nav.purchasing')}</h1>
          <p className="text-moss">{t('page.purchasingDescription')}</p>
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
        <h1 className="text-3xl font-display text-ink mb-2">{t('nav.purchasing')}</h1>
        <p className="text-moss">{t('page.purchasingDescription')}</p>
      </div>

      <Tabs
        tabs={[
          { id: 'suppliers', label: t('purchasing.suppliers') },
          { id: 'orders', label: t('purchasing.purchaseOrders') },
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'suppliers' && <SuppliersTab />}
      {activeTab === 'orders' && <PurchaseOrdersTab />}
    </div>
  )
}

function SuppliersTab() {
  const t = useT()
  const errorText = useErrorText()
  const queryClient = useQueryClient()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<Partial<Supplier>>({
    name: '',
    contact_name: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
    is_active: true,
  })

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        toast.error(errorText(error))
        return []
      }
      return (data as Supplier[]) || []
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!formData.name?.trim()) {
        throw new Error(t('purchasing.supplierNameRequired'))
      }

      if (editingId) {
        const { error } = await supabase
          .from('suppliers')
          .update(formData)
          .eq('id', editingId)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('suppliers')
          .insert([formData as Tables<'suppliers'>])

        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success(t('common.saved'))
      setEditingId(null)
      setFormData({
        name: '',
        contact_name: '',
        phone: '',
        email: '',
        address: '',
        notes: '',
        is_active: true,
      })
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
    },
    onError: (error) => {
      toast.error(errorText(error))
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('suppliers')
        .update({ is_active: false })
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      toast.success(t('common.saved'))
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
    },
    onError: (error) => {
      toast.error(errorText(error))
    },
  })

  const handleEdit = (supplier: Supplier) => {
    setEditingId(supplier.id)
    setFormData(supplier)
  }

  const handleNew = () => {
    setEditingId(null)
    setFormData({
      name: '',
      contact_name: '',
      phone: '',
      email: '',
      address: '',
      notes: '',
      is_active: true,
    })
  }

  if (isLoading) {
    return <div className="text-center py-8"><p className="text-moss">{t('common.loading')}</p></div>
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={handleNew}>
          <Plus className="w-4 h-4" />
          {t('purchasing.createSupplier')}
        </Button>
      </div>

      {suppliers.length === 0 ? (
        <EmptyState
          icon={Truck}
          title={t('purchasing.noSuppliers')}
          description="Add your first supplier"
        />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>{t('purchasing.supplier')}</TH>
                <TH>{t('purchasing.contactName')}</TH>
                <TH>{t('purchasing.phone')}</TH>
                <TH>{t('purchasing.email')}</TH>
                <TH>{t('common.status')}</TH>
                <TH>{t('common.actions')}</TH>
              </TR>
            </THead>
            <TBody>
              {suppliers.map(supplier => (
                <TR key={supplier.id}>
                  <TD className="font-medium">{supplier.name}</TD>
                  <TD>{supplier.contact_name || '-'}</TD>
                  <TD dir="ltr">{supplier.phone || '-'}</TD>
                  <TD>{supplier.email || '-'}</TD>
                  <TD>
                    <Badge tone={supplier.is_active ? 'success' : 'warning'}>
                      {supplier.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TD>
                  <TD className="space-x-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleEdit(supplier)}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    {supplier.is_active && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => deactivateMutation.mutate(supplier.id)}
                        disabled={deactivateMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      {editingId !== null && (
        <Modal open={true} onClose={() => setEditingId(null)} size="sm">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1">
                {t('purchasing.supplier')} *
              </label>
              <Input
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1">
                {t('purchasing.contactName')}
              </label>
              <Input
                value={formData.contact_name || ''}
                onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1">
                {t('purchasing.phone')}
              </label>
              <Input
                value={formData.phone || ''}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                dir="ltr"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1">
                {t('purchasing.email')}
              </label>
              <Input
                type="email"
                value={formData.email || ''}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1">
                {t('purchasing.address')}
              </label>
              <Input
                value={formData.address || ''}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1">
                {t('purchasing.notes')}
              </label>
              <Input
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.is_active !== false}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm text-ink">{t('purchasing.active')}</span>
            </label>

            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setEditingId(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
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

function PurchaseOrdersTab() {
  const t = useT()
  const errorText = useErrorText()
  const { locale } = useLocale()
  const getLocalized = useLocalized()
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<Enums<'po_status'> | ''>('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showReceiveModal, setShowReceiveModal] = useState(false)
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null)
  const [editingPO, setEditingPO] = useState<PurchaseOrder | null>(null)

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('is_active', true)

      if (error) return []
      return (data as Supplier[]) || []
    },
  })

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('locations')
        .select('id, name_en, name_ar')
        .eq('is_active', true)

      if (error) return []
      return data || []
    },
  })

  const { data: result = { data: [], count: 0 }, isLoading } = useQuery({
    queryKey: ['purchase_orders', page, statusFilter, supplierFilter],
    queryFn: async () => {
      let query = supabase.from('purchase_orders').select(
        `*,
        suppliers ( * ),
        locations ( id, name_en, name_ar ),
        created_by: profiles ( full_name )`,
        { count: 'exact' }
      )

      if (statusFilter) {
        query = query.eq('status', statusFilter)
      }

      if (supplierFilter) {
        query = query.eq('supplier_id', supplierFilter)
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE - 1)

      if (error) {
        toast.error(errorText(error))
        throw error
      }

      return {
        data: (data as PurchaseOrder[]) || [],
        count: count || 0,
      }
    },
  })

  const totalPages = Math.ceil((result.count || 0) / ITEMS_PER_PAGE)

  const getStatusBadgeTone = (status: Enums<'po_status'>) => {
    if (status === 'draft') return 'neutral'
    if (status === 'ordered') return 'info'
    if (status === 'partially_received') return 'warning'
    if (status === 'received') return 'success'
    if (status === 'cancelled') return 'danger'
    return 'neutral'
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setShowCreateModal(true); setEditingPO(null); }}>
          <Plus className="w-4 h-4" />
          {t('purchasing.createPO')}
        </Button>
      </div>

      <div className="flex gap-2">
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as Enums<'po_status'>)}
        >
          <option value="">{t('common.all')}</option>
          <option value="draft">{t('purchasing.poStatusDraft')}</option>
          <option value="ordered">{t('purchasing.poStatusOrdered')}</option>
          <option value="partially_received">{t('purchasing.poStatusPartiallyReceived')}</option>
          <option value="received">{t('purchasing.poStatusReceived')}</option>
          <option value="cancelled">{t('purchasing.poStatusCancelled')}</option>
        </Select>
        <Select
          value={supplierFilter}
          onChange={(e) => setSupplierFilter(e.target.value)}
        >
          <option value="">{t('common.all')}</option>
          {suppliers.map(supplier => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-8">
          <p className="text-moss">{t('common.loading')}</p>
        </div>
      ) : result.data.length === 0 ? (
        <EmptyState
          icon={Truck}
          title={t('purchasing.noPurchaseOrders')}
          description="Create your first purchase order"
        />
      ) : (
        <>
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>{t('purchasing.poTable.reference')}</TH>
                  <TH>{t('purchasing.poTable.supplier')}</TH>
                  <TH>{t('purchasing.poTable.branch')}</TH>
                  <TH>{t('purchasing.poTable.status')}</TH>
                  <TH>{t('purchasing.poTable.expectedDate')}</TH>
                  <TH className="text-end">{t('purchasing.poTable.total')}</TH>
                  <TH>{t('common.actions')}</TH>
                </TR>
              </THead>
              <TBody>
                {result.data.map(po => (
                  <TR key={po.id}>
                    <TD dir="ltr" className="font-mono text-sm">
                      {po.reference}
                    </TD>
                    <TD>{po.suppliers?.name || '-'}</TD>
                    <TD>{po.locations ? getLocalized(po.locations, 'name') : '-'}</TD>
                    <TD>
                      <Badge tone={getStatusBadgeTone(po.status)}>
                        {po.status}
                      </Badge>
                    </TD>
                    <TD className="text-sm">
                      {po.expected_at
                        ? format(new Date(po.expected_at), 'dd MMM yyyy', {
                            locale: locale === 'ar' ? ar : undefined,
                          })
                        : '-'}
                    </TD>
                    <TD className="text-end font-medium">
                      {formatMoney(po.total, locale)}
                    </TD>
                    <TD className="space-x-2">
                      {po.status === 'draft' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setEditingPO(po)
                            setShowCreateModal(true)
                          }}
                        >
                          <Edit2 className="w-4 h-4" />
                          {t('common.edit')}
                        </Button>
                      )}
                      {po.status !== 'received' && po.status !== 'cancelled' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setSelectedPO(po)
                            setShowReceiveModal(true)
                          }}
                        >
                          <Check className="w-4 h-4" />
                          {t('purchasing.receive')}
                        </Button>
                      )}
                    </TD>
                  </TR>
                ))}
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

      {showCreateModal && (
        <CreatePOModal
          open={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          suppliers={suppliers}
          locations={locations}
          editingPO={editingPO}
          onSuccess={() => {
            setShowCreateModal(false)
            setEditingPO(null)
            queryClient.invalidateQueries({ queryKey: ['purchase_orders'] })
          }}
        />
      )}

      {showReceiveModal && selectedPO && (
        <ReceivePOModal
          open={showReceiveModal}
          onClose={() => setShowReceiveModal(false)}
          po={selectedPO}
          onSuccess={() => {
            setShowReceiveModal(false)
            setSelectedPO(null)
            queryClient.invalidateQueries({ queryKey: ['purchase_orders'] })
            queryClient.invalidateQueries({ queryKey: ['inventory_levels'] })
            queryClient.invalidateQueries({ queryKey: ['dashboard'] })
          }}
        />
      )}
    </div>
  )
}

interface CreatePOModalProps {
  open: boolean
  onClose: () => void
  suppliers: Supplier[]
  locations: Array<{ id: string; name_en: string; name_ar: string }>
  editingPO: PurchaseOrder | null
  onSuccess: () => void
}

function CreatePOModal({
  open,
  onClose,
  suppliers,
  locations,
  editingPO,
  onSuccess,
}: CreatePOModalProps) {
  const t = useT()
  const errorText = useErrorText()
  const { locale } = useLocale()
  const getLocalized = useLocalized()
  const queryClient = useQueryClient()

  const [supplierId, setSupplierId] = useState(editingPO?.supplier_id || '')
  const [locationId, setLocationId] = useState(editingPO?.location_id || '')
  const [expectedDate, setExpectedDate] = useState(
    editingPO?.expected_at ? new Date(editingPO.expected_at).toISOString().split('T')[0] : ''
  )
  const [notes, setNotes] = useState(editingPO?.notes || '')
  const [shippingCost, setShippingCost] = useState(
    editingPO?.shipping_cost ? String(editingPO.shipping_cost) : '0'
  )
  const [items, setItems] = useState<
    Array<{ variant_id: string; quantity: number; unit_cost: string }>
  >([])

  const { data: variants = [] } = useQuery({
    queryKey: ['product_variants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_variants')
        .select('id, sku, size, color_name, products!inner(id, name_en, name_ar)')
        .eq('products.status', 'active')

      if (error) return []
      return data || []
    },
  })

  const { data: existingItems } = useQuery({
    queryKey: ['po_items_edit', editingPO?.id],
    queryFn: async () => {
      if (!editingPO) return []
      const { data, error } = await supabase
        .from('purchase_order_items')
        .select('variant_id, quantity_ordered, unit_cost')
        .eq('purchase_order_id', editingPO.id)

      if (error) return []
      return data || []
    },
    enabled: !!editingPO,
  })

  // Load the PO's existing line items into the editable form once both the
  // selected PO and its items have arrived. Tracked during render (matching
  // the old effect's [editingPO?.id, existingItems] deps) instead of in a
  // useEffect, to skip the extra render pass.
  const [prevEditingKey, setPrevEditingKey] = useState<{
    id: string | undefined
    items: typeof existingItems
  }>({ id: editingPO?.id, items: existingItems })
  if (editingPO?.id !== prevEditingKey.id || existingItems !== prevEditingKey.items) {
    setPrevEditingKey({ id: editingPO?.id, items: existingItems })
    if (editingPO && existingItems) {
      setItems(
        existingItems.map(i => ({
          variant_id: i.variant_id,
          quantity: i.quantity_ordered,
          unit_cost: String(i.unit_cost),
        }))
      )
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!supplierId || !locationId || items.length === 0) {
        throw new Error(t('purchasing.errorRequiredFieldsMissing'))
      }

      // Rule 10: never let an empty variant_id or non-positive quantity reach
      // the database — Postgres would throw a raw "invalid input syntax for
      // type uuid" or violate the quantity_ordered > 0 CHECK.
      if (items.some(item => !item.variant_id || item.quantity < 1)) {
        throw new Error(t('purchasing.errorInvalidItemRow'))
      }

      const reference = editingPO?.reference || `PO-${Date.now()}`
      const subtotal = items.reduce((sum, item) => sum + num(item.unit_cost) * item.quantity, 0)
      const shippingCostNum = num(shippingCost)
      const total = subtotal + shippingCostNum

      if (editingPO) {
        // Rule 10: a delete() followed by an insert() is NOT atomic over
        // PostgREST. Capture the old row ids, insert the new rows first, and
        // only then delete the old ones — so a failed insert leaves the PO's
        // existing line items intact instead of wiping them. There is no
        // unique (purchase_order_id, variant_id) constraint, so transiently
        // holding both sets of rows is safe.
        const { data: oldRows, error: oldErr } = await supabase
          .from('purchase_order_items')
          .select('id')
          .eq('purchase_order_id', editingPO.id)

        if (oldErr) throw oldErr

        const itemsToInsert = items.map(item => ({
          purchase_order_id: editingPO.id,
          variant_id: item.variant_id,
          quantity_ordered: item.quantity,
          unit_cost: parseFloat(item.unit_cost),
          quantity_received: 0,
        }))

        const { error: itemsError } = await supabase
          .from('purchase_order_items')
          .insert(itemsToInsert)

        if (itemsError) throw itemsError

        const oldIds = (oldRows ?? []).map(r => r.id)
        if (oldIds.length > 0) {
          const { error: delError } = await supabase
            .from('purchase_order_items')
            .delete()
            .in('id', oldIds)

          if (delError) throw delError
        }

        const { error } = await supabase
          .from('purchase_orders')
          .update({
            supplier_id: supplierId,
            location_id: locationId,
            expected_at: expectedDate || null,
            notes: notes || null,
            subtotal,
            shipping_cost: shippingCostNum,
            total,
          })
          .eq('id', editingPO.id)

        if (error) throw error
      } else {
        const { data: poData, error: poError } = await supabase
          .from('purchase_orders')
          .insert({
            reference,
            supplier_id: supplierId,
            location_id: locationId,
            expected_at: expectedDate || null,
            notes: notes || null,
            status: 'draft',
            subtotal,
            shipping_cost: shippingCostNum,
            total,
          })
          .select()
          .single()

        if (poError) throw poError

        const itemsToInsert = items.map(item => ({
          purchase_order_id: poData.id,
          variant_id: item.variant_id,
          quantity_ordered: item.quantity,
          unit_cost: parseFloat(item.unit_cost),
          quantity_received: 0,
        }))

        const { error: itemsError } = await supabase
          .from('purchase_order_items')
          .insert(itemsToInsert)

        if (itemsError) throw itemsError
      }
    },
    onSuccess: () => {
      toast.success(t('common.saved'))
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] })
      onSuccess()
    },
    onError: (error) => {
      toast.error(errorText(error))
    },
  })

  const addItem = () => {
    setItems([...items, { variant_id: '', quantity: 1, unit_cost: '0' }])
  }

  const updateItem = (
    idx: number,
    field: 'variant_id' | 'quantity' | 'unit_cost',
    value: string | number
  ) => {
    const updated = [...items]
    updated[idx] = { ...updated[idx], [field]: value }
    setItems(updated)
  }

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx))
  }

  const subtotal = items.reduce((sum, item) => sum + num(item.unit_cost) * item.quantity, 0)
  const total = subtotal + num(shippingCost)

  // Rule 10: keep Save disabled until every required field is valid, so a
  // blank variant dropdown can never be submitted.
  const canSave =
    !!supplierId &&
    !!locationId &&
    items.length > 0 &&
    items.every(item => !!item.variant_id && item.quantity >= 1)

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-ink">
          {editingPO ? t('purchasing.editPO') : t('purchasing.createPO')}
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1">
              {t('purchasing.poSupplier')} *
            </label>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">{t('purchasing.poSupplier')}</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1">
              {t('purchasing.poDestinationBranch')} *
            </label>
            <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">{t('purchasing.poDestinationBranch')}</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>
                  {getLocalized(loc, 'name')}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-ink mb-1">
            {t('purchasing.poExpectedDate')}
          </label>
          <Input
            type="date"
            value={expectedDate}
            onChange={(e) => setExpectedDate(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink mb-1">
            {t('purchasing.poNotes')}
          </label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('purchasing.poNotes')}
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-medium text-ink">{t('purchasing.poItems')} *</label>
            <Button size="sm" onClick={addItem}>
              <Plus className="w-4 h-4" />
              {t('common.add')}
            </Button>
          </div>

          {items.length > 0 && (
            <Card>
              <CardBody className="space-y-3">
                {items.map((item, idx) => {
                  const variant = variants.find(v => v.id === item.variant_id)
                  const lineTotal = num(item.unit_cost) * item.quantity

                  return (
                    <div key={idx} className="flex gap-2 pb-3 border-b border-sand last:border-b-0">
                      <div className="flex-1">
                        <Select
                          value={item.variant_id}
                          onChange={(e) => updateItem(idx, 'variant_id', e.target.value)}
                        >
                          <option value="">{t('purchasing.poVariant')}</option>
                          {variants.map(v => (
                            <option key={v.id} value={v.id}>
                              {v.products ? getLocalized(v.products, 'name') : ''} - {v.color_name} {v.size && `/ ${v.size}`}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                        className="w-20"
                        min="1"
                      />
                      <Input
                        type="number"
                        value={item.unit_cost}
                        onChange={(e) => updateItem(idx, 'unit_cost', e.target.value)}
                        className="w-24"
                        step="0.01"
                        placeholder="0.00"
                      />
                      <div className="w-24 text-end font-medium text-ink">
                        {formatMoney(lineTotal, locale)}
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => removeItem(idx)}
                      >
                        {t('common.delete')}
                      </Button>
                    </div>
                  )
                })}
              </CardBody>
            </Card>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-ink mb-1">
            {t('purchasing.poShippingCost')}
          </label>
          <Input
            type="number"
            value={shippingCost}
            onChange={(e) => setShippingCost(e.target.value)}
            step="0.01"
            placeholder="0.00"
          />
        </div>

        <div className="bg-sand p-3 rounded-lg space-y-1">
          <div className="flex justify-between text-sm text-moss">
            <span>{t('purchasing.poSubtotal')}</span>
            <span>{formatMoney(subtotal, locale)}</span>
          </div>
          <div className="flex justify-between text-sm text-moss">
            <span>{t('purchasing.poShippingCost')}</span>
            <span>{formatMoney(num(shippingCost), locale)}</span>
          </div>
          <div className="flex justify-between text-2xl font-bold text-ink pt-1 border-t border-sand">
            <span>{t('purchasing.poTotal')}</span>
            <span>{formatMoney(total, locale)}</span>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !canSave}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

interface ReceivePOModalProps {
  open: boolean
  onClose: () => void
  po: PurchaseOrder
  onSuccess: () => void
}

function ReceivePOModal({ open, onClose, po, onSuccess }: ReceivePOModalProps) {
  const t = useT()
  const errorText = useErrorText()
  const getLocalized = useLocalized()
  const queryClient = useQueryClient()

  const [receivingNow, setReceivingNow] = useState<Record<string, number>>({})

  const { data: items = [] } = useQuery({
    queryKey: ['po_items', po.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_order_items')
        .select(
          `*,
          product_variants ( id, sku, size, color_name, products(id, name_en, name_ar) )`
        )
        .eq('purchase_order_id', po.id)

      if (error) return []
      return data || []
    },
  })

  const receiveMutation = useMutation({
    mutationFn: async () => {
      const lines = items
        .filter(item => receivingNow[item.id] && receivingNow[item.id] > 0)
        .map(item => ({
          item_id: item.id,
          quantity: receivingNow[item.id],
        }))

      if (lines.length === 0) throw new Error(t('purchasing.errorNoItemsToReceive'))

      const { error } = await supabase.rpc('receive_purchase_order', {
        p_po_id: po.id,
        p_lines: lines as unknown as Json,
      })

      if (error) throw error
    },
    onSuccess: () => {
      toast.success(t('common.saved'))
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] })
      queryClient.invalidateQueries({ queryKey: ['inventory_levels'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      onSuccess()
    },
    onError: (error) => {
      toast.error(errorText(error))
    },
  })

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-ink">{t('purchasing.receiveTitle')}</h3>

        <Card>
          <CardBody className="space-y-3">
            {items.map(item => {
              const remaining = item.quantity_ordered - (item.quantity_received || 0)
              const receiving = receivingNow[item.id] || 0

              return (
                <div key={item.id} className="flex items-center gap-3 pb-3 border-b border-sand last:border-b-0">
                  <div className="flex-1">
                    <p className="font-medium text-sm">
                      {item.product_variants?.products
                        ? getLocalized(item.product_variants.products, 'name')
                        : ''}
                    </p>
                    <p className="text-xs text-moss">
                      {item.product_variants?.color_name}
                      {item.product_variants?.size && ` / ${item.product_variants.size}`}
                    </p>
                  </div>

                  <div className="text-sm text-moss">
                    {item.quantity_received || 0} / {item.quantity_ordered}
                  </div>

                  <Input
                    type="number"
                    value={receiving}
                    onChange={(e) =>
                      setReceivingNow({
                        ...receivingNow,
                        [item.id]: Math.min(
                          parseInt(e.target.value) || 0,
                          remaining
                        ),
                      })
                    }
                    max={remaining}
                    min="0"
                    className="w-20"
                  />
                </div>
              )
            })}
          </CardBody>
        </Card>

        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => receiveMutation.mutate()}
            disabled={receiveMutation.isPending || Object.values(receivingNow).every(v => v === 0)}
          >
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
