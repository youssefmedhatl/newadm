import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, Menu, X } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useLocale, useT } from '@/lib/i18n'
import { useCan } from '@/lib/auth'
import { supabase, type Tables } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { translations } from '@/lib/translations'
import { Drawer } from '@/components/ui/Drawer'
import { format } from 'date-fns'
import { ar } from 'date-fns/locale'

// Simplified nav — Inventory, Purchasing, Customers, Reports, Cash, Staff,
// Storefront/CMS, and Settings are intentionally not linked here. Their
// pages, routes, and permissions all still exist; only the sidebar entry is
// gone, so they're one line to bring back later if needed.
const NAV_ITEMS = [
  { id: 'dashboard', label: 'nav.dashboard', path: '/admin', icon: 'LayoutDashboard', permission: null },
  { id: 'orders', label: 'nav.orders', path: '/admin/orders', icon: 'ShoppingBag', permission: 'orders' },
  { id: 'history', label: 'nav.history', path: '/admin/history', icon: 'History', permission: 'orders' },
  { id: 'pos', label: 'nav.pos', path: '/admin/pos', icon: 'ScanLine', permission: 'pos' },
  { id: 'products', label: 'nav.products', path: '/admin/products', icon: 'Shirt', permission: 'products' },
  { id: 'discounts', label: 'nav.discounts', path: '/admin/discounts', icon: 'TicketPercent', permission: 'discounts' },
  { id: 'inventory', label: 'nav.inventory', path: '/admin/inventory', icon: 'Boxes', permission: 'inventory' },
  // { id: 'purchasing', label: 'nav.purchasing', path: '/admin/purchasing', icon: 'Truck', permission: 'purchasing' },
  // { id: 'customers', label: 'nav.customers', path: '/admin/customers', icon: 'Users', permission: 'customers' },
  // { id: 'reports', label: 'nav.reports', path: '/admin/reports', icon: 'ChartLine', permission: 'reports' },
  // { id: 'cash', label: 'nav.cash', path: '/admin/cash', icon: 'Banknote', permission: 'cash' },
  // { id: 'staff', label: 'nav.staff', path: '/admin/staff', icon: 'UserCog', permission: 'staff' },
  { id: 'storefront', label: 'nav.storefront', path: '/admin/storefront', icon: 'Globe', permission: 'cms' },
  // { id: 'settings', label: 'nav.settings', path: '/admin/settings', icon: 'Settings', permission: 'settings' },
]

function SidebarContent() {
  const t = useT()
  const can = useCan()

  return (
    <>
      <div className="px-6 py-8">
        <h1 className="text-2xl font-display uppercase text-ink">Vitaly</h1>
      </div>

      <nav className="space-y-1 px-4">
        {NAV_ITEMS.map((item) => {
          // Show all items if permission is null (dashboard), otherwise check permission
          if (
            item.permission &&
            !can(item.permission as Parameters<typeof can>[0])
          ) {
            return null
          }

          return (
            <NavLink
              key={item.id}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-ink text-bone'
                    : 'text-moss hover:text-ink hover:bg-sand/30'
                )
              }
            >
              {t(item.label as keyof typeof translations.en)}
            </NavLink>
          )
        })}
      </nav>
    </>
  )
}

export function AdminLayout() {
  const navigate = useNavigate()
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const { profile, signOut } = useAuth()
  const { locale, setLocale } = useLocale()
  const t = useT()
  const queryClient = useQueryClient()

  // Fetch unread notifications count
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('is_read', false)

      if (error) throw error
      return count ?? 0
    },
    refetchInterval: 60_000,
  })

  // Fetch the notifications shown in the dropdown — only while it's open
  const { data: notifications = [], isLoading: notificationsLoading } = useQuery({
    queryKey: ['notifications', 'recent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(15)

      if (error) throw error
      return (data as Tables<'notifications'>[]) || []
    },
    enabled: notificationsOpen,
  })

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('is_read', false)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const handleNotificationClick = (n: Tables<'notifications'>) => {
    if (!n.is_read) markReadMutation.mutate(n.id)
    setNotificationsOpen(false)
    if (n.link) navigate(n.link)
  }

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (err) {
      console.error('Error signing out:', err)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-bone">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-60 lg:flex-col lg:border-e lg:border-sand lg:bg-white">
        <SidebarContent />
      </aside>

      {/* Mobile Drawer */}
      <Drawer
        open={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        size="md"
      >
        <SidebarContent />
      </Drawer>

      {/* Main Content */}
      <div className="flex flex-1 flex-col lg:ms-60">
        {/* Top Bar */}
        <header className="sticky top-0 z-40 border-b border-sand bg-white px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileDrawerOpen(!mobileDrawerOpen)}
              className="lg:hidden rounded-lg p-2 hover:bg-sand/30 transition-colors"
            >
              {mobileDrawerOpen ? (
                <X className="h-6 w-6 text-ink" />
              ) : (
                <Menu className="h-6 w-6 text-ink" />
              )}
            </button>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Right Actions */}
            <div className="flex items-center gap-4">
              {/* Notifications */}
              <div className="relative">
                <button
                  onClick={() => setNotificationsOpen((v) => !v)}
                  className="relative rounded-lg p-2 hover:bg-sand/30 transition-colors"
                  aria-label={t('nav.notifications')}
                >
                  <Bell className="h-5 w-5 text-moss" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 end-1 h-2 w-2 rounded-full bg-danger" />
                  )}
                </button>

                {notificationsOpen && (
                  <>
                    {/* Backdrop to close on outside click */}
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setNotificationsOpen(false)}
                    />
                    <div className="absolute end-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-sand bg-white shadow-lg">
                      <div className="flex items-center justify-between border-b border-sand px-4 py-3">
                        <span className="text-sm font-semibold text-ink">
                          {t('nav.notifications')}
                        </span>
                        {unreadCount > 0 && (
                          <button
                            onClick={() => markAllReadMutation.mutate()}
                            className="text-xs font-medium text-moss hover:text-ink transition-colors"
                          >
                            {t('notifications.markAllRead')}
                          </button>
                        )}
                      </div>
                      <div className="max-h-96 overflow-y-auto">
                        {notificationsLoading ? (
                          <p className="p-4 text-center text-sm text-moss">
                            {t('common.loading')}
                          </p>
                        ) : notifications.length === 0 ? (
                          <p className="p-4 text-center text-sm text-moss">
                            {t('notifications.empty')}
                          </p>
                        ) : (
                          notifications.map((n) => (
                            <button
                              key={n.id}
                              onClick={() => handleNotificationClick(n)}
                              className={cn(
                                'flex w-full flex-col items-start gap-1 border-b border-sand px-4 py-3 text-start last:border-b-0 hover:bg-bone transition-colors',
                                !n.is_read && 'bg-info/5'
                              )}
                            >
                              <div className="flex w-full items-center justify-between gap-2">
                                <span className="text-sm font-medium text-ink">
                                  {n.title}
                                </span>
                                {!n.is_read && (
                                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
                                )}
                              </div>
                              {n.body && (
                                <span className="text-xs text-moss line-clamp-2">
                                  {n.body}
                                </span>
                              )}
                              <span className="text-[11px] text-moss">
                                {format(new Date(n.created_at), 'PP p', {
                                  locale: locale === 'ar' ? ar : undefined,
                                })}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Language Toggle */}
              <button
                onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
                className="rounded-full border border-sand bg-bone px-3 py-1.5 text-xs font-medium text-ink hover:bg-sand/30 transition-colors"
              >
                {locale === 'ar' ? 'EN' : 'ع'}
              </button>

              {/* User Menu */}
              <div className="border-s border-sand ps-4">
                <div className="flex items-center gap-2">
                  <div className="text-end text-xs">
                    <p className="font-medium text-ink">
                      {profile?.full_name || t('common.welcome')}
                    </p>
                    <p className="text-moss capitalize">{profile?.role || 'user'}</p>
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-bone hover:bg-ember transition-colors"
                  >
                    {t('common.signOut')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
