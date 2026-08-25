import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, type Tables } from '@/lib/supabase'
import { useT } from '@/lib/i18n'
import { useErrorText } from '@/lib/errors'
import { toast } from 'sonner'
import {
  Card,
  CardBody,
  Button,
  Input,
  EmptyState,
  Skeleton,
  ConfirmDialog,
} from '@/components/ui'
import { Megaphone, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react'

type Marquee = Tables<'marquee_messages'>

export function MarqueeTab() {
  const t = useT()
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const [deleting, setDeleting] = useState<Marquee | null>(null)

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['marquee_messages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marquee_messages')
        .select('*')
        .order('position')
      if (error) throw error
      return (data as Marquee[]) || []
    },
  })

  const updateField = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Marquee> }) => {
      const { error } = await supabase.from('marquee_messages').update(patch).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['marquee_messages'] }),
    onError: (e) => toast.error(errorText(e)),
  })

  const addMessage = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('marquee_messages').insert({
        text_en: t('cms.newMessagePlaceholderEn'),
        text_ar: t('cms.newMessagePlaceholderAr'),
        position: messages.length,
        is_active: true,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      toast.success(t('common.created'))
      queryClient.invalidateQueries({ queryKey: ['marquee_messages'] })
    },
    onError: (e) => toast.error(errorText(e)),
  })

  const remove = useMutation({
    mutationFn: async (m: Marquee) => {
      const { error } = await supabase.from('marquee_messages').delete().eq('id', m.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      toast.success(t('common.saved'))
      setDeleting(null)
      queryClient.invalidateQueries({ queryKey: ['marquee_messages'] })
    },
    onError: (e) => toast.error(errorText(e)),
  })

  const move = async (idx: number, delta: number) => {
    const newIdx = idx + delta
    if (newIdx < 0 || newIdx >= messages.length) return
    const a = messages[idx]
    const b = messages[newIdx]
    await Promise.all([
      supabase.from('marquee_messages').update({ position: b.position }).eq('id', a.id),
      supabase.from('marquee_messages').update({ position: a.position }).eq('id', b.id),
    ])
    queryClient.invalidateQueries({ queryKey: ['marquee_messages'] })
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" icon={Plus} onClick={() => addMessage.mutate()} disabled={addMessage.isPending}>
          {t('cms.addMessage')}
        </Button>
      </div>

      {messages.length === 0 ? (
        <EmptyState icon={Megaphone} title={t('cms.noMessages')} />
      ) : (
        <div className="space-y-3">
          {messages.map((m, idx) => (
            <Card key={m.id}>
              <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex shrink-0 flex-col gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t('cms.moveUp')}
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t('cms.moveDown')}
                    onClick={() => move(idx, 1)}
                    disabled={idx === messages.length - 1}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    label={`${t('cms.text')} (EN)`}
                    defaultValue={m.text_en}
                    onBlur={(e) =>
                      e.target.value !== m.text_en &&
                      updateField.mutate({ id: m.id, patch: { text_en: e.target.value } })
                    }
                  />
                  <Input
                    label={`${t('cms.text')} (AR)`}
                    dir="rtl"
                    defaultValue={m.text_ar}
                    onBlur={(e) =>
                      e.target.value !== m.text_ar &&
                      updateField.mutate({ id: m.id, patch: { text_ar: e.target.value } })
                    }
                  />
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={m.is_active}
                      onChange={(e) =>
                        updateField.mutate({ id: m.id, patch: { is_active: e.target.checked } })
                      }
                      className="rounded"
                    />
                    <span className="text-sm text-ink">{t('cms.isActive')}</span>
                  </label>
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={t('common.delete')}
                    onClick={() => setDeleting(m)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        tone="danger"
        title={t('cms.deleteMessageTitle')}
        message={t('cms.deleteMessageWarning')}
        confirmLabel={t('common.delete')}
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </div>
  )
}
