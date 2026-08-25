import { useState } from 'react'
import { useT } from '@/lib/i18n'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { useCan } from '@/lib/auth'
import { Card, CardBody, Tabs } from '@/components/ui'
import { ContentBlocksTab } from '@/admin/settings/ContentBlocksTab'
import { MarqueeTab } from '@/admin/settings/MarqueeTab'
import { CollectionsTab } from '@/admin/settings/CollectionsTab'
import { ReviewsTab } from '@/admin/settings/ReviewsTab'
import { NewsletterTab } from '@/admin/settings/NewsletterTab'

type TabId = 'hero' | 'marquee' | 'collections' | 'reviews' | 'newsletter'

export function StorefrontPage() {
  const t = useT()
  useDocumentTitle(t('nav.storefront'))
  const can = useCan()
  const allowed = can('cms')

  const [activeTab, setActiveTab] = useState<TabId>('hero')

  // Rule 1: guard after every hook.
  if (!allowed) {
    return (
      <div className="space-y-6 p-6">
        <h1 className="text-3xl font-display text-ink mb-2">{t('nav.storefront')}</h1>
        <Card>
          <CardBody>
            <p className="text-center text-moss">{t('error.notAuthorised')}</p>
          </CardBody>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-display text-ink mb-2">{t('nav.storefront')}</h1>
        <p className="text-moss">{t('page.storefrontDescription')}</p>
      </div>

      <Tabs
        active={activeTab}
        onChange={(id) => setActiveTab(id as TabId)}
        tabs={[
          { id: 'hero', label: t('cms.tabHero') },
          { id: 'marquee', label: t('cms.tabMarquee') },
          { id: 'collections', label: t('cms.tabCollections') },
          { id: 'reviews', label: t('cms.tabReviews') },
          { id: 'newsletter', label: t('cms.tabNewsletter') },
        ]}
      />

      {activeTab === 'hero' && <ContentBlocksTab />}
      {activeTab === 'marquee' && <MarqueeTab />}
      {activeTab === 'collections' && <CollectionsTab />}
      {activeTab === 'reviews' && <ReviewsTab />}
      {activeTab === 'newsletter' && <NewsletterTab />}
    </div>
  )
}
