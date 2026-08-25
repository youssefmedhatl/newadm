/**
 * Builds a CSV string from already-fetched rows and triggers a browser
 * download. Prepends a UTF-8 BOM so Excel renders Arabic correctly.
 */
export function buildCsv(headers: string[], rows: (string | number)[][]): string {
  const escapeField = (field: string | number): string => {
    const str = String(field)
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const lines = [headers, ...rows].map((row) => row.map(escapeField).join(','))
  return lines.join('\n')
}

export function downloadCsv(filename: string, csv: string) {
  const BOM = '﻿'
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
