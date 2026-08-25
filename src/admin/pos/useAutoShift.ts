import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, Tables } from '@/lib/supabase'

/**
 * The shop runs a single branch and doesn't want cashiers dealing with a
 * branch picker or an open/close-shift step — POS should just work. This
 * hook silently:
 *
 *  1. Picks the shop's one active location (no picker shown).
 *  2. Opens a shift for it in the background if none is already open, with
 *     a 0 opening float — cash counting/reconciliation isn't exposed in
 *     this simplified build (the Cash tab that used to show it is hidden).
 *
 * The `shifts` table and open/close RPCs still exist and still work exactly
 * as before; this just stops asking the cashier about them.
 */
export function useAutoShift() {
  const queryClient = useQueryClient()

  const { data: location = null } = useQuery({
    queryKey: ['locations', 'primary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .eq('is_active', true)
        .order('position')
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as Tables<'locations'> | null
    },
  })

  const locationId = location?.id ?? ''

  const {
    data: openShift = null,
    isFetched: shiftChecked,
  } = useQuery({
    queryKey: ['shifts', locationId, 'open'],
    queryFn: async () => {
      if (!locationId) return null
      const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .eq('location_id', locationId)
        .eq('status', 'open')
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!locationId,
  })

  const openShiftMutation = useMutation({
    mutationFn: async () => {
      if (!locationId) return null
      const { data, error } = await supabase.rpc('open_shift', {
        p_location_id: locationId,
        p_opening_float: 0,
      })
      if (error) throw error
      return data
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts', locationId, 'open'] })
    },
    // Someone else opening it in the same instant is fine — just re-check,
    // don't show the cashier an error about a step they never see.
    onError: () => {},
  })

  // Guards against React Strict Mode's double-invoke firing this twice.
  const attemptedFor = useRef<string | null>(null)

  useEffect(() => {
    if (
      locationId &&
      shiftChecked &&
      openShift === null &&
      attemptedFor.current !== locationId &&
      !openShiftMutation.isPending
    ) {
      attemptedFor.current = locationId
      openShiftMutation.mutate()
    }
  }, [locationId, shiftChecked, openShift, openShiftMutation])

  return {
    location,
    locationId,
    openShift,
    /** True once we've resolved a location and either found or opened a shift. */
    ready: !!locationId && !!openShift,
  }
}
