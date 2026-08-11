/**
 * Shared calendar-event payload builder.
 *
 * The portal's CalendarPage holds events in a richer in-memory shape
 * (`Date` instances for start/end, camelCase fields, optional
 * `tournamentDetails`). The `/calendar-events` Netlify function expects a
 * flat snake_case wire format with ISO date strings. Both the portal UI
 * and the integration tests run their input through `buildCalendarEventPayload`
 * so the wire format lives in exactly one place — if it changes, both ends
 * update together.
 */

import { DEFAULT_AUTHOR } from '../siteConfig'

export const CALENDAR_EVENT_TYPES = [
  'training',
  'meeting',
  'league',
  'tournament',
  'social',
] as const

export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number]

export interface CalendarEventTournamentDetails {
  school: string
  divisions: string[]
  levels: string[]
  genders: string[]
  multiLocation: boolean
  gamesInArbiter: boolean
}

/** The portal's in-memory event shape, as held by `CalendarPage` state. */
export interface CalendarEventFormState {
  id?: string
  title: string
  start: Date
  end: Date
  type: CalendarEventType
  description?: string
  location?: string
  instructor?: string
  maxParticipants?: number
  registrationLink?: string
  tournamentDetails?: CalendarEventTournamentDetails
}

/** The wire-format body POSTed/PUT to `/.netlify/functions/calendar-events`. */
export interface CalendarEventPayload {
  title: string
  type: CalendarEventType
  description?: string
  location?: string
  instructor?: string
  max_participants?: number
  registration_link?: string
  start_date: string
  end_date: string
  created_by?: string
  tournament_details: CalendarEventTournamentDetails | null
}

export interface BuildCalendarEventPayloadOptions {
  /** `created_by` field on the row; defaults to siteConfig's DEFAULT_AUTHOR to match the portal. */
  createdBy?: string
}

export function buildCalendarEventPayload(
  state: CalendarEventFormState,
  opts: BuildCalendarEventPayloadOptions = {}
): CalendarEventPayload {
  return {
    title: state.title,
    type: state.type,
    description: state.description,
    location: state.location,
    instructor: state.instructor,
    max_participants: state.maxParticipants,
    registration_link: state.registrationLink,
    start_date: state.start.toISOString(),
    end_date: state.end.toISOString(),
    created_by: opts.createdBy ?? DEFAULT_AUTHOR,
    tournament_details:
      state.type === 'tournament' ? state.tournamentDetails ?? null : null,
  }
}
