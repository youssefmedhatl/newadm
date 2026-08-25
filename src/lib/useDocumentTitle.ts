import { useEffect } from 'react'

/** Sets document.title, restoring nothing — every routed page sets its own. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Vitaly` : 'Vitaly'
  }, [title])
}
