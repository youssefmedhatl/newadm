import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Combine Tailwind classes with automatic conflict resolution.
 * Uses clsx for conditional classes and twMerge to resolve conflicts.
 */
export function cn(...inputs: Parameters<typeof clsx>) {
  return twMerge(clsx(inputs))
}

/**
 * Convert a string to a URL-safe slug.
 * - Converts to lowercase
 * - Replaces non-alphanumeric characters with hyphens
 * - Collapses consecutive hyphens
 * - Trims leading/trailing hyphens
 */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
