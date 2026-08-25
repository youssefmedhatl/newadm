import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, type Tables, type Enums } from '@/lib/supabase'
import { useT, useLocale, useLocalized } from '@/lib/i18n'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { useErrorText } from '@/lib/errors'
import { useCan } from '@/lib/auth'
import { formatMoney, formatPercent, num } from '@/lib/money'
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
  ConfirmDialog,
  EmptyState,
  Skeleton,
} from '@/components/ui'
import { Tag, Plus, Edit2, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { ar } from 'date-fns/locale'

type Discount = Tables<'discounts'>
type NameRow = { id: string; name_en: string; name_ar: string }

export function DiscountsPage() {
  const t = useT()
  useDocumentTitle(t('nav.discounts'))
  const errorText = useErrorText()
  const { locale } = useLocale()
  const can = useCan()
  const allowed = can('discounts')
  const queryClient = useQueryClient()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Discount | null>(null)
  const [deleting, setDeleting] = useState<Discount | null>(null)

  const { data: discounts = [], isLoading } = useQuery({
    queryKey: ['discounts'],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('discounts')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) {
        toast.error(errorText(error))
        throw error
      }
      return (data as Discount[]) || []
    },
  })

  // Date.now() is impure by definition, but this only classifies already-
  // fetched expiry timestamps against the wall clock for display/filtering.
  // React re-renders whenever `discounts` refetches, so this never goes
  // stale for long, and a duplicate render (e.g. React Strict Mode) can
  // only differ by milliseconds — never enough to flip a row's
  // expired/active classification in a way a user would notice.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', 'all'],
    enabled: allowed,
    queryFn: async () => {
      const { data } = await supabase
        .from('categories')
        .select('id, name_en, name_ar')
        .order('position')
      return (data as NameRow[]) || []
    },
  })

  const { data: products = [] } = useQuery({
    queryKey: ['products', 'names'],
    enabled: allowed,
    queryFn: async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name_en, name_ar')
        .order('name_en')
      return (data as NameRow[]) || []
    },
  })

  const toggleActive = useMutation({
    mutationFn: async (d: Discount) => {
      const { error } = await supabase
        .from('discounts')
        .update({ is_active: !d.is_active })
        .eq('id', d.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      toast.success(t('common.saved'))
      queryClient.invalidateQueries({ queryKey: ['discounts'] })
    },
    onError: (e) =>
      toast.error(errorText(e)),
  })

  const remove = useMutation({
    mutationFn: async (d: Discount) => {
      const { error } = await supabase.from('discounts').delete().eq('id', d.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      toast.success(t('common.saved'))
      setDeleting(null)
      queryClient.invalidateQueries({ queryKey: ['discounts'] })
    },
    onError: (e) =>
      toast.error(errorText(e)),
  })

  // Rule 1: guard after every hook.
  if (!allowed) {
    return (
      <div className="space-y-6 p-6">
        <h1 className="text-3xl font-display text-ink mb-2">
          {t('nav.discounts')}
        </h1>
        <Card>
          <CardBody>
            <p className="text-center text-moss">{t('error.notAuthorised')}</p>
          </CardBody>
        </Card>
      </div>
    )
  }

  const isExpired = (d: Discount) =>
    d.ends_at !== null && new Date(d.ends_at).getTime() < now
  const isExhausted = (d: Discount) =>
    d.usage_limit !== null && d.used_count >= d.usage_limit

  const openNew = () => {
    setEditing(null)
    setFormOpen(true)
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display text-ink mb-2">
            {t('nav.discounts')}
          </h1>
          <p className="text-moss">{t('page.discountsDescription')}</p>
        </div>
        <Button onClick={openNew} icon={Plus}>
          {t('discounts.create')}
        </Button>
      </div>

      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : discounts.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Tag}
                title={t('discounts.empty')}
                description={t('discounts.emptyDescription')}
                action={
                  <Button onClick={openNew} icon={Plus}>
                    {t('discounts.create')}
                  </Button>
                }
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>{t('discounts.code')}</TH>
                  <TH>{t('discounts.type')}</TH>
                  <TH className="text-end">{t('discounts.value')}</TH>
                  <TH className="text-end">{t('discounts.usage')}</TH>
                  <TH>{t('discounts.window')}</TH>
                  <TH>{t('common.status')}</TH>
                  <TH>{t('common.actions')}</TH>
                </TR>
              </THead>
              <TBody>
                {discounts.map((d) => {
                  const expired = isExpired(d)
                  const exhausted = isExhausted(d)
                  return (
                    <TR key={d.id}>
                      <TD>
                        <span dir="ltr" className="font-mono font-medium uppercase">
                          {d.code}
                        </span>
                        {d.description && (
                          <p className="text-xs text-moss">{d.description}</p>
                        )}
                      </TD>
                      <TD>
                        <Badge tone={d.type === 'percentage' ? 'info' : 'neutral'}>
                          {t(`discounts.type_${d.type}`)}
                        </Badge>
                      </TD>
                      <TD className="text-end" dir="ltr">
                        {d.type === 'percentage'
                          ? formatPercent(d.value, locale, { isWholeNumber: true })
                          : formatMoney(d.value, locale)}
                      </TD>
                      <TD className="text-end" dir="ltr">
                        {d.used_count}
                        {d.usage_limit !== null ? ` / ${d.usage_limit}` : ''}
                      </TD>
                      <TD className="text-xs text-moss">
                        <span dir="ltr">
                          {format(new Date(d.starts_at), 'd MMM yyyy', {
                            locale: locale === 'ar' ? ar : undefined,
                          })}
                          {d.ends_at
                            ? ` – ${format(new Date(d.ends_at), 'd MMM yyyy', {
                                locale: locale === 'ar' ? ar : undefined,
                              })}`
                            : ` – ${t('discounts.noEnd')}`}
                        </span>
                      </TD>
                      <TD>
                        <div className="flex flex-wrap gap-1">
                          <Badge tone={d.is_active ? 'success' : 'neutral'}>
                            {d.is_active
                              ? t('discounts.active')
                              : t('discounts.inactive')}
                          </Badge>
                          {expired && (
                            <Badge tone="danger">{t('discounts.expired')}</Badge>
                          )}
                          {exhausted && (
                            <Badge tone="warning">
                              {t('discounts.exhausted')}
                            </Badge>
                          )}
                        </div>
                      </TD>
                      <TD>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toggleActive.mutate(d)}
                            disabled={toggleActive.isPending}
                          >
                            {d.is_active
                              ? t('discounts.deactivate')
                              : t('discounts.activate')}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            aria-label={t('common.edit')}
                            onClick={() => {
                              setEditing(d)
                              setFormOpen(true)
                            }}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            aria-label={t('common.delete')}
                            onClick={() => setDeleting(d)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {formOpen && (
        <DiscountFormModal
          discount={editing}
          categories={categories}
          products={products}
          onClose={() => setFormOpen(false)}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        tone="danger"
        title={t('discounts.deleteTitle')}
        message={t('discounts.deleteWarning')}
        confirmLabel={t('common.delete')}
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </div>
  )
}

/* --------------------------- Form modal --------------------------- */

interface FormProps {
  discount: Discount | null
  categories: NameRow[]
  products: NameRow[]
  onClose: () => void
}

function DiscountFormModal({ discount, categories, products, onClose }: FormProps) {
  const t = useT()
  const errorText = useErrorText()
  const getLocalized = useLocalized()
  const queryClient = useQueryClient()

  const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '')

  const [code, setCode] = useState(discount?.code ?? '')
  const [description, setDescription] = useState(discount?.description ?? '')
  const [type, setType] = useState<Enums<'discount_type'>>(
    discount?.type ?? 'percentage'
  )
  const [value, setValue] = useState(discount ? String(discount.value) : '')
  const [startsAt, setStartsAt] = useState(
    discount ? toDateInput(discount.starts_at) : ''
  )
  const [endsAt, setEndsAt] = useState(
    discount ? toDateInput(discount.ends_at) : ''
  )
  const [isActive, setIsActive] = useState(discount?.is_active ?? true)
  const [categoryId, setCategoryId] = useState(
    discount?.applies_to_category_id ?? ''
  )
  const [productId, setProductId] = useState(
    discount?.applies_to_product_id ?? ''
  )

  const save = useMutation({
    mutationFn: async () => {
      const trimmedCode = code.trim().toUpperCase()
      const valueNum = num(value)

      // Client-side validation mirroring the database CHECK constraints.
      if (!trimmedCode) throw new Error(t('discounts.errorCodeRequired'))
      if (valueNum <= 0) throw new Error(t('discounts.errorValuePositive'))
      if (type === 'percentage' && valueNum > 100) {
        throw new Error(t('discounts.errorPercentMax'))
      }
      if (startsAt && endsAt && endsAt < startsAt) {
        throw new Error(t('discounts.errorEndBeforeStart'))
      }

      const payload = {
        code: trimmedCode,
        description: description.trim() || null,
        type,
        value: valueNum,
        // Every discount code is single-use, store-wide and per customer —
        // no minimum spend and no cap on the discount amount.
        min_subtotal: 0,
        max_discount: null,
        usage_limit: 1,
        per_customer_limit: 1,
        starts_at: startsAt
          ? `${startsAt}T00:00:00Z`
          : new Date().toISOString(),
        ends_at: endsAt ? `${endsAt}T23:59:59Z` : null,
        is_active: isActive,
        applies_to_category_id: categoryId || null,
        applies_to_product_id: productId || null,
      }

      const { error } = discount
        ? await supabase.from('discounts').update(payload).eq('id', discount.id)
        : await supabase.from('discounts').insert(payload)

      if (error) {
        if (error.code === '23505') {
          throw new Error(t('discounts.errorCodeExists'))
        }
        throw new Error(error.message)
      }
    },
    onSuccess: () => {
      toast.success(t('common.saved'))
      queryClient.invalidateQueries({ queryKey: ['discounts'] })
      onClose()
    },
    onError: (e) =>
      toast.error(errorText(e)),
  })

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={discount ? t('discounts.edit') : t('discounts.create')}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label={t('discounts.code')}
            required
            dir="ltr"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <Select
            label={t('discounts.type')}
            value={type}
            onChange={(e) => setType(e.target.value as Enums<'discount_type'>)}
          >
            <option value="percentage">{t('discounts.type_percentage')}</option>
            <option value="fixed">{t('discounts.type_fixed')}</option>
          </Select>
        </div>

        <Textarea
          label={t('discounts.description')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />

        <p className="text-xs text-moss">{t('discounts.singleUseNote')}</p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label={
              type === 'percentage'
                ? t('discounts.valuePercent')
                : t('discounts.valueFixed')
            }
            required
            type="number"
            dir="ltr"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            hint={
              type === 'percentage' ? t('discounts.percentHint') : undefined
            }
          />
          <div />
          <Input
            label={t('discounts.startsAt')}
            type="date"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
          <Input
            label={t('discounts.endsAt')}
            type="date"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
          <Select
            label={t('discounts.scopeCategory')}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">{t('discounts.scopeAll')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {getLocalized(c, 'name')}
              </option>
            ))}
          </Select>
          <Select
            label={t('discounts.scopeProduct')}
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">{t('discounts.scopeAll')}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {getLocalized(p, 'name')}
              </option>
            ))}
          </Select>
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="rounded"
          />
          <span className="text-sm text-ink">{t('discounts.isActive')}</span>
        </label>

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
