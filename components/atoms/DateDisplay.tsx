import { IconCalendar } from '@tabler/icons-react'

interface DateDisplayProps {
  date: string | Date | null | undefined
  format?: 'full' | 'short' | 'year'
  showRelative?: boolean
  showIcon?: boolean
  className?: string
}

export default function DateDisplay({
  date,
  format = 'full',
  showRelative = false,
  showIcon = false,
  className = '',
}: DateDisplayProps) {
  // Handle null/undefined/empty dates
  if (!date) {
    return <span className={`text-gray-600 ${className}`}>No date</span>
  }

  // Parse the date
  let dateObj: Date
  if (date instanceof Date) {
    dateObj = date
  } else if (typeof date === 'string') {
    // Handle date strings without timezone (treat as local)
    if (date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      dateObj = new Date(date + 'T00:00:00')
    } else {
      dateObj = new Date(date)
    }
  } else {
    return <span className={`text-gray-600 ${className}`}>No date</span>
  }

  // Check if date is valid
  if (isNaN(dateObj.getTime())) {
    return <span className={`text-gray-600 ${className}`}>Invalid date</span>
  }

  // Format the date for display
  let displayText = ''
  let isoString = dateObj.toISOString().split('T')[0]

  if (showRelative) {
    displayText = getRelativeTimeString(dateObj)
  }

  // If not showing relative or relative returned null, format normally
  if (!displayText) {
    displayText = formatDate(dateObj, format)
  }

  const ariaLabel = showRelative && displayText !== formatDate(dateObj, 'full')
    ? `Date: ${displayText} (${formatDate(dateObj, 'full')})`
    : `Date: ${displayText}`

  return (
    <time
      dateTime={isoString}
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-1 text-gray-600 ${className}`}
    >
      {showIcon && (
        <IconCalendar
          className="h-4 w-4"
          data-testid="calendar-icon"
        />
      )}
      {displayText}
    </time>
  )
}

function formatDate(date: Date, format: 'full' | 'short' | 'year'): string {
  const options: Record<string, Intl.DateTimeFormatOptions> = {
    full: { year: 'numeric', month: 'long', day: 'numeric' },
    short: { year: 'numeric', month: 'short', day: 'numeric' },
    year: { year: 'numeric' },
  }

  return date.toLocaleDateString('en-US', options[format])
}

function getRelativeTimeString(date: Date): string {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  const diffTime = targetDate.getTime() - today.getTime()
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === -1) return 'Yesterday'
  if (diffDays === 1) return 'Tomorrow'

  if (diffDays < -30 || diffDays > 30) {
    // Fall back to full date for dates over 30 days
    return ''
  }

  if (diffDays < 0) {
    return `${Math.abs(diffDays)} days ago`
  } else {
    return `in ${diffDays} days`
  }
}