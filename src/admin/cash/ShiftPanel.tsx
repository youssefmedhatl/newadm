import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, type Tables } from '@/lib/supabase'
import { useT, useLocale } from '@/lib/i18n'
import { useErrorText } from '@/lib/errors'
import { formatMoney, num } from '@/lib/money'
import { toast } from 'sonner'
import { Card, CardBody, Button, Input, Modal, Badge } from '@/components/ui'
import { format } from 'date-fns'
import { ar } from 'date-fns/locale'
import { ArrowDownCircle, ArrowUpCircle } from 'lucide-react'

type Shift = Tables<'shifts'> & { profiles: { full_name: string | null } | null }

interface ShiftPanelProps {
  locationId: string
}

export function ShiftPanel({ locationId }: ShiftPanelProps) {
  const t = useT()
  const errorText = useErrorText()
  const { locale } = useLocale()
  const queryClient = useQueryClient()

  const [openDialog, setOpenDialog] = useState(false)
  const [closeDialog, setCloseDialog] = useState(false)
  const [movementDialog, setMovementDialog] = useState<'pay_in' | 'pay_out' | null>(null)

  const [openingFloat, setOpeningFloat] = useState('')
  const [countedCash, setCountedCash] = useState('')
  const [closeNotes, setCloseNotes] = useState('')
  const [movementAmount, setMovementAmount] = useState('')
  const [movementReason, setMovementReason] = useState('')

  const { data: shift, isLoading } = useQuery({
    queryKey: ['cash', 'open_shift', locationId],
    queryFn: async () => {
      if (!locationId) return null
      const { data, error } = await supabase
        .from('shifts')
        .select('*, profiles!shifts_opened_by_fkey(full_name)')
        .eq('location_id', locationId)
        .eq('status', 'open')
        .maybeSingle()
      if (error) throw error
      return data as Shift | null
    },
    enabled: !!locationId,
  })

  const { data: expectedCash } = useQuery({
    queryKey: ['cash', 'expected', shift?.id],
    queryFn: async () => {
      if (!shift?.id) return null
      const { data, error } = await supabase.rpc('shift_expected_cash', {
        p_shift_id: shift.id,
      })
      if (error) throw error
      return data
    },
    enabled: !!shift?.id,
    refetchInterval: 15000,
  })

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['cash'] })
    queryClient.invalidateQueries({ queryKey: ['shifts'] })
  }

  const openMutation = useMutation({
    mutationFn: async () => {
      if (!locationId) throw new Error(t('cash.errorNoBranch'))
      const { error } = await supabase.rpc('open_shift', {
        p_location_id: locationId,
        p_opening_float: num(openingFloat),
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      toast.success(t('cash.shiftOpened'))
      setOpenDialog(false)
      setOpeningFloat('')
      invalidateAll()
    },
    onError: (e) => toast.error(errorText(e)),
  })

  const movementMutation = useMutation({
    mutationFn: async () => {
      if (!shift?.id || !movementDialog) throw new Error(t('common.error'))
      const amount = num(movementAmount)
      if (amount <= 0) throw new Error(t('cash.errorAmountPositive'))
      const { error } = await supabase.rpc('record_cash_movement', {
        p_shift_id: shift.id,
        p_type: movementDialog,
        p_amount: amount,
        p_reason: movementReason.trim() || undefined,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      toast.success(t('common.saved'))
      setMovementDialog(null)
      setMovementAmount('')
      setMovementReason('')
      invalidateAll()
    },
    onError: (e) => toast.error(errorText(e)),
  })

  const closeMutation = useMutation({
    mutationFn: async () => {
      if (!shift?.id) throw new Error(t('common.error'))
      const { error } = await supabase.rpc('close_shift', {
        p_shift_id: shift.id,
        p_counted_cash: num(countedCash),
        p_notes: closeNotes.trim() || undefined,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      toast.success(t('cash.shiftClosed'))
      setCloseDialog(false)
      setCountedCash('')
      setCloseNotes('')
      invalidateAll()
    },
    onError: (e) => toast.error(errorText(e)),
  })

  const variance =
    expectedCash !== null && expectedCash !== undefined ? num(countedCash) - num(expectedCash) : 0

  const varianceTone = (v: number) => {
    if (v === 0) return 'success'
    if (Math.abs(v) < 50) return 'warning'
    return 'danger'
  }

  if (!locationId) {
    return (
      <Card>
        <CardBody>
          <p className="text-center text-sm text-moss">{t('cash.pickBranch')}</p>
        </CardBody>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardBody className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-moss">{t('common.loading')}</p>
          ) : shift ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-ink">
                    {t('pos.openedBy', { name: shift.profiles?.full_name || '—' })}
                  </p>
                  <p className="text-xs text-moss">
                    {t('pos.openedAt', {
                      time: format(new Date(shift.opened_at), 'p, d MMM', {
                        locale: locale === 'ar' ? ar : undefined,
                      }),
                    })}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={ArrowDownCircle}
                    onClick={() => setMovementDialog('pay_in')}
                  >
                    {t('cash.payIn')}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={ArrowUpCircle}
                    onClick={() => setMovementDialog('pay_out')}
                  >
                    {t('cash.payOut')}
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setCloseDialog(true)}>
                    {t('pos.closeShift')}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-sand pt-4 sm:grid-cols-3">
                <Tile label={t('pos.openingFloat')} value={formatMoney(shift.opening_float, locale)} />
                <Tile
                  label={t('pos.expectedCash')}
                  value={
                    expectedCash !== null && expectedCash !== undefined
                      ? formatMoney(expectedCash, locale)
                      : '—'
                  }
                />
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-ink">{t('pos.noOpenShift')}</p>
                <p className="text-xs text-moss">{t('cash.openToStart')}</p>
              </div>
              <Button onClick={() => setOpenDialog(true)}>{t('pos.openShift')}</Button>
            </div>
          )}
        </CardBody>
      </Card>

      <Modal
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        title={t('pos.openShift')}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpenDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => openMutation.mutate()} loading={openMutation.isPending}>
              {t('pos.openShift')}
            </Button>
          </div>
        }
      >
        <Input
          label={t('pos.openingFloat')}
          type="number"
          dir="ltr"
          step="0.01"
          min="0"
          value={openingFloat}
          onChange={(e) => setOpeningFloat(e.target.value)}
          required
        />
      </Modal>

      <Modal
        open={movementDialog !== null}
        onClose={() => setMovementDialog(null)}
        title={movementDialog === 'pay_in' ? t('cash.payIn') : t('cash.payOut')}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setMovementDialog(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => movementMutation.mutate()} loading={movementMutation.isPending}>
              {t('common.confirm')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label={t('cash.amount')}
            type="number"
            dir="ltr"
            step="0.01"
            min="0"
            value={movementAmount}
            onChange={(e) => setMovementAmount(e.target.value)}
            required
          />
          <Input
            label={t('cash.reason')}
            value={movementReason}
            onChange={(e) => setMovementReason(e.target.value)}
          />
        </div>
      </Modal>

      <Modal
        open={closeDialog}
        onClose={() => setCloseDialog(false)}
        title={t('pos.closeShift')}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCloseDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => closeMutation.mutate()} loading={closeMutation.isPending}>
              {t('pos.closeShift')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {expectedCash !== null && expectedCash !== undefined && (
            <div className="rounded-lg border border-sand bg-bone p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-moss">{t('pos.expectedCash')}</span>
                <span dir="ltr" className="text-sm font-medium text-ink">
                  {formatMoney(expectedCash, locale)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-moss">{t('pos.variance')}</span>
                <Badge tone={varianceTone(variance)}>{formatMoney(variance, locale)}</Badge>
              </div>
            </div>
          )}
          <Input
            label={t('pos.countedCash')}
            type="number"
            dir="ltr"
            step="0.01"
            min="0"
            value={countedCash}
            onChange={(e) => setCountedCash(e.target.value)}
            required
          />
          <Input
            label={t('cash.closeNotes')}
            value={closeNotes}
            onChange={(e) => setCloseNotes(e.target.value)}
          />
        </div>
      </Modal>
    </>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-sand p-3">
      <p className="text-xs text-moss">{label}</p>
      <p className="mt-1 text-lg font-semibold text-ink" dir="ltr">
        {value}
      </p>
    </div>
  )
}
