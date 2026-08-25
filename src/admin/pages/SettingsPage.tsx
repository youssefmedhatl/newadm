import { useState } from 'react'
import { useT } from '@/lib/i18n'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { useAuth, useCan } from '@/lib/auth'
import { Card, CardBody, Tabs } from '@/components/ui'
import { StoreSettingsTab } from '@/admin/settings/StoreSettingsTab'
import { BranchesTab } from '@/admin/settings/BranchesTab'
import { CategoriesBrandsTab } from '@/admin/settings/CategoriesBrandsTab'

type TabId = 'general' | 'branches' | 'catalog'

export function SettingsPage() {
  const t = useT()
  useDocumentTitle(t('nav.settings'))
  const { role } = useAuth()
  const can = useCan()
  const allowed = can('settings')

  const [activeTab, setActiveTab] = useState<TabId>('general')

  // Rule 1: guard after every hook.
  if (!allowed) {
    return (
      <div className="space-y-6 p-6">
        <h1 className="text-3xl font-display text-ink mb-2">{t('nav.settings')}</h1>
        <Card>
          <CardBody>
            <p className="text-center text-moss">{t('error.notAuthorised')}</p>
          </CardBody>
        </Card>
      </div>
    )
  }

  // The database restricts writes to managers; a cashier or other non-manager
  // role landing here (should the permission matrix ever allow it) sees
  // read-only fields instead of failed save attempts.
  const canWrite = role === 'owner' || role === 'manager'

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-display text-ink mb-2">{t('nav.settings')}</h1>
        <p className="text-moss">{t('page.settingsDescription')}</p>
      </div>

      {!canWrite && (
        <Card>
          <CardBody>
            <p className="text-sm text-moss">{t('settings.readOnlyHint')}</p>
          </CardBody>
        </Card>
      )}

      <Tabs
        active={activeTab}
        onChange={(id) => setActiveTab(id as TabId)}
        tabs={[
          { id: 'general', label: t('settings.tabGeneral') },
          { id: 'branches', label: t('settings.tabBranches') },
          { id: 'catalog', label: t('settings.tabCatalog') },
        ]}
      />

      {activeTab === 'general' && <StoreSettingsTab />}
      {activeTab === 'branches' && <BranchesTab canWrite={canWrite} />}
      {activeTab === 'catalog' && <CategoriesBrandsTab canWrite={canWrite} />}
    </div>
  )
}
