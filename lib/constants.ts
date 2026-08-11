/**
 * Shared constants used across the application.
 */

// Canadian provinces — used in forms, display, and validation
export const PROVINCES = [
  { value: 'AB', label: 'Alberta' },
  { value: 'BC', label: 'British Columbia' },
  { value: 'SK', label: 'Saskatchewan' },
  { value: 'MB', label: 'Manitoba' },
  { value: 'ON', label: 'Ontario' },
  { value: 'QC', label: 'Quebec' },
  { value: 'NB', label: 'New Brunswick' },
  { value: 'NS', label: 'Nova Scotia' },
  { value: 'PE', label: 'Prince Edward Island' },
  { value: 'NL', label: 'Newfoundland and Labrador' },
  { value: 'NT', label: 'Northwest Territories' },
  { value: 'NU', label: 'Nunavut' },
  { value: 'YT', label: 'Yukon' },
] as const

/** Province code → full name lookup */
export const PROVINCE_LABELS: Record<string, string> = Object.fromEntries(
  PROVINCES.map(p => [p.value, p.label])
)

/** Province codes only (for validation schemas) */
export const PROVINCE_CODES = PROVINCES.map(p => p.value) as unknown as readonly string[]

/**
 * Format a North American phone number: (555) 123-4567
 */
export function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length === 0) return ''
  if (digits.length <= 3) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`
}

/**
 * Format a Canadian postal code: A1A 1A1
 */
export function formatPostalCode(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  if (cleaned.length <= 3) return cleaned
  return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)}`
}

/**
 * Format a date for display. Standardized locale: en-CA.
 */
export function formatDate(
  date: string | Date,
  style: 'full' | 'short' | 'month-year' = 'full'
): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''

  switch (style) {
    case 'full':
      return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
    case 'short':
      return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
    case 'month-year':
      return d.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })
  }
}

/**
 * Format a date + time for admin tables.
 */
export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

/**
 * Get today's date as YYYY-MM-DD string.
 */
export function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}
