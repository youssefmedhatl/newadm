import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { supabase, Tables } from '@/lib/supabase'
import { useT, useLocale } from '@/lib/i18n'
import { useErrorText } from '@/lib/errors'
import { formatMoney, num } from '@/lib/money'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Card, CardBody } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ar as dateAr } from 'date-fns/locale'

interface Shift {
  id: string
  location_id: string
  status: string
  opening_float: number | string
  opened_at: string | null
  closed_at: string | null
  profiles?: { full_name: string }
}

interface ShiftBarProps {
  locationId: string
  onLocationChange: (id: string) => void
}

export function ShiftBar({ locationId, onLocationChange }: ShiftBarProps) {
  const t = useT()
  const errorText = useErrorText()
  const { locale } = useLocale()
  const queryClient = useQueryClient()
  const [openingFloat, setOpeningFloat] = useState('')
  const [countedCash, setCountedCash] = useState('')
  const [closeNotes, setCloseNotes] = useState('')
  const [showOpenDialog, setShowOpenDialog] = useState(false)
  const [showCloseDialog, setShowCloseDialog] = useState(false)

  // Fetch active locations
  const { data: locations = [] } = useQuery({
    queryKey: ['locations', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .eq('is_active', true)
        .order('position')

      if (error) throw error
      return data as Tables<'locations'>[]
    },
  })

  // Fetch open shift for selected location
  const { data: openShift } = useQuery<Shift | null>({
    queryKey: ['shifts', locationId, 'open'],
    queryFn: async () => {
      if (!locationId) return null
      const { data, error } = await supabase
        .from('shifts')
        .select('*, profiles(full_name)')
        .eq('location_id', locationId)
        .eq('status', 'open')
        .maybeSingle()

      if (error) throw error
      return data as Shift | null
    },
    enabled: !!locationId,
  })

  // Fetch expected cash for shift
  const { data: expectedCash } = useQuery({
    queryKey: ['shifts', openShift?.id, 'expected-cash'],
    queryFn: async () => {
      if (!openShift?.id) return null
      const { data, error } = await supabase.rpc('shift_expected_cash', {
        p_shift_id: openShift.id,
      })

      if (error) throw error
      return data
    },
    enabled: !!openShift?.id,
  })

  // Open shift mutation
  const openShiftMutation = useMutation({
    mutationFn: async () => {
      if (!locationId) throw new Error(t('pos.errorLocationRequired'))
      if (!openingFloat) throw new Error(t('pos.errorOpeningFloatRequired'))

      const { data, error } = await supabase.rpc('open_shift', {
        p_location_id: locationId,
        p_opening_float: num(openingFloat),
      })

      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success(t('pos.openShift'))
      queryClient.invalidateQueries({ queryKey: ['shifts'] })
      setShowOpenDialog(false)
      setOpeningFloat('')
    },
    onError: (err: Error) => {
      toast.error(errorText(err))
    },
  })

  // Close shift mutation
  const closeShiftMutation = useMutation({
    mutationFn: async () => {
      if (!openShift?.id) throw new Error(t('pos.errorNoOpenShift'))
      if (!countedCash) throw new Error(t('pos.errorCountedCashRequired'))

      const { data, error } = await supabase.rpc('close_shift', {
        p_shift_id: openShift.id,
        p_counted_cash: num(countedCash),
        p_notes: closeNotes || undefined,
      })

      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success(t('pos.closeShift'))
      queryClient.invalidateQueries({ queryKey: ['shifts'] })
      setShowCloseDialog(false)
      setCountedCash('')
      setCloseNotes('')
    },
    onError: (err: Error) => {
      toast.error(errorText(err))
    },
  })

  const variance = expectedCash !== null && expectedCash !== undefined
    ? num(countedCash) - num(expectedCash)
    : 0

  const getVarianceTone = (v: number) => {
    if (v === 0) return 'success'
    if (Math.abs(v) < 50) return 'warning'
    return 'danger'
  }

  const formatTime = (date: string | null | undefined) => {
    if (!date) return ''
    return format(new Date(date), 'p', {
      locale: locale === 'ar' ? dateAr : undefined,
    })
  }

  return (
    <>
      <Card className="mb-6">
        <CardBody className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
            <div className="flex-1 min-w-0">
              <Select
                label={t('pos.selectLocation')}
                value={locationId}
                onChange={(e) => onLocationChange(e.target.value)}
                options={locations.map((l) => ({
                  value: l.id,
                  label: locale === 'ar' ? l.name_ar : l.name_en,
                }))}
              />
            </div>

            {openShift ? (
              <div className="flex gap-2 items-end w-full sm:w-auto">
                <Button
                  variant="danger"
                  onClick={() => setShowCloseDialog(true)}
                  disabled={closeShiftMutation.isPending}
                  className="flex-1 sm:flex-none"
                >
                  {t('pos.closeShift')}
                </Button>
              </div>
            ) : (
              <Button
                variant="primary"
                onClick={() => setShowOpenDialog(true)}
                className="w-full sm:w-auto"
              >
                {t('pos.openShift')}
              </Button>
            )}
          </div>

          {openShift && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-sand">
              <div>
                <p className="text-xs text-moss mb-1">{t('pos.openedBy')}</p>
                <p className="text-sm font-medium text-ink">
                  {openShift.profiles?.full_name || '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-moss mb-1">{t('pos.openedAt')}</p>
                <p className="text-sm font-medium text-ink">
                  {formatTime(openShift.opened_at)}
                </p>
              </div>
              <div>
                <p className="text-xs text-moss mb-1">{t('pos.openingFloat')}</p>
                <p className="text-sm font-medium text-ink" dir="ltr">
                  {formatMoney(openShift.opening_float, locale)}
                </p>
              </div>
              <div>
                <p className="text-xs text-moss mb-1">{t('pos.expectedCash')}</p>
                <p className="text-sm font-medium text-ink" dir="ltr">
                  {expectedCash !== null && expectedCash !== undefined
                    ? formatMoney(expectedCash, locale)
                    : '—'}
                </p>
              </div>
            </div>
          )}

          {!openShift && (
            <div className="bg-warning/10 border border-warning rounded-lg p-4 flex items-start gap-3">
              <div className="flex-1">
                <p className="text-sm font-medium text-ink mb-1">
                  {t('pos.noOpenShift')}
                </p>
                <p className="text-xs text-moss">{t('pos.sellBlockedNoShift')}</p>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Open Shift Dialog */}
      <Modal
        open={showOpenDialog}
        onClose={() => setShowOpenDialog(false)}
        title={t('pos.openShift')}
        size="sm"
        footer={
          <div className="flex gap-3 justify-end">
            <Button
              variant="secondary"
              onClick={() => setShowOpenDialog(false)}
              disabled={openShiftMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => openShiftMutation.mutate()}
              loading={openShiftMutation.isPending}
            >
              {t('pos.openShift')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label={t('pos.openingFloat')}
            type="number"
            step="0.01"
            min="0"
            value={openingFloat}
            onChange={(e) => setOpeningFloat(e.target.value)}
            placeholder="0.00"
            required
          />
        </div>
      </Modal>

      {/* Close Shift Dialog */}
      <Modal
        open={showCloseDialog}
        onClose={() => setShowCloseDialog(false)}
        title={t('pos.closeShift')}
        size="sm"
        footer={
          <div className="flex gap-3 justify-end">
            <Button
              variant="secondary"
              onClick={() => setShowCloseDialog(false)}
              disabled={closeShiftMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => closeShiftMutation.mutate()}
              loading={closeShiftMutation.isPending}
            >
              {t('pos.closeShift')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {expectedCash !== null && expectedCash !== undefined && (
            <div className="bg-bone p-4 rounded-lg border border-sand">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-moss">{t('pos.expectedCash')}</p>
                <p className="text-sm font-medium text-ink" dir="ltr">
                  {formatMoney(expectedCash, locale)}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-moss">{t('pos.variance')}</p>
                <Badge tone={getVarianceTone(variance)}>
                  {formatMoney(variance, locale)}
                </Badge>
              </div>
            </div>
          )}

          <Input
            label={t('pos.countedCash')}
            type="number"
            step="0.01"
            min="0"
            value={countedCash}
            onChange={(e) => setCountedCash(e.target.value)}
            placeholder="0.00"
            required
          />

          <Input
            label={t('common.actions')}
            value={closeNotes}
            onChange={(e) => setCloseNotes(e.target.value)}
            placeholder={t('common.none')}
          />
        </div>
      </Modal>
    </>
  )
}
