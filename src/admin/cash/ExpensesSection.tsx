import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, type Tables } from '@/lib/supabase'
import { useT, useLocale, useLocalized } from '@/lib/i18n'
import { useErrorText } from '@/lib/errors'
import { formatMoney, num } from '@/lib/money'
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
  Select,
  Modal,
  EmptyState,
  Skeleton,
} from '@/components/ui'
import { Receipt, Plus } from 'lucide-react'
import { format } from 'date-fns'
import { ar } from 'date-fns/locale'

const CATEGORIES = ['rent', 'salaries', 'supplies', 'utilities', 'other'] as const

function expenseCategoryLabel(t: ReturnType<typeof useT>, category: string): string {
  switch (category) {
    case 'rent':
      return t('cash.expenseCategory_rent')
    case 'salaries':
      return t('cash.expenseCategory_salaries')
    case 'supplies':
      return t('cash.expenseCategory_supplies')
    case 'utilities':
      return t('cash.expenseCategory_utilities')
    case 'other':
      return t('cash.expenseCategory_other')
    default:
      return category
  }
}

type Expense = Tables<'expenses'> & {
  locations: { name_en: string; name_ar: string } | null
  profiles: { full_name: string | null } | null
}

interface ExpensesSectionProps {
  locationId: string
  shiftId: string | null
}

export function ExpensesSection({ locationId, shiftId }: ExpensesSectionProps) {
  const t = useT()
  const errorText = useErrorText()
  const { locale } = useLocale()
  const getLocalized = useLocalized()
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['cash', 'expenses', locationId],
    queryFn: async () => {
      let query = supabase
        .from('expenses')
        .select('*, locations(name_en, name_ar), profiles(full_name)')
        .order('spent_on', { ascending: false })
        .limit(50)
      if (locationId) query = query.eq('location_id', locationId)
      const { data, error } = await query
      if (error) {
        toast.error(errorText(error))
        throw error
      }
      return (data as unknown as Expense[]) || []
    },
  })

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-4 w-4" /> {t('cash.expenses')}
        </CardTitle>
        <Button size="sm" icon={Plus} onClick={() => setFormOpen(true)}>
          {t('cash.addExpense')}
        </Button>
      </CardHeader>
      <CardBody className="p-0">
        {isLoading ? (
          <div className="space-y-3 p-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : expenses.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={Receipt} title={t('cash.noExpenses')} />
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t('cash.date')}</TH>
                <TH>{t('cash.category')}</TH>
                <TH className="text-end">{t('cash.amount')}</TH>
                <TH>{t('customers.notes')}</TH>
                <TH>{t('reports.branch')}</TH>
                <TH>{t('staff.auditActor')}</TH>
                <TH>{t('cash.fromDrawer')}</TH>
              </TR>
            </THead>
            <TBody>
              {expenses.map((e) => (
                <TR key={e.id}>
                  <TD className="text-sm">
                    {format(new Date(e.spent_on), 'd MMM yyyy', {
                      locale: locale === 'ar' ? ar : undefined,
                    })}
                  </TD>
                  <TD>
                    <Badge tone="neutral">{expenseCategoryLabel(t, e.category)}</Badge>
                  </TD>
                  <TD className="text-end" dir="ltr">
                    {formatMoney(e.amount, locale)}
                  </TD>
                  <TD className="text-sm text-moss">{e.note || '—'}</TD>
                  <TD className="text-sm">{e.locations ? getLocalized(e.locations, 'name') : '—'}</TD>
                  <TD className="text-sm">{e.profiles?.full_name || '—'}</TD>
                  <TD>
                    {e.paid_from_drawer ? (
                      <Badge tone="info">{t('common.confirm')}</Badge>
                    ) : (
                      <span className="text-xs text-moss">—</span>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardBody>

      {formOpen && (
        <AddExpenseModal
          locationId={locationId}
          shiftId={shiftId}
          onClose={() => setFormOpen(false)}
          onSuccess={() => {
            setFormOpen(false)
            queryClient.invalidateQueries({ queryKey: ['cash'] })
          }}
        />
      )}
    </Card>
  )
}

interface AddExpenseModalProps {
  locationId: string
  shiftId: string | null
  onClose: () => void
  onSuccess: () => void
}

function AddExpenseModal({ locationId, shiftId, onClose, onSuccess }: AddExpenseModalProps) {
  const t = useT()
  const errorText = useErrorText()

  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('other')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [spentOn, setSpentOn] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [paidFromDrawer, setPaidFromDrawer] = useState(false)

  const save = useMutation({
    mutationFn: async () => {
      const amountNum = num(amount)
      if (amountNum <= 0) throw new Error(t('cash.errorAmountPositive'))

      // The paid_from_drawer trigger writes the matching negative cash_movements
      // row itself when a shift_id is present — never write it here too.
      const { error } = await supabase.from('expenses').insert({
        category,
        amount: amountNum,
        note: note.trim() || null,
        spent_on: spentOn,
        location_id: locationId || null,
        paid_from_drawer: paidFromDrawer,
        shift_id: paidFromDrawer ? shiftId : null,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      toast.success(t('common.saved'))
      onSuccess()
    },
    onError: (e) => toast.error(errorText(e)),
  })

  return (
    <Modal open onClose={onClose} size="sm" title={t('cash.addExpense')}>
      <div className="space-y-4">
        <Select
          label={t('cash.category')}
          value={category}
          onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`cash.expenseCategory_${c}`)}
            </option>
          ))}
        </Select>
        <Input
          label={t('cash.amount')}
          type="number"
          dir="ltr"
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
        <Input
          label={t('customers.notes')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Input
          label={t('cash.date')}
          type="date"
          value={spentOn}
          onChange={(e) => setSpentOn(e.target.value)}
        />
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={paidFromDrawer}
            onChange={(e) => setPaidFromDrawer(e.target.checked)}
            disabled={!shiftId}
            className="rounded"
          />
          <span className="text-sm text-ink">{t('cash.fromDrawer')}</span>
        </label>
        {paidFromDrawer && !shiftId && (
          <p className="text-xs text-warning">{t('cash.noShiftForDrawer')}</p>
        )}

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
