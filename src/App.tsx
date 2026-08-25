import { useState, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { isSupabaseConfigured } from '@/lib/env'
import { useAuth } from '@/lib/auth'
import { useT } from '@/lib/i18n'
import { RequireStaff } from '@/lib/auth'
import { Button, Input, Spinner } from '@/components/ui'

/**
 * Admin panel — staff dashboard only. Split out of the combined app so this
 * can be deployed and run completely independently of the customer storefront.
 *
 * All internal navigation inside src/admin/** is hardcoded to the `/admin/...`
 * prefix (nav links, `navigate()` calls, redirects after save, etc.), so that
 * prefix is kept exactly as-is here rather than moved to `/` — that would have
 * required touching every admin page instead of just this file.
 *
 * These modules use named exports, so each import is mapped to `default`.
 */
const lazyNamed = <T extends Record<string, unknown>, K extends keyof T>(
  loader: () => Promise<T>,
  name: K
) => lazy(() => loader().then((m) => ({ default: m[name] as React.ComponentType })))

const AdminLayout = lazyNamed(() => import('@/admin/AdminLayout'), 'AdminLayout')
const DashboardPage = lazyNamed(() => import('@/admin/pages/DashboardPage'), 'DashboardPage')
const POSPage = lazyNamed(() => import('@/admin/pages/POSPage'), 'POSPage')
const OrdersPage = lazyNamed(() => import('@/admin/pages/OrdersPage'), 'OrdersPage')
const HistoryPage = lazyNamed(() => import('@/admin/pages/HistoryPage'), 'HistoryPage')
const OrderDetailPage = lazyNamed(() => import('@/admin/pages/OrderDetailPage'), 'OrderDetailPage')
const ProductsPage = lazyNamed(() => import('@/admin/pages/ProductsPage'), 'ProductsPage')
const ProductEditor = lazyNamed(() => import('@/admin/products/ProductEditor'), 'ProductEditor')
const DiscountsPage = lazyNamed(() => import('@/admin/pages/DiscountsPage'), 'DiscountsPage')
const InventoryPage = lazyNamed(() => import('@/admin/pages/InventoryPage'), 'InventoryPage')
// Hidden from the nav for this build, but the page files are untouched —
// import + add the matching <Route> back below to restore any of them:
// const PurchasingPage = lazyNamed(() => import('@/admin/pages/PurchasingPage'), 'PurchasingPage')
// const CustomersPage = lazyNamed(() => import('@/admin/pages/CustomersPage'), 'CustomersPage')
// const ReportsPage = lazyNamed(() => import('@/admin/pages/ReportsPage'), 'ReportsPage')
// const CashPage = lazyNamed(() => import('@/admin/pages/CashPage'), 'CashPage')
// const StaffPage = lazyNamed(() => import('@/admin/pages/StaffPage'), 'StaffPage')
const StorefrontPage = lazyNamed(() => import('@/admin/pages/StorefrontPage'), 'StorefrontPage')
// const SettingsPage = lazyNamed(() => import('@/admin/pages/SettingsPage'), 'SettingsPage')

/** Shown while a route chunk is in flight. */
function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner />
    </div>
  )
}

/**
 * Not Configured page: shown when Supabase credentials are missing.
 */
function NotConfiguredPage() {
  const t = useT()

  return (
    <div className="flex items-center justify-center min-h-screen bg-bone px-4">
      <div className="max-w-md text-center">
        <h1 className="mb-4 text-3xl font-bold text-ink">Vitaly</h1>
        <p className="mb-6 text-lg text-moss">{t('error.notConfigured')}</p>
        <code className="block rounded-lg bg-sand p-4 text-sm text-ink">
          VITE_SUPABASE_URL
          <br />
          VITE_SUPABASE_ANON_KEY
        </code>
      </div>
    </div>
  )
}

/**
 * Sign In / Sign Up page: real auth form
 */
function LoginPage() {
  const navigate = useNavigate()
  const { signIn } = useAuth()
  const t = useT()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      await signIn(email.trim(), password)
      toast.success(t('auth.signedIn'))
      navigate('/admin', { replace: true })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('auth.invalidCredentials')
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-bone px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-bold text-ink display">Vitaly</h1>
          <h2 className="text-lg font-semibold text-ink mb-1">
            {t('auth.signInTitle')}
          </h2>
          <p className="text-moss text-sm">{t('auth.signInSubtitle')}</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-lg border border-sand bg-white p-6"
        >
          <Input
            label={t('auth.email')}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            placeholder="you@example.com"
          />

          <Input
            label={t('auth.password')}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder="••••••••"
          />

          <Button type="submit" loading={loading} fullWidth>
            {loading ? t('auth.signingIn') : t('auth.signIn')}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-moss">
          {t('auth.firstUserOwner')}
        </p>
      </div>
    </div>
  )
}

