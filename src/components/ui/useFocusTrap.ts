import { useEffect, useRef } from 'react'

/**
 * Focus trap hook for modal/drawer overlays.
 * - Traps focus within the panel element on open
 * - Tab/Shift+Tab cycles through focusable elements
 * - Restores focus to the previously focused element on close
 */
export function useFocusTrap(isOpen: boolean) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previousActiveElement = useRef<Element | null>(null)

  useEffect(() => {
    if (!isOpen || !panelRef.current) return

    // Store the element that had focus before the panel opened
    previousActiveElement.current = document.activeElement

    // Focus the panel initially (or the first focusable child)
    const focusableElements = panelRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )

    if (focusableElements.length > 0) {
      ;(focusableElements[0] as HTMLElement).focus()
    } else {
      panelRef.current.focus()
    }

    // Handle Tab/Shift+Tab to cycle focus
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !panelRef.current) return

      const focusable = Array.from(
        panelRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ) as HTMLElement[]

      if (focusable.length === 0) return

      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement)
      let nextIndex: number

      if (e.shiftKey) {
        // Shift+Tab: move backward
        nextIndex = currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1
      } else {
        // Tab: move forward
        nextIndex = currentIndex >= focusable.length - 1 ? 0 : currentIndex + 1
      }

      e.preventDefault()
      focusable[nextIndex].focus()
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      // Restore focus to the previously focused element
      if (previousActiveElement.current instanceof HTMLElement) {
        previousActiveElement.current.focus()
      }
    }
  }, [isOpen])

  return panelRef
}
