import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, type Tables, type Enums } from '@/lib/supabase'
import { useT, useLocale, useLocalized } from '@/lib/i18n'
import { useErrorText } from '@/lib/errors'
import { toast } from 'sonner'
import {
  Card,
  CardBody,
  Badge,
  Button,
  Select,
  Textarea,
  EmptyState,
  Skeleton,
} from '@/components/ui'
import { Star, MessageSquareText, Check, X } from 'lucide-react'
import { format } from 'date-fns'
import { ar } from 'date-fns/locale'

type Review = Tables<'reviews'> & {
  products: { name_en: string; name_ar: string } | null
}

function reviewStatusLabel(t: ReturnType<typeof useT>, status: Enums<'review_status'>): string {
  switch (status) {
    case 'pending':
      return t('cms.reviewPending')
    case 'approved':
      return t('cms.reviewApproved')
    case 'rejected':
      return t('cms.reviewRejected')
  }
}

export function ReviewsTab() {
  const t = useT()
  const errorText = useErrorText()
  const { locale } = useLocale()
  const getLocalized = useLocalized()
  const queryClient = useQueryClient()

  const [statusFilter, setStatusFilter] = useState<Enums<'review_status'> | ''>('pending')
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ['reviews', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('reviews')
        .select('*, products(name_en, name_ar)')
        .order('created_at', { ascending: false })
      if (statusFilter) query = query.eq('status', statusFilter)
      const { data, error } = await query
      if (error) throw error
      return (data as unknown as Review[]) || []
    },
  })

  const updateStatus = useMutation({
    mutationFn: async ({
      id,
      status,
      reply,
    }: {
      id: string
      status: Enums<'review_status'>
      reply?: string
    }) => {
      // A trigger recomputes products.rating_avg / rating_count — never write those here.
      const patch: Partial<Tables<'reviews'>> = { status }
      if (reply !== undefined) {
        patch.reply = reply.trim() || null
        patch.replied_at = reply.trim() ? new Date().toISOString() : null
      }
      const { error } = await supabase.from('reviews').update(patch).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      toast.success(t('common.saved'))
      queryClient.invalidateQueries({ queryKey: ['reviews'] })
    },
    onError: (e) => toast.error(errorText(e)),
  })

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value as Enums<'review_status'> | '')}
        className="w-48"
      >
        <option value="">{t('common.all')}</option>
        <option value="pending">{t('cms.reviewPending')}</option>
        <option value="approved">{t('cms.reviewApproved')}</option>
        <option value="rejected">{t('cms.reviewRejected')}</option>
      </Select>

      {reviews.length === 0 ? (
        <EmptyState icon={MessageSquareText} title={t('cms.noReviews')} />
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <Card key={r.id}>
              <CardBody className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {r.products ? getLocalized(r.products, 'name') : '—'}
                    </p>
                    <p className="text-xs text-moss">
                      {r.author_name} ·{' '}
                      {format(new Date(r.created_at), 'd MMM yyyy', {
                        locale: locale === 'ar' ? ar : undefined,
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-0.5" dir="ltr">
                      {Array.from({ length: 5 }, (_, i) => (
                        <Star
                          key={i}
                          className={
                            i < r.rating
                              ? 'h-4 w-4 fill-warning text-warning'
                              : 'h-4 w-4 text-sand'
                          }
                        />
                      ))}
                    </div>
                    <Badge
                      tone={
                        r.status === 'approved'
                          ? 'success'
                          : r.status === 'rejected'
                            ? 'danger'
                            : 'warning'
                      }
                    >
                      {reviewStatusLabel(t, r.status)}
                    </Badge>
                  </div>
                </div>

                {r.title && <p className="text-sm font-medium text-ink">{r.title}</p>}
                {r.body && <p className="text-sm text-moss">{r.body}</p>}

                <div className="space-y-2">
                  <Textarea
                    label={t('cms.replyLabel')}
                    rows={2}
                    defaultValue={r.reply ?? ''}
                    onChange={(e) =>
                      setReplyDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))
                    }
                  />
                </div>

                <div className="flex justify-end gap-2">
                  {r.status !== 'approved' && (
                    <Button
                      size="sm"
                      icon={Check}
                      onClick={() =>
                        updateStatus.mutate({
                          id: r.id,
                          status: 'approved',
                          reply: replyDrafts[r.id],
                        })
                      }
                      disabled={updateStatus.isPending}
                    >
                      {t('cms.approve')}
                    </Button>
                  )}
                  {r.status !== 'rejected' && (
                    <Button
                      size="sm"
                      variant="danger"
                      icon={X}
                      onClick={() =>
                        updateStatus.mutate({
                          id: r.id,
                          status: 'rejected',
                          reply: replyDrafts[r.id],
                        })
                      }
                      disabled={updateStatus.isPending}
                    >
                      {t('cms.reject')}
                    </Button>
                  )}
                  {replyDrafts[r.id] !== undefined && replyDrafts[r.id] !== (r.reply ?? '') && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        updateStatus.mutate({ id: r.id, status: r.status, reply: replyDrafts[r.id] })
                      }
                      disabled={updateStatus.isPending}
                    >
                      {t('cms.saveReply')}
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
