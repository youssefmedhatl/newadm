import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, type Tables } from '@/lib/supabase'
import { useT, useLocalized } from '@/lib/i18n'
import { useErrorText } from '@/lib/errors'
import { toast } from 'sonner'
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
  Button,
  Input,
  Modal,
  ConfirmDialog,
  EmptyState,
  Skeleton,
} from '@/components/ui'
import { Store, Plus, Edit2 } from 'lucide-react'

type Location = Tables<'locations'>

interface BranchesTabProps {
  canWrite: boolean
}

export function BranchesTab({ canWrite }: BranchesTabProps) {
  const t = useT()
  const errorText = useErrorText()
  const getLocalized = useLocalized()
  const queryClient = useQueryClient()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Location | null>(null)
  const [pendingDeactivate, setPendingDeactivate] = useState<Location | null>(null)

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ['locations', 'settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('locations').select('*').order('position')
      if (error) throw error
      return (data as Location[]) || []
    },
  })

  const onlineSellingCount = locations.filter((l) => l.is_active && l.sells_online).length

  const toggleField = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Location> }) => {
      const { error } = await supabase.from('locations').update(patch).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      toast.success(t('common.saved'))
      queryClient.invalidateQueries({ queryKey: ['locations'] })
    },
    onError: (e) => toast.error(errorText(e)),
  })

  const handleToggleActive = (loc: Location) => {
    if (loc.is_active && loc.sells_online && onlineSellingCount <= 1) {
      setPendingDeactivate(loc)
      return
    }
    toggleField.mutate({ id: loc.id, patch: { is_active: !loc.is_active } })
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-moss">{t('settings.branchesHint')}</p>

      {canWrite && (
        <div className="flex justify-end">
          <Button
            size="sm"
            icon={Plus}
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            {t('settings.addBranch')}
          </Button>
        </div>
      )}

      {locations.length === 0 ? (
        <EmptyState icon={Store} title={t('settings.noBranches')} />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>{t('settings.branchName')}</TH>
                <TH dir="ltr">{t('settings.branchCode')}</TH>
                <TH>{t('settings.warehouse')}</TH>
                <TH>{t('settings.sellsOnline')}</TH>
                <TH>{t('common.status')}</TH>
                {canWrite && <TH>{t('common.actions')}</TH>}
              </TR>
            </THead>
            <TBody>
              {locations.map((loc) => (
                <TR key={loc.id}>
                  <TD className="font-medium">{getLocalized(loc, 'name')}</TD>
                  <TD dir="ltr" className="font-mono text-sm">
                    {loc.code || '—'}
                  </TD>
                  <TD>
                    {loc.is_warehouse ? (
                      <Badge tone="neutral">{t('common.confirm')}</Badge>
                    ) : (
                      '—'
                    )}
                  </TD>
                  <TD>
                    {canWrite ? (
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={loc.sells_online}
                          onChange={(e) =>
                            toggleField.mutate({
                              id: loc.id,
                              patch: { sells_online: e.target.checked },
                            })
                          }
                          className="rounded"
                        />
                      </label>
                    ) : loc.sells_online ? (
                      <Badge tone="info">{t('common.confirm')}</Badge>
                    ) : (
                      '—'
                    )}
                  </TD>
                  <TD>
                    <Badge tone={loc.is_active ? 'success' : 'neutral'}>
                      {loc.is_active ? t('discounts.active') : t('discounts.inactive')}
                    </Badge>
                  </TD>
                  {canWrite && (
                    <TD>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => handleToggleActive(loc)}>
                          {loc.is_active ? t('discounts.deactivate') : t('discounts.activate')}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          aria-label={t('common.edit')}
                          onClick={() => {
                            setEditing(loc)
                            setFormOpen(true)
                          }}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      {formOpen && <BranchFormModal location={editing} onClose={() => setFormOpen(false)} />}

      <ConfirmDialog
        open={pendingDeactivate !== null}
        tone="danger"
        title={t('settings.lastOnlineBranchTitle')}
        message={t('settings.lastOnlineBranchWarning')}
        confirmLabel={t('discounts.deactivate')}
        loading={toggleField.isPending}
        onCancel={() => setPendingDeactivate(null)}
        onConfirm={() => {
          if (pendingDeactivate) {
            toggleField.mutate({ id: pendingDeactivate.id, patch: { is_active: false } })
          }
          setPendingDeactivate(null)
        }}
      />
    </div>
  )
}

function BranchFormModal({
  location,
  onClose,
}: {
  location: Location | null
  onClose: () => void
}) {
  const t = useT()
  const errorText = useErrorText()
  const queryClient = useQueryClient()

  const [nameEn, setNameEn] = useState(location?.name_en ?? '')
  const [nameAr, setNameAr] = useState(location?.name_ar ?? '')
  const [code, setCode] = useState(location?.code ?? '')
  const [address, setAddress] = useState(location?.address ?? '')
  const [city, setCity] = useState(location?.city ?? '')
  const [phone, setPhone] = useState(location?.phone ?? '')
  const [isWarehouse, setIsWarehouse] = useState(location?.is_warehouse ?? false)
  const [sellsOnline, setSellsOnline] = useState(location?.sells_online ?? true)

  const save = useMutation({
    mutationFn: async () => {
      if (!nameEn.trim() || !nameAr.trim()) throw new Error(t('cms.errorTitleRequired'))

      const payload = {
        name_en: nameEn.trim(),
        name_ar: nameAr.trim(),
        code: code.trim() || null,
        address: address.trim() || null,
        city: city.trim() || null,
        phone: phone.trim() || null,
        is_warehouse: isWarehouse,
        sells_online: sellsOnline,
      }

      const { error } = location
        ? await supabase.from('locations').update(payload).eq('id', location.id)
        : await supabase.from('locations').insert(payload)

      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      toast.success(t('common.saved'))
      queryClient.invalidateQueries({ queryKey: ['locations'] })
      onClose()
    },
    onError: (e) => toast.error(errorText(e)),
  })

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={location ? t('settings.editBranch') : t('settings.addBranch')}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label={`${t('settings.branchName')} (EN)`} required value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
          <Input label={`${t('settings.branchName')} (AR)`} required dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
        </div>
        <Input label={t('settings.branchCode')} dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} />
        <Input label={t('purchasing.address')} value={address} onChange={(e) => setAddress(e.target.value)} />
        <Input label={t('customers.city')} value={city} onChange={(e) => setCity(e.target.value)} />
        <Input label={t('purchasing.phone')} dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={isWarehouse} onChange={(e) => setIsWarehouse(e.target.checked)} className="rounded" />
          <span className="text-sm text-ink">{t('settings.warehouse')}</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={sellsOnline} onChange={(e) => setSellsOnline(e.target.checked)} className="rounded" />
          <span className="text-sm text-ink">{t('settings.sellsOnline')}</span>
        </label>
        <p className="text-xs text-moss">{t('settings.sellsOnlineHint')}</p>
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
