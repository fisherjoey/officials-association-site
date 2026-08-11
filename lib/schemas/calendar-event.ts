import { z } from 'zod'
import { optionalString } from './common'

export const EVENT_TYPES = ['training', 'meeting', 'league', 'tournament', 'social'] as const

// Schema for form inputs (dates as strings from datetime-local)
export const calendarEventFormSchema = z.object({
  title: z.string().min(1, 'Event title is required').max(200, 'Event title must not exceed 200 characters'),
  type: z.enum(EVENT_TYPES, { message: 'Event type is required' }),
  start: z.string().min(1, 'Start date/time is required'),
  end: z.string().min(1, 'End date/time is required'),
  location: optionalString,
  description: optionalString,
  instructor: optionalString,
  maxParticipants: z.preprocess(
    (val) => {
      if (val === '' || val === undefined || val === null) return undefined
      if (typeof val === 'string') return parseInt(val) || undefined
      return val
    },
    z.number().min(1, 'Must be at least 1 participant').max(10000, 'Must not exceed 10,000 participants').optional()
  ),
  registrationLink: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
}).refine((data) => {
  const start = new Date(data.start)
  const end = new Date(data.end)
  return end >= start
}, {
  message: 'End time must be after start time',
  path: ['end'],
})

export type CalendarEventFormData = z.infer<typeof calendarEventFormSchema>

// Convert form data to the event object format
export function formDataToEvent(data: CalendarEventFormData) {
  return {
    title: data.title,
    type: data.type,
    start: new Date(data.start),
    end: new Date(data.end),
    location: data.location || undefined,
    description: data.description || undefined,
    instructor: data.instructor || undefined,
    maxParticipants: typeof data.maxParticipants === 'number' ? data.maxParticipants : undefined,
    registrationLink: data.registrationLink || undefined,
  }
}
