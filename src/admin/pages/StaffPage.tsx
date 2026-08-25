import { Fragment, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, type Tables, type Enums } from '@/lib/supabase'
import { useT, useLocale, useLocalized } from '@/lib/i18n'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { useErrorText } from '@/lib/errors'
import { useAuth, useCan } from '@/lib/auth'
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
  Select,
  EmptyState,
  Skeleton,
  Pagination,
} from '@/components/ui'
import { UserCog, ShieldAlert, ChevronDown, ChevronUp, History } from 'lucide-react'
import { format } from 'date-fns'
import { ar } from 'date-fns/locale'

const AUDIT_PER_PAGE = 25

type Profile = Tables<'profiles'>
type Location = { id: string; name_en: string; name_ar: string }
type AuditRow = Tables<'audit_log'> & {
  actor: { full_name: string | null } | null
}

const ROLE_ORDER: Enums<'app_role'>[] = [
  'owner',
  'manager',
  'cashier',
  'stock',
  'viewer',
  'customer',
]

export function StaffPage() {
  const t = useT()
  useDocumentTitle(t('nav.staff'))
  const errorText = useErrorText()
  const { locale } = useLocale()
  const getLocalized = useLocalized()
  const { user, role: myRole } = useAuth()
  const can = useCan()
  const allowed = can('staff')
  const queryClient = useQueryClient()

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ['profiles', 'staff'],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .neq('role', 'customer')
        .order('created_at', { ascending: true })
      if (error) {
        toast.error(errorText(error))
        throw error
      }
      return (data as Profile[]) || []
    },
  })

  const { data: locations = [] } = useQuery({
    queryKey: ['locations', 'all'],
    enabled: allowed,
    queryFn: async () => {
      const { data } = await supabase
        .from('locations')
        .select('id, name_en, name_ar')
        .order('position')
      return (data as Location[]) || []
    },
  })

  const ownerCount = staff.filter((p) => p.role === 'owner' && p.is_active).length

  const updateRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: Enums<'app_role'> }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ role })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      toast.success(t('common.saved'))
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
    onError: (e) =>
      toast.error(errorText(e)),
  })

  const updateActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      toast.success(t('common.saved'))
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
    onError: (e) =>
      toast.error(errorText(e)),
  })

  const updateLocation = useMutation({
    mutationFn: async ({
      id,
      location_id,
    }: {
      id: string
      location_id: string | null
    }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ location_id })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      toast.success(t('common.saved'))
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
    onError: (e) =>
      toast.error(errorText(e)),
  })

  // Rule 1: guard after every hook.
  if (!allowed) {
    return (
      <div className="space-y-6 p-6">
        <h1 className="text-3xl font-display text-ink mb-2">{t('nav.staff')}</h1>
        <Card>
          <CardBody>
            <p className="text-center text-moss">{t('error.notAuthorised')}</p>
          </CardBody>
        </Card>
      </div>
    )
  }

  const isSelf = (p: Profile) => p.id === user?.id
  const iAmOwner = myRole === 'owner'

  // Guard rails from the spec: only owners may promote/demote to/from owner;
  // nobody may change their own role; the last active owner cannot be demoted.
  const roleOptionsFor = (p: Profile): Enums<'app_role'>[] => {
    return ROLE_ORDER.filter((r) => {
      if (r === 'owner' && !iAmOwner && p.role !== 'owner') return false
      return true
    })
  }

  const canChangeRole = (p: Profile) => {
    if (isSelf(p)) return false
    if (p.role === 'owner' && !iAmOwner) return false
    if (p.role === 'owner' && ownerCount <= 1) return false
    return true
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-display text-ink mb-2">{t('nav.staff')}</h1>
        <p className="text-moss">{t('page.staffDescription')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('staff.invitePanelTitle')}</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-moss">{t('staff.invitePanelBody')}</p>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : staff.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={UserCog}
                title={t('staff.empty')}
                description={t('staff.emptyDescription')}
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>{t('staff.name')}</TH>
                  <TH>{t('staff.phone')}</TH>
                  <TH>{t('staff.role')}</TH>
                  <TH>{t('staff.branch')}</TH>
                  <TH>{t('common.status')}</TH>
                  <TH>{t('staff.lastSeen')}</TH>
                </TR>
              </THead>
              <TBody>
                {staff.map((p) => {
                  const self = isSelf(p)
                  const roleEditable = canChangeRole(p)
                  const activeEditable = !self

                  return (
                    <TR key={p.id}>
                      <TD className="font-medium">
                        {p.full_name || '—'}
                        {self && (
                          <span className="ms-2 text-xs text-moss">
                            {t('staff.you')}
                          </span>
                        )}
                      </TD>
                      <TD dir="ltr">{p.phone || '—'}</TD>
                      <TD>
                        {roleEditable ? (
                          <Select
                            value={p.role}
                            onChange={(e) =>
                              updateRole.mutate({
                                id: p.id,
                                role: e.target.value as Enums<'app_role'>,
                              })
                            }
                            className="w-36"
                          >
                            {roleOptionsFor(p).map((r) => (
                              <option key={r} value={r}>
                                {t(`role.${r}`)}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <div>
                            <Badge tone={p.role === 'owner' ? 'info' : 'neutral'}>
                              {t(`role.${p.role}`)}
                            </Badge>
                            <p className="mt-1 text-xs text-moss">
                              {self
                                ? t('staff.cannotChangeSelf')
                                : p.role === 'owner' && ownerCount <= 1
                                  ? t('staff.lastOwner')
                                  : t('staff.ownerOnly')}
                            </p>
                          </div>
                        )}
                      </TD>
                      <TD>
                        <Select
                          value={p.location_id || ''}
                          onChange={(e) =>
                            updateLocation.mutate({
                              id: p.id,
                              location_id: e.target.value || null,
                            })
                          }
                          className="w-36"
                        >
                          <option value="">{t('staff.noBranch')}</option>
                          {locations.map((loc) => (
                            <option key={loc.id} value={loc.id}>
                              {getLocalized(loc, 'name')}
                            </option>
                          ))}
                        </Select>
                      </TD>
                      <TD>
                        {activeEditable ? (
                          <Button
                            size="sm"
                            variant={p.is_active ? 'secondary' : 'primary'}
                            onClick={() =>
                              updateActive.mutate({
                                id: p.id,
                                is_active: !p.is_active,
                              })
                            }
                            disabled={updateActive.isPending}
                          >
                            {p.is_active
                              ? t('staff.deactivate')
                              : t('staff.activate')}
                          </Button>
                        ) : (
                          <div>
                            <Badge tone={p.is_active ? 'success' : 'neutral'}>
                              {p.is_active
                                ? t('staff.active')
                                : t('staff.inactive')}
                            </Badge>
                            <p className="mt-1 text-xs text-moss">
                              {t('staff.cannotDeactivateSelf')}
                            </p>
                          </div>
                        )}
                      </TD>
                      <TD className="text-sm text-moss">
                        {p.last_seen_at
                          ? format(new Date(p.last_seen_at), 'd MMM yyyy HH:mm', {
                              locale: locale === 'ar' ? ar : undefined,
                            })
                          : '—'}
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <AuditLogSection />
    </div>
  )
}

/* --------------------------- Audit log --------------------------- */

function AuditLogSection() {
  const t = useT()
  const errorText = useErrorText()
  const { locale } = useLocale()
  const [page, setPage] = useState(1)
  const [entityFilter, setEntityFilter] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data: entities = [] } = useQuery({
    queryKey: ['audit_log', 'entities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_log')
        .select('entity')
        .order('entity')
      if (error) return []
      return Array.from(new Set((data || []).map((r) => r.entity)))
    },
  })

  const { data: result = { data: [], count: 0 }, isLoading } = useQuery({
    queryKey: ['audit_log', page, entityFilter],
    queryFn: async () => {
      let query = supabase
        .from('audit_log')
        .select('*, actor:profiles(full_name)', { count: 'exact' })

      if (entityFilter) query = query.eq('entity', entityFilter)

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range((page - 1) * AUDIT_PER_PAGE, page * AUDIT_PER_PAGE - 1)

      if (error) {
        toast.error(errorText(error))
        throw error
      }
      return { data: (data as unknown as AuditRow[]) || [], count: count || 0 }
    },
  })

  const totalPages = Math.ceil((result.count || 0) / AUDIT_PER_PAGE)

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2">
          <History className="h-4 w-4" /> {t('staff.auditLog')}
        </CardTitle>
        <Select
          value={entityFilter}
          onChange={(e) => {
            setEntityFilter(e.target.value)
            setPage(1)
          }}
          className="w-48"
        >
          <option value="">{t('common.all')}</option>
          {entities.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </Select>
      </CardHeader>
      <CardBody className="p-0">
        {isLoading ? (
          <div className="space-y-3 p-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : result.data.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={ShieldAlert}
              title={t('staff.auditEmpty')}
              description={t('staff.auditEmptyDescription')}
            />
          </div>
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>{t('staff.auditActor')}</TH>
                  <TH>{t('staff.auditAction')}</TH>
                  <TH>{t('staff.auditEntity')}</TH>
                  <TH>{t('staff.auditTime')}</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {result.data.map((row) => (
                  <Fragment key={row.id}>
                    <TR
                      onClick={() =>
                        setExpanded(expanded === row.id ? null : row.id)
                      }
                      className="cursor-pointer hover:bg-sand/40"
                    >
                      <TD>{row.actor?.full_name || t('staff.auditSystem')}</TD>
                      <TD dir="ltr" className="text-sm">
                        {row.action}
                      </TD>
                      <TD className="text-sm">
                        {row.entity}
                        {row.entity_id && (
                          <span className="ms-1 text-xs text-moss" dir="ltr">
                            #{row.entity_id.slice(0, 8)}
                          </span>
                        )}
                      </TD>
                      <TD className="text-sm text-moss">
                        {format(new Date(row.created_at), 'd MMM yyyy HH:mm', {
                          locale: locale === 'ar' ? ar : undefined,
                        })}
                      </TD>
                      <TD>
                        {row.changes &&
                          (expanded === row.id ? (
                            <ChevronUp className="h-4 w-4 text-moss" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-moss" />
                          ))}
                      </TD>
                    </TR>
                    {expanded === row.id && row.changes && (
                      <TR>
                        <TD colSpan={5} className="bg-bone/50">
                          <pre className="overflow-x-auto text-xs text-ink" dir="ltr">
                            {JSON.stringify(row.changes, null, 2)}
                          </pre>
                        </TD>
                      </TR>
                    )}
                  </Fragment>
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
  )
}
