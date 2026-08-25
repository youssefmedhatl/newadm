import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, type Tables } from '@/lib/supabase'
import { useT, useLocalized } from '@/lib/i18n'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { useAuth, useCan } from '@/lib/auth'
import { Card, CardBody, Select } from '@/components/ui'
import { ShiftPanel } from '@/admin/cash/ShiftPanel'
import { ShiftHistoryList } from '@/admin/cash/ShiftHistoryList'
import { ExpensesSection } from '@/admin/cash/ExpensesSection'
import { ZReportSection } from '@/admin/cash/ZReportSection'

type Location = Pick<Tables<'locations'>, 'id' | 'name_en' | 'name_ar'>

export function CashPage() {
  const t = useT()
  useDocumentTitle(t('nav.cash'))
  const getLocalized = useLocalized()
  const { profile } = useAuth()
  const can = useCan()
  const allowed = can('cash')

  const [locationId, setLocationId] = useState('')

  const { data: locations = [] } = useQuery({
    queryKey: ['locations', 'active'],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('locations')
        .select('id, name_en, name_ar')
        .eq('is_active', true)
        .order('position')
      if (error) return []
      return (data as Location[]) || []
    },
  })

  // Pick a default location once profile/locations data is available.
  // Setting state during render here (guarded by `!locationId`, so it only
  // fires once and converges) avoids the extra render pass a useEffect
  // would cost, and the flash of "no location selected" that came with it.
  if (!locationId) {
    if (profile?.location_id) {
      setLocationId(profile.location_id)
    } else if (locations.length > 0) {
      setLocationId(locations[0].id)
    }
  }

  const { data: openShift } = useQuery({
    queryKey: ['cash', 'open_shift_id', locationId],
    enabled: allowed && !!locationId,
    queryFn: async () => {
      const { data } = await supabase
        .from('shifts')
        .select('id')
        .eq('location_id', locationId)
        .eq('status', 'open')
        .maybeSingle()
      return data?.id ?? null
    },
  })

  // Rule 1: guard after every hook.
  if (!allowed) {
    return (
      <div className="space-y-6 p-6">
        <h1 className="text-3xl font-display text-ink mb-2">{t('nav.cash')}</h1>
        <Card>
          <CardBody>
            <p className="text-center text-moss">{t('error.notAuthorised')}</p>
          </CardBody>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-display text-ink mb-2">{t('nav.cash')}</h1>
          <p className="text-moss">{t('page.cashDescription')}</p>
        </div>
        <Select
          label={t('reports.branch')}
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          className="w-56"
        >
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {getLocalized(loc, 'name')}
            </option>
          ))}
        </Select>
      </div>

      <div className="print:hidden space-y-6">
        <ShiftPanel locationId={locationId} />
        <ExpensesSection locationId={locationId} shiftId={openShift ?? null} />
        <ShiftHistoryList locationId={locationId} />
      </div>

      <ZReportSection locationId={locationId} locations={locations} />
    </div>
  )
}
