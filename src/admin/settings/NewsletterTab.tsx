import { useQuery } from '@tanstack/react-query'
import { supabase, type Tables } from '@/lib/supabase'
import { useT, useLocale } from '@/lib/i18n'
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
  EmptyState,
  Skeleton,
} from '@/components/ui'
import { Mail, Download } from 'lucide-react'
import { format } from 'date-fns'
import { ar } from 'date-fns/locale'
import { buildCsv, downloadCsv } from '@/admin/reports/csv'

type Subscriber = Tables<'newsletter_subscribers'>

export function NewsletterTab() {
  const t = useT()
  const { locale } = useLocale()

  const { data: subscribers = [], isLoading } = useQuery({
    queryKey: ['newsletter_subscribers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('newsletter_subscribers')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data as Subscriber[]) || []
    },
  })

  const handleExport = () => {
    const headers = [t('cms.email'), t('cms.subscribed'), t('cms.source'), t('cash.date')]
    const rows = subscribers.map((s) => [
      s.email,
      s.is_subscribed ? t('common.confirm') : '—',
      s.source || '—',
      format(new Date(s.created_at), 'yyyy-MM-dd'),
    ])
    downloadCsv('newsletter-subscribers.csv', buildCsv(headers, rows))
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" variant="secondary" icon={Download} onClick={handleExport}>
          {t('reports.exportCsv')}
        </Button>
      </div>

      {subscribers.length === 0 ? (
        <EmptyState icon={Mail} title={t('cms.noSubscribers')} />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH dir="ltr">{t('cms.email')}</TH>
                <TH>{t('cms.subscribed')}</TH>
                <TH>{t('cms.source')}</TH>
                <TH>{t('cash.date')}</TH>
              </TR>
            </THead>
            <TBody>
              {subscribers.map((s) => (
                <TR key={s.id}>
                  <TD dir="ltr">{s.email}</TD>
                  <TD>
                    <Badge tone={s.is_subscribed ? 'success' : 'neutral'}>
                      {s.is_subscribed ? t('cms.subscribed') : t('cms.unsubscribed')}
                    </Badge>
                  </TD>
                  <TD className="text-sm text-moss">{s.source || '—'}</TD>
                  <TD className="text-sm text-moss">
                    {format(new Date(s.created_at), 'd MMM yyyy', {
                      locale: locale === 'ar' ? ar : undefined,
                    })}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
