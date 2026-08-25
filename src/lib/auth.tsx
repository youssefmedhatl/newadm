import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import { Navigate } from 'react-router-dom'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, Enums, Tables } from './supabase'
import { useT } from './i18n'

export type Role = Enums<'app_role'>
export type Permission =
  | 'pos'
  | 'orders'
  | 'products'
  | 'inventory'
  | 'purchasing'
  | 'customers'
  | 'discounts'
  | 'reports'
  | 'cash'
  | 'staff'
  | 'cms'
  | 'settings'

type Profile = Pick<
  Tables<'profiles'>,
  'full_name' | 'phone' | 'avatar_url' | 'role' | 'is_active' | 'location_id'
>

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  role: Role | null
  loading: boolean
  isStaff: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

/**
 * Manages authentication state and fetches the user's profile from the database.
 * On mount: calls getSession() and subscribes to onAuthStateChange.
 * When a user exists: fetches their profile row.
 * Handles errors gracefully without crashing the app.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  // Fetch user's profile from database
  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, phone, avatar_url, role, is_active, location_id')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('Error fetching profile:', error)
        return
      }

      setProfile(data)
    } catch (err) {
      console.error('Unexpected error fetching profile:', err)
    }
  }, [])

  // Initialize session and subscribe to auth state changes
  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (error) {
          console.error('Error getting session:', error)
          setLoading(false)
          return
        }

        setSession(data.session)
        if (data.session?.user) {
          setUser(data.session.user)
          await fetchProfile(data.session.user.id)
        }
      } catch (err) {
        console.error('Unexpected error initializing auth:', err)
      } finally {
        setLoading(false)
      }
    }

    initAuth()

    // Subscribe to auth state changes
    const { data } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession)

        if (newSession?.user) {
          setUser(newSession.user)
          await fetchProfile(newSession.user.id)
        } else {
          setUser(null)
          setProfile(null)
        }
      }
    )

    return () => {
      data?.subscription.unsubscribe()
    }
  }, [fetchProfile])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      throw error
    }
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      throw error
    }
  }, [])

  const role = profile?.role ?? null
  const isStaff = role !== null && role !== 'customer' && profile?.is_active === true

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        role,
        loading,
        isStaff,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

/**
 * Hook to access authentication state and methods.
 * Do not redirect based on `loading` — let RequireStaff handle that.
 */
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

/**
 * Permission matrix: defines which roles have access to which features.
 * - owner, manager → every permission true
 * - cashier → pos, orders, customers, cash
 * - stock → products, inventory, purchasing, orders, customers
 * - viewer → orders, customers, reports (read-only, still true)
 * - customer → nothing
 */
const PERMISSIONS: Record<Role, Permission[]> = {
  owner: [
    'pos',
    'orders',
    'products',
    'inventory',
    'purchasing',
    'customers',
    'discounts',
    'reports',
    'cash',
    'staff',
    'cms',
    'settings',
  ],
  manager: [
    'pos',
    'orders',
    'products',
    'inventory',
    'purchasing',
    'customers',
    'discounts',
    'reports',
    'cash',
    'staff',
    'cms',
    'settings',
  ],
  cashier: ['pos', 'orders', 'customers', 'cash'],
  stock: ['products', 'inventory', 'purchasing', 'orders', 'customers'],
  viewer: ['orders', 'customers', 'reports'],
  customer: [],
}

/**
 * Check if the current user has permission to perform an action.
 */
export function useCan() {
  const { role } = useAuth()

  return useCallback(
    (permission: Permission): boolean => {
      if (!role) return false
      return PERMISSIONS[role].includes(permission)
    },
    [role]
  )
}

/**
 * Component that requires staff role to render.
 * - While loading: shows a full-page spinner
 * - If not signed in: redirects to /admin/login
 * - If customer role or inactive: shows "not authorised" message with sign-out button
 * - Otherwise: renders children
 */
export function RequireStaff({ children }: { children: ReactNode }) {
  const { user, role, profile, loading, signOut } = useAuth()
  const t = useT()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bone">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-sand border-t-ink"></div>
          <p className="mt-4 text-sm text-moss">{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/admin/login" replace />
  }

  if (role === 'customer' || profile?.is_active !== true) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bone px-4">
        <div className="max-w-md text-center">
          <h1 className="mb-2 text-2xl font-bold text-ink">
            {t('error.notAuthorised')}
          </h1>
          <p className="mb-6 text-moss">
            {t('error.notAuthorisedBody')}
          </p>
          <button
            onClick={() => signOut()}
            className="rounded-full bg-ink px-6 py-2 text-sm font-medium text-bone hover:bg-ember transition-colors"
          >
            {t('common.signOut')}
          </button>
        </div>
      </div>
    )
  }

  return children
}
