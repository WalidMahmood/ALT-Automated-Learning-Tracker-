import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDateToISO(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Returns user-friendly display label for entry status.
 * "pending" → "analyzing" for learner-facing views.
 * Admins see raw status. Use isAdmin=true to keep "pending" as-is.
 */
export function getDisplayStatus(status: string, isAdmin = false): string {
  if (!isAdmin && status === 'pending') return 'analyzing'
  return status
}
