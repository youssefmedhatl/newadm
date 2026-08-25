import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Json } from '@/lib/database.types'
import { useT } from '@/lib/i18n'
import { useAuth } from '@/lib/auth'
import { num } from '@/lib/money'
import { toast } from 'sonner'
import { Card, CardBody, CardHeader, CardTitle, Button, Input, Badge, Skeleton } from '@/components/ui'
import { Lock } from 'lucide-react'

interface StoreValue {
  name_en: string
  name_ar: string
  tagline_en: string
  tagline_ar: string
  currency: string
  currency_symbol_en: string
  currency_symbol_ar: string
  phone: string
  email: string
  default_locale: string
}
interface LoyaltyValue {
  enabled: boolean
  points_per_currency: number
  currency_per_point: number
}
interface ShippingValue {
  flat_fee: number
  free_over: number
}
interface TaxValue {
  enabled: boolean
  rate: number
}
interface ReceiptValue {
  footer_en: string
  footer_ar: string
  show_logo: boolean
  return_days: number
}
interface InventoryValue {
  default_reorder_point: number
  default_reorder_qty: number
}

function useSettingRow(key: string) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['settings', key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('key', key)
        .single()
      if (error) throw error
      return data
    },
  })

  const save = useMutation({
    mutationFn: async (value: Json) => {
      const { error } = await supabase.from('settings').update({ value }).eq('key', key)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', key] })
    },
  })

  return { ...query, save }
}

// Seeds local editable form state from a query row the first time it loads
// (and again if the row identity changes, e.g. after a refetch). Doing this
// during render — rather than in a useEffect — avoids the extra
// render-then-setState-then-render-again pass and the flash of an empty
// form that the effect version produced on every settings tab.
function useFormFromRow<T>(row: { value: Json } | undefined) {
  const [prevRow, setPrevRow] = useState(row)
  const [form, setForm] = useState<T | null>(row ? (row.value as unknown as T) : null)
  if (row !== prevRow) {
    setPrevRow(row)
    setForm(row ? (row.value as unknown as T) : null)
  }
  return [form, setForm] as const
}

export function StoreSettingsTab() {
  const t = useT()
  const { role } = useAuth()
  const canWrite = role === 'owner' || role === 'manager'

  return (
    <div className="space-y-6">
      <StoreSection canWrite={canWrite} />
      <LoyaltySection canWrite={canWrite} />
      <ShippingSection canWrite={canWrite} />
      <TaxSection canWrite={canWrite} />
      <ReceiptSection canWrite={canWrite} />
      <InventorySection canWrite={canWrite} />
    </div>
  )
}

function PublicBadge({ isPublic }: { isPublic: boolean }) {
  const t = useT()
  return (
    <Badge tone={isPublic ? 'info' : 'neutral'}>
      {isPublic ? (
        t('settings.publicYes')
      ) : (
        <span className="inline-flex items-center gap-1">
          <Lock className="h-3 w-3" /> {t('settings.publicNo')}
        </span>
      )}
    </Badge>
  )
}

function StoreSection({ canWrite }: { canWrite: boolean }) {
  const t = useT()
  const { data: row, isLoading, save } = useSettingRow('store')
  const [form, setForm] = useFormFromRow<StoreValue>(row)

  if (isLoading || !form) return <Skeleton className="h-64 w-full" />

  const set = <K extends keyof StoreValue>(key: K, value: StoreValue[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f))

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-4">
        <CardTitle>{t('settings.storeTitle')}</CardTitle>
        {row && <PublicBadge isPublic={row.is_public} />}
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-sm text-moss">{t('settings.storeHint')}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label={`${t('settings.storeName')} (EN)`} value={form.name_en} onChange={(e) => set('name_en', e.target.value)} disabled={!canWrite} />
          <Input label={`${t('settings.storeName')} (AR)`} dir="rtl" value={form.name_ar} onChange={(e) => set('name_ar', e.target.value)} disabled={!canWrite} />
          <Input label={`${t('settings.tagline')} (EN)`} value={form.tagline_en} onChange={(e) => set('tagline_en', e.target.value)} disabled={!canWrite} />
          <Input label={`${t('settings.tagline')} (AR)`} dir="rtl" value={form.tagline_ar} onChange={(e) => set('tagline_ar', e.target.value)} disabled={!canWrite} />
          <Input label={t('settings.currency')} dir="ltr" value={form.currency} onChange={(e) => set('currency', e.target.value)} disabled={!canWrite} />
          <Input label={t('settings.defaultLocale')} dir="ltr" value={form.default_locale} onChange={(e) => set('default_locale', e.target.value)} disabled={!canWrite} />
          <Input label={`${t('settings.currencySymbol')} (EN)`} dir="ltr" value={form.currency_symbol_en} onChange={(e) => set('currency_symbol_en', e.target.value)} disabled={!canWrite} />
          <Input label={`${t('settings.currencySymbol')} (AR)`} dir="rtl" value={form.currency_symbol_ar} onChange={(e) => set('currency_symbol_ar', e.target.value)} disabled={!canWrite} />
          <Input label={t('settings.phone')} dir="ltr" value={form.phone} onChange={(e) => set('phone', e.target.value)} disabled={!canWrite} />
          <Input label={t('settings.email')} dir="ltr" value={form.email} onChange={(e) => set('email', e.target.value)} disabled={!canWrite} />
        </div>
        {canWrite && (
          <div className="flex justify-end">
            <Button
              onClick={() => save.mutate(form as unknown as Json, { onSuccess: () => toast.success(t('common.saved')) })}
              disabled={save.isPending}
            >
              {t('common.save')}
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function LoyaltySection({ canWrite }: { canWrite: boolean }) {
  const t = useT()
  const { data: row, isLoading, save } = useSettingRow('loyalty')
  const [form, setForm] = useFormFromRow<LoyaltyValue>(row)

  if (isLoading || !form) return <Skeleton className="h-48 w-full" />

  const example = `${form.points_per_currency} ${t('settings.loyaltyExamplePoint')}, 100 ${t('settings.loyaltyExamplePoints')} = ${(100 * form.currency_per_point).toFixed(0)} EGP`

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-4">
        <CardTitle>{t('settings.loyaltyTitle')}</CardTitle>
        {row && <PublicBadge isPublic={row.is_public} />}
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-sm text-moss">{t('settings.loyaltyHint')}</p>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            disabled={!canWrite}
            className="rounded"
          />
          <span className="text-sm text-ink">{t('settings.loyaltyEnabled')}</span>
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label={t('settings.pointsPerCurrency')}
            type="number"
            dir="ltr"
            value={form.points_per_currency}
            onChange={(e) => setForm({ ...form, points_per_currency: num(e.target.value) })}
            disabled={!canWrite}
          />
          <Input
            label={t('settings.currencyPerPoint')}
            type="number"
            dir="ltr"
            value={form.currency_per_point}
            onChange={(e) => setForm({ ...form, currency_per_point: num(e.target.value) })}
            disabled={!canWrite}
          />
        </div>
        <p className="rounded-lg bg-bone p-3 text-xs text-moss" dir="ltr">
          {example}
        </p>
        {canWrite && (
          <div className="flex justify-end">
            <Button
              onClick={() => save.mutate(form as unknown as Json, { onSuccess: () => toast.success(t('common.saved')) })}
              disabled={save.isPending}
            >
              {t('common.save')}
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function ShippingSection({ canWrite }: { canWrite: boolean }) {
  const t = useT()
  const { data: row, isLoading, save } = useSettingRow('shipping')
  const [form, setForm] = useFormFromRow<ShippingValue>(row)

  if (isLoading || !form) return <Skeleton className="h-40 w-full" />

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-4">
        <CardTitle>{t('settings.shippingTitle')}</CardTitle>
        {row && <PublicBadge isPublic={row.is_public} />}
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-sm text-moss">{t('settings.shippingHint')}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label={t('settings.flatFee')}
            type="number"
            dir="ltr"
            value={form.flat_fee}
            onChange={(e) => setForm({ ...form, flat_fee: num(e.target.value) })}
            disabled={!canWrite}
          />
          <Input
            label={t('settings.freeOver')}
            type="number"
            dir="ltr"
            value={form.free_over}
            onChange={(e) => setForm({ ...form, free_over: num(e.target.value) })}
            disabled={!canWrite}
          />
        </div>
        {canWrite && (
          <div className="flex justify-end">
            <Button
              onClick={() => save.mutate(form as unknown as Json, { onSuccess: () => toast.success(t('common.saved')) })}
              disabled={save.isPending}
            >
              {t('common.save')}
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function TaxSection({ canWrite }: { canWrite: boolean }) {
  const t = useT()
  const { data: row, isLoading, save } = useSettingRow('tax')
  const [form, setForm] = useFormFromRow<TaxValue>(row)

  if (isLoading || !form) return <Skeleton className="h-40 w-full" />

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-4">
        <CardTitle>{t('settings.taxTitle')}</CardTitle>
        {row && <PublicBadge isPublic={row.is_public} />}
      </CardHeader>
      <CardBody className="space-y-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            disabled={!canWrite}
            className="rounded"
          />
          <span className="text-sm text-ink">{t('settings.taxEnabled')}</span>
        </label>
        <Input
          label={t('settings.taxRate')}
          type="number"
          dir="ltr"
          value={form.rate}
          onChange={(e) => setForm({ ...form, rate: num(e.target.value) })}
          disabled={!canWrite}
          hint={t('settings.taxRateHint')}
          className="max-w-xs"
        />
        {canWrite && (
          <div className="flex justify-end">
            <Button
              onClick={() => save.mutate(form as unknown as Json, { onSuccess: () => toast.success(t('common.saved')) })}
              disabled={save.isPending}
            >
              {t('common.save')}
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function ReceiptSection({ canWrite }: { canWrite: boolean }) {
  const t = useT()
  const { data: row, isLoading, save } = useSettingRow('receipt')
  const [form, setForm] = useFormFromRow<ReceiptValue>(row)

  if (isLoading || !form) return <Skeleton className="h-56 w-full" />

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-4">
        <CardTitle>{t('settings.receiptTitle')}</CardTitle>
        {row && <PublicBadge isPublic={row.is_public} />}
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-sm text-moss">{t('settings.receiptHint')}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label={`${t('settings.receiptFooter')} (EN)`} value={form.footer_en} onChange={(e) => setForm({ ...form, footer_en: e.target.value })} disabled={!canWrite} />
          <Input label={`${t('settings.receiptFooter')} (AR)`} dir="rtl" value={form.footer_ar} onChange={(e) => setForm({ ...form, footer_ar: e.target.value })} disabled={!canWrite} />
        </div>
        <Input
          label={t('settings.returnDays')}
          type="number"
          dir="ltr"
          value={form.return_days}
          onChange={(e) => setForm({ ...form, return_days: num(e.target.value) })}
          disabled={!canWrite}
          className="max-w-xs"
        />
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.show_logo}
            onChange={(e) => setForm({ ...form, show_logo: e.target.checked })}
            disabled={!canWrite}
            className="rounded"
          />
          <span className="text-sm text-ink">{t('settings.showLogo')}</span>
        </label>
        {canWrite && (
          <div className="flex justify-end">
            <Button
              onClick={() => save.mutate(form as unknown as Json, { onSuccess: () => toast.success(t('common.saved')) })}
              disabled={save.isPending}
            >
              {t('common.save')}
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function InventorySection({ canWrite }: { canWrite: boolean }) {
  const t = useT()
  const { data: row, isLoading, save } = useSettingRow('inventory')
  const [form, setForm] = useFormFromRow<InventoryValue>(row)

  if (isLoading || !form) return <Skeleton className="h-40 w-full" />

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-4">
        <CardTitle>{t('settings.inventoryTitle')}</CardTitle>
        {row && <PublicBadge isPublic={row.is_public} />}
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-sm text-moss">{t('settings.inventoryHint')}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label={t('settings.defaultReorderPoint')}
            type="number"
            dir="ltr"
            value={form.default_reorder_point}
            onChange={(e) => setForm({ ...form, default_reorder_point: num(e.target.value) })}
            disabled={!canWrite}
          />
          <Input
            label={t('settings.defaultReorderQty')}
            type="number"
            dir="ltr"
            value={form.default_reorder_qty}
            onChange={(e) => setForm({ ...form, default_reorder_qty: num(e.target.value) })}
            disabled={!canWrite}
          />
        </div>
        {canWrite && (
          <div className="flex justify-end">
            <Button
              onClick={() => save.mutate(form as unknown as Json, { onSuccess: () => toast.success(t('common.saved')) })}
              disabled={save.isPending}
            >
              {t('common.save')}
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  )
}
