import { useEffect, useRef, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import { useFocusTrap } from './useFocusTrap'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: ModalProps) {
  const t = useT()
  const modalRef = useFocusTrap(open)

  // Keep the latest onClose without making it an effect dependency — most
  // callers pass an inline arrow function that gets a new identity on every
  // render (e.g. while the user types in a field inside the modal). If the
  // effect below reran on every one of those, it would re-focus the modal
  // panel and yank focus straight out of whatever the person is typing in.
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
    modalRef.current?.focus()

    return () => {
      document.body.style.overflow = originalOverflow
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open, modalRef])

  if (!open) return null

  const sizeStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
  }

  const titleId = title ? 'modal-title' : undefined

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'relative flex max-h-[85vh] flex-col rounded-2xl border border-sand bg-white p-6',
          sizeStyles[size]
        )}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        {title && (
          <div className="mb-4 flex shrink-0 items-center justify-between">
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

        <div className="mb-6 min-h-0 flex-1 overflow-y-auto">{children}</div>

        {footer && (
          <div className="shrink-0 border-t border-sand pt-4 mt-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
