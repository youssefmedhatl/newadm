import { useEffect, useRef, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import { useFocusTrap } from './useFocusTrap'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: DrawerProps) {
  const t = useT()
  const drawerRef = useFocusTrap(open)

  // See Modal.tsx — keep the latest onClose in a ref rather than as an
  // effect dependency, so a caller's inline onClose (a new function
  // identity on every render, e.g. while typing in a field inside the
  // drawer) doesn't re-run this effect and steal focus back mid-keystroke.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return

    // Lock body scroll
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Close on Escape
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current()
      }
    }

    document.addEventListener('keydown', handleEscape)
    drawerRef.current?.focus()

    return () => {
      document.body.style.overflow = originalOverflow
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open, drawerRef])

  if (!open) return null

  const sizeStyles = {
    sm: 'w-64',
    md: 'w-80',
    lg: 'w-96',
  }

  const titleId = title ? 'drawer-title' : undefined

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/50"
      onClick={onClose}
    >
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'relative flex h-full flex-col border-s border-sand bg-white',
          sizeStyles[size]
        )}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        {title && (
          <div className="border-b border-sand px-6 py-4 flex items-center justify-between">
            <h2 id={titleId} className="text-lg font-semibold text-ink">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="rounded-lg p-1 hover:bg-sand/50 transition-colors"
              aria-label={t('common.close')}
            >
              <X className="h-5 w-5 text-moss" />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {children}
        </div>

        {footer && (
          <div className="border-t border-sand px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
