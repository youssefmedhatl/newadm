import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './Button'
import { useLocale } from '@/lib/i18n'

interface PaginationProps {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
}

export function Pagination({
  page,
  pageCount,
  onPageChange,
}: PaginationProps) {
  const { isRTL } = useLocale()

  return (
    <div className="flex items-center justify-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        icon={isRTL ? ChevronRight : ChevronLeft}
      />

      <span className="text-sm text-moss">
        Page {page} of {pageCount}
      </span>

      <Button
        variant="secondary"
        size="sm"
        onClick={() => onPageChange(page + 1)}
        disabled={page === pageCount}
        icon={isRTL ? ChevronLeft : ChevronRight}
      />
    </div>
  )
}
