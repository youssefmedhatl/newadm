import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, type Tables } from '@/lib/supabase'
import { useT, useLocale } from '@/lib/i18n'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { useErrorText } from '@/lib/errors'
import { useCan } from '@/lib/auth'
import { formatMoney, formatNumber, num } from '@/lib/money'
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
  Textarea,
  Select,
  Modal,
  Drawer,
  SearchInput,
  Pagination,
  EmptyState,
  Skeleton,
} from '@/components/ui'
import { Users, Plus, X, Ban, Check, Gift } from 'lucide-react'
import { format } from 'date-fns'
import { ar } from 'date-fns/locale'

const ITEMS_PER_PAGE = 25

type Customer = Tables<'customers'>
type LoyaltyTxn = Tables<'loyalty_transactions'>
type Address = Tables<'customer_addresses'>
type OrderRow = Pick<
  Tables<'orders'>,
  'id' | 'order_number' | 'placed_at' | 'total' | 'status'
>

type OrdersFilter = '' | 'has' | 'none'
type BlockedFilter = '' | 'blocked' | 'active'
type SortField = 'total_spent' | 'last_order_at'

export function CustomersPage() {
  const t = useT()
  useDocumentTitle(t('nav.customers'))
  const errorText = useErrorText()
  const { locale } = useLocale()
  const can = useCan()
  const allowed = can('customers')

  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [ordersFilter, setOrdersFilter] = useState<OrdersFilter>('')
  const [blockedFilter, setBlockedFilter] = useState<BlockedFilter>('')
  const [sort, setSort] = useState<SortField>('total_spent')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)

  const sanitizedSearch = useMemo(
    () => searchTerm.replace(/[,()."\\%_*]/g, '').trim(),
    [searchTerm]
  )

  const { data: result = { data: [], count: 0 }, isLoading } = useQuery({
    queryKey: [
      'customers',
      page,
      sanitizedSearch,
      ordersFilter,
      blockedFilter,
      sort,
    ],
    enabled: allowed,
    queryFn: async () => {
      let query = supabase.from('customers').select('*', { count: 'exact' })

      if (sanitizedSearch) {
        query = query.or(
          `full_name.ilike.%${sanitizedSearch}%,phone.ilike.%${sanitizedSearch}%,email.ilike.%${sanitizedSearch}%`
        )
      }
      if (ordersFilter === 'has') query = query.gt('orders_count', 0)
      if (ordersFilter === 'none') query = query.eq('orders_count', 0)
      if (blockedFilter === 'blocked') query = query.eq('is_blocked', true)
      if (blockedFilter === 'active') query = query.eq('is_blocked', false)

      const { data, error, count } = await query
        .order(sort, { ascending: false, nullsFirst: false })
        .range((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE - 1)

      if (error) {
        toast.error(errorText(error))
        throw error
      }
      return { data: (data as Customer[]) || [], count: count || 0 }
    },
  })

  const totalPages = Math.ceil((result.count || 0) / ITEMS_PER_PAGE)

  // Rule 1: guard sits below every hook.
  if (!allowed) {
    return (
      <div className="space-y-6 p-6">
        <h1 className="text-3xl font-display text-ink mb-2">
          {t('nav.customers')}
        </h1>
        <Card>
          <CardBody>
            <p className="text-center text-moss">{t('error.notAuthorised')}</p>
          </CardBody>
        </Card>
      </div>
    )
  }

  const openNew = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const openEdit = (c: Customer) => {
    setEditing(c)
    setFormOpen(true)
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display text-ink mb-2">
            {t('nav.customers')}
          </h1>
          <p className="text-moss">{t('page.customersDescription')}</p>
        </div>
        <Button onClick={openNew} icon={Plus}>
          {t('customers.create')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('orders.filters')}</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            <SearchInput
              value={searchTerm}
              onValueChange={(v) => {
                setSearchTerm(v)
                setPage(1)
              }}
              placeholder={t('customers.searchPlaceholder')}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Select
                label={t('customers.filterOrders')}
                value={ordersFilter}
                onChange={(e) => {
                  setOrdersFilter(e.target.value as OrdersFilter)
                  setPage(1)
                }}
              >
                <option value="">{t('common.all')}</option>
                <option value="has">{t('customers.hasOrders')}</option>
                <option value="none">{t('customers.noOrders')}</option>
              </Select>
              <Select
                label={t('customers.filterBlocked')}
                value={blockedFilter}
                onChange={(e) => {
                  setBlockedFilter(e.target.value as BlockedFilter)
                  setPage(1)
                }}
              >
                <option value="">{t('common.all')}</option>
                <option value="active">{t('customers.notBlocked')}</option>
                <option value="blocked">{t('customers.blocked')}</option>
              </Select>
              <Select
                label={t('customers.sortBy')}
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as SortField)
                  setPage(1)
                }}
              >
                <option value="total_spent">{t('customers.sortSpend')}</option>
                <option value="last_order_at">
                  {t('customers.sortLastOrder')}
                </option>
              </Select>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : result.data.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Users}
                title={t('customers.empty')}
                description={t('customers.emptyDescription')}
                action={
                  <Button onClick={openNew} icon={Plus}>
                    {t('customers.create')}
                  </Button>
                }
              />
            </div>
          ) : (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>{t('customers.name')}</TH>
                    <TH>{t('customers.phone')}</TH>
                    <TH>{t('customers.city')}</TH>
                    <TH className="text-end">{t('customers.orders')}</TH>
                    <TH className="text-end">{t('customers.spend')}</TH>
                    <TH className="text-end">{t('customers.points')}</TH>
                    <TH>{t('customers.lastOrder')}</TH>
                    <TH>{t('common.status')}</TH>
                  </TR>
                </THead>
                <TBody>
                  {result.data.map((c) => (
                    <TR
                      key={c.id}
                      onClick={() => setDetailId(c.id)}
                      className="cursor-pointer hover:bg-sand/40 transition-colors"
                    >
                      <TD className="font-medium">{c.full_name}</TD>
                      <TD dir="ltr" className="text-start">
                        {c.phone || '—'}
                      </TD>
                      <TD>{c.city || '—'}</TD>
                      <TD className="text-end">
                        {formatNumber(c.orders_count, locale)}
                      </TD>
                      <TD className="text-end" dir="ltr">
                        {formatMoney(c.total_spent, locale)}
                      </TD>
                      <TD className="text-end">
                        {formatNumber(c.loyalty_points, locale)}
                      </TD>
                      <TD className="text-sm">
                        {c.last_order_at
                          ? format(new Date(c.last_order_at), 'd MMM yyyy', {
                              locale: locale === 'ar' ? ar : undefined,
                            })
                          : '—'}
                      </TD>
                      <TD>
                        {c.is_blocked ? (
                          <Badge tone="danger">{t('customers.blocked')}</Badge>
                        ) : (
                          <Badge tone="success">{t('customers.active')}</Badge>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {totalPages > 1 && (
                <div className="flex items-center justify-center border-t border-sand p-4">
                  <Pagination
                    page={page}
                    pageCount={totalPages}
                    onPageChange={setPage}
                  />
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>

      {formOpen && (
        <CustomerFormModal
          customer={editing}
          onClose={() => setFormOpen(false)}
          onEdit={openEdit}
        />
      )}

      {detailId && (
        <CustomerDetailDrawer
          customerId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={(c) => {
            setDetailId(null)
            openEdit(c)
          }}
        />
      )}
    </div>
  )
}

/* ----------------------------- Form modal ----------------------------- */

interface CustomerFormModalProps {
  customer: Customer | null
  onClose: () => void
  onEdit: (c: Customer) => void
}

function CustomerFormModal({ customer, onClose }: CustomerFormModalProps) {
  const t = useT()
  const errorText = useErrorText()
  const queryClient = useQueryClient()

  const [fullName, setFullName] = useState(customer?.full_name ?? '')
  const [phone, setPhone] = useState(customer?.phone ?? '')
  const [email, setEmail] = useState(customer?.email ?? '')
  const [city, setCity] = useState(customer?.city ?? '')
  const [birthday, setBirthday] = useState(customer?.birthday ?? '')
  const [notes, setNotes] = useState(customer?.notes ?? '')
  const [tags, setTags] = useState<string[]>(customer?.tags ?? [])
  const [tagInput, setTagInput] = useState('')

  const addTag = () => {
    const v = tagInput.trim()
    if (v && !tags.includes(v)) setTags([...tags, v])
    setTagInput('')
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!fullName.trim()) throw new Error(t('customers.errorNameRequired'))

      const payload = {
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        city: city.trim() || null,
        birthday: birthday || null,
        notes: notes.trim() || null,
        tags,
      }

      const { error } = customer
        ? await supabase.from('customers').update(payload).eq('id', customer.id)
        : await supabase.from('customers').insert(payload)

      if (error) {
        if (error.code === '23505') {
          throw new Error(t('customers.errorPhoneExists'))
        }
        throw new Error(error.message)
      }
    },
    onSuccess: () => {
      toast.success(t('common.saved'))
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['customer'] })
      onClose()
    },
    onError: (e) =>
      toast.error(errorText(e)),
  })

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={customer ? t('customers.edit') : t('customers.create')}
    >
      <div className="space-y-4">
        <Input
          label={t('customers.name')}
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label={t('customers.phone')}
            dir="ltr"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Input
            label={t('customers.email')}
            type="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label={t('customers.city')}
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
          <Input
            label={t('customers.birthday')}
            type="date"
            value={birthday ?? ''}
            onChange={(e) => setBirthday(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink mb-1">
            {t('customers.tags')}
          </label>
          <div className="flex gap-2">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addTag()
                }
              }}
              placeholder={t('customers.tagsPlaceholder')}
            />
            <Button variant="secondary" onClick={addTag}>
              {t('common.add')}
            </Button>
          </div>
          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-sand px-3 py-1 text-xs text-ink"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => setTags(tags.filter((x) => x !== tag))}
                    aria-label={t('customers.removeTag')}
                    className="rounded-full hover:bg-ink/10 p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <Textarea
          label={t('customers.notes')}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* --------------------------- Detail drawer --------------------------- */

interface DetailProps {
  customerId: string
  onClose: () => void
  onEdit: (c: Customer) => void
}

function CustomerDetailDrawer({ customerId, onClose, onEdit }: DetailProps) {
  const t = useT()
  const errorText = useErrorText()
  const { locale } = useLocale()
  const queryClient = useQueryClient()

  const [pointsDelta, setPointsDelta] = useState('')
  const [pointsNote, setPointsNote] = useState('')

  const { data: customer } = useQuery({
    queryKey: ['customer', customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .single()
      if (error) throw error
      return data as Customer
    },
  })

  const { data: orders = [] } = useQuery({
    queryKey: ['customer', customerId, 'orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, placed_at, total, status')
        .eq('customer_id', customerId)
        .order('placed_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data as OrderRow[]) || []
    },
  })

  const { data: ledger = [] } = useQuery({
    queryKey: ['customer', customerId, 'loyalty'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('loyalty_transactions')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data as LoyaltyTxn[]) || []
    },
  })

  const { data: addresses = [] } = useQuery({
    queryKey: ['customer', customerId, 'addresses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_addresses')
        .select('*')
        .eq('customer_id', customerId)
        .order('is_default', { ascending: false })
      if (error) throw error
      return (data as Address[]) || []
    },
  })

  const adjustPoints = useMutation({
    mutationFn: async () => {
      const delta = parseInt(pointsDelta, 10)
      if (!delta || Number.isNaN(delta)) {
        throw new Error(t('customers.errorPointsRequired'))
      }
      // Rule 6: never write customers.loyalty_points directly — a trigger keeps
      // the balance from loyalty_transactions.
      const { error } = await supabase.from('loyalty_transactions').insert({
        customer_id: customerId,
        points: delta,
        reason: 'manual_adjustment',
        note: pointsNote.trim() || null,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      toast.success(t('customers.pointsAdjusted'))
      setPointsDelta('')
      setPointsNote('')
      queryClient.invalidateQueries({ queryKey: ['customer', customerId] })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
    onError: (e) =>
      toast.error(errorText(e)),
  })

  const toggleBlock = useMutation({
    mutationFn: async () => {
      if (!customer) throw new Error(t('common.error'))
      const { error } = await supabase
        .from('customers')
        .update({ is_blocked: !customer.is_blocked })
        .eq('id', customerId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      toast.success(t('common.saved'))
      queryClient.invalidateQueries({ queryKey: ['customer', customerId] })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
    onError: (e) =>
      toast.error(errorText(e)),
  })

  const aov =
    customer && customer.orders_count > 0
      ? num(customer.total_spent) / customer.orders_count
      : 0

  const reasonLabel = (r: string) =>
    r === 'manual_adjustment' ? t('customers.reasonManual') : r

  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      title={customer?.full_name ?? t('nav.customers')}
    >
      {!customer ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => onEdit(customer)}>
              {t('common.edit')}
            </Button>
            <Button
              size="sm"
              variant={customer.is_blocked ? 'secondary' : 'danger'}
              icon={customer.is_blocked ? Check : Ban}
              onClick={() => toggleBlock.mutate()}
              disabled={toggleBlock.isPending}
            >
              {customer.is_blocked
                ? t('customers.unblock')
                : t('customers.block')}
            </Button>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-2 gap-3">
            <SummaryTile
              label={t('customers.lifetimeSpend')}
              value={formatMoney(customer.total_spent, locale)}
            />
            <SummaryTile
              label={t('customers.orders')}
              value={formatNumber(customer.orders_count, locale)}
            />
            <SummaryTile
              label={t('customers.avgOrder')}
              value={formatMoney(aov, locale)}
            />
            <SummaryTile
              label={t('customers.points')}
              value={formatNumber(customer.loyalty_points, locale)}
            />
            <SummaryTile
              label={t('customers.memberSince')}
              value={format(new Date(customer.created_at), 'd MMM yyyy', {
                locale: locale === 'ar' ? ar : undefined,
              })}
            />
          </div>

          {/* Adjust points */}
          <section className="rounded-xl border border-sand p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
              <Gift className="h-4 w-4" /> {t('customers.adjustPoints')}
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label={t('customers.pointsDelta')}
                type="number"
                dir="ltr"
                value={pointsDelta}
                onChange={(e) => setPointsDelta(e.target.value)}
                placeholder="+10 / -10"
              />
              <Input
                label={t('customers.pointsNote')}
                value={pointsNote}
                onChange={(e) => setPointsNote(e.target.value)}
              />
            </div>
            <p className="mt-2 text-xs text-moss">{t('customers.pointsHint')}</p>
            <div className="mt-3 flex justify-end">
              <Button
                size="sm"
                onClick={() => adjustPoints.mutate()}
                disabled={adjustPoints.isPending}
              >
                {t('customers.apply')}
              </Button>
            </div>
          </section>

          {/* Orders */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">
              {t('customers.orderHistory')}
            </h3>
            {orders.length === 0 ? (
              <p className="text-sm text-moss">{t('customers.noOrdersYet')}</p>
            ) : (
              <div className="divide-y divide-sand rounded-xl border border-sand">
                {orders.map((o) => (
                  <Link
                    key={o.id}
                    to={`/admin/orders/${o.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-2 hover:bg-sand/40"
                  >
                    <span dir="ltr" className="font-medium text-sm">
                      {o.order_number}
                    </span>
                    <span className="text-xs text-moss">
                      {format(new Date(o.placed_at), 'd MMM yyyy', {
                        locale: locale === 'ar' ? ar : undefined,
                      })}
                    </span>
                    <span dir="ltr" className="text-sm">
                      {formatMoney(o.total, locale)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Loyalty ledger */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">
              {t('customers.loyaltyLedger')}
            </h3>
            {ledger.length === 0 ? (
              <p className="text-sm text-moss">{t('customers.noLoyalty')}</p>
            ) : (
              <div className="divide-y divide-sand rounded-xl border border-sand">
                {ledger.map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center justify-between gap-3 px-4 py-2"
                  >
                    <div>
                      <p className="text-sm text-ink">{reasonLabel(l.reason)}</p>
                      {l.note && (
                        <p className="text-xs text-moss">{l.note}</p>
                      )}
                    </div>
                    <span className="text-xs text-moss">
                      {format(new Date(l.created_at), 'd MMM yyyy', {
                        locale: locale === 'ar' ? ar : undefined,
                      })}
                    </span>
                    <span
                      dir="ltr"
                      className={
                        l.points >= 0
                          ? 'text-sm font-medium text-success'
                          : 'text-sm font-medium text-danger'
                      }
                    >
                      {l.points >= 0 ? '+' : ''}
                      {formatNumber(l.points, locale)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Addresses */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">
              {t('customers.addresses')}
            </h3>
            {addresses.length === 0 ? (
              <p className="text-sm text-moss">{t('customers.noAddresses')}</p>
            ) : (
              <div className="space-y-2">
                {addresses.map((a) => (
                  <div
                    key={a.id}
                    className="rounded-xl border border-sand p-3 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink">
                        {a.full_name || customer.full_name}
                      </span>
                      {a.is_default && (
                        <Badge tone="info">{t('customers.defaultAddress')}</Badge>
                      )}
                    </div>
                    <p className="text-moss">
                      {[a.line1, a.line2, a.city, a.governorate]
                        .filter(Boolean)
                        .join('، ')}
                    </p>
                    {a.phone && (
                      <p dir="ltr" className="text-moss">
                        {a.phone}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </Drawer>
  )
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-sand p-3">
      <p className="text-xs text-moss">{label}</p>
      <p className="mt-1 text-lg font-semibold text-ink" dir="ltr">
        {value}
      </p>
    </div>
  )
}
