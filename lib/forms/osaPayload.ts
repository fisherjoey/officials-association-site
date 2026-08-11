/**
 * Shared OSA form payload builder.
 *
 * The OSA wizard component holds a richer per-event-type state (separate
 * arrays for leagues / tournaments / exhibitions) but the webhook expects
 * a flat `events: EventData[]` array. Both the wizard and the integration
 * tests run their input through `buildOSAPayload` so the wire format is
 * defined in exactly one place — if the function signature or output
 * changes, both ends update together.
 */

export type OSAEventType = 'Exhibition Game(s)' | 'League' | 'Tournament'

export interface OSAExhibitionGame {
  date: string
  time: string
  numberOfGames: string
}

export interface OSAFormLeague {
  leagueName: string
  leagueStartDate: string
  leagueEndDate: string
  leagueDaysOfWeek: string[]
  leaguePlayerGender: string[]
  leagueLevelOfPlay: string[]
}

export interface OSAFormTournament {
  tournamentName: string
  tournamentStartDate: string
  tournamentEndDate: string
  tournamentNumberOfGames: string
  tournamentPlayerGender: string[]
  tournamentLevelOfPlay: string[]
}

export interface OSAFormExhibition {
  exhibitionGameLocation: string
  exhibitionGames: OSAExhibitionGame[]
  exhibitionPlayerGender: string[]
  exhibitionLevelOfPlay: string[]
}

/** The wizard's internal form state shape (post-validation). */
export interface OSAFormState {
  organizationName: string
  billingContactName: string
  billingEmail: string
  billingPhone?: string
  billingAddress: string
  billingCity: string
  billingProvince: string
  billingPostalCode: string
  eventContactName: string
  eventContactEmail: string
  eventContactPhone?: string
  eventType: OSAEventType
  leagues?: OSAFormLeague[]
  tournaments?: OSAFormTournament[]
  exhibitions?: OSAFormExhibition[]
  disciplinePolicy: string
  agreement: boolean
}

/** A single event in the wire format the webhook consumes. */
export interface OSAPayloadEvent {
  eventIndex: number
  eventType: OSAEventType
  // League
  leagueName?: string
  leagueStartDate?: string
  leagueEndDate?: string
  leagueDaysOfWeek?: string
  leaguePlayerGender?: string
  leagueLevelOfPlay?: string
  // Exhibition
  exhibitionGameLocation?: string
  exhibitionGames?: OSAExhibitionGame[]
  exhibitionPlayerGender?: string
  exhibitionLevelOfPlay?: string
  // Tournament
  tournamentName?: string
  tournamentStartDate?: string
  tournamentEndDate?: string
  tournamentNumberOfGames?: string
  tournamentPlayerGender?: string
  tournamentLevelOfPlay?: string
}

/** The full request body POSTed to /.netlify/functions/osa-webhook. */
export interface OSAPayload {
  organizationName: string
  billingContactName: string
  billingEmail: string
  billingPhone?: string
  billingAddress: string
  billingCity: string
  billingProvince: string
  billingPostalCode: string
  eventContactName: string
  eventContactEmail: string
  eventContactPhone?: string
  disciplinePolicy: string
  agreement: boolean
  submissionTime: string
  events: OSAPayloadEvent[]
}

export interface BuildOSAPayloadOptions {
  /** ISO timestamp; defaults to now. Tests pin this for deterministic idempotency keys. */
  submissionTime?: string
}

export function buildOSAPayload(
  data: OSAFormState,
  opts: BuildOSAPayloadOptions = {}
): OSAPayload {
  let events: OSAPayloadEvent[] = []

  if (data.eventType === 'League' && data.leagues) {
    events = data.leagues.map((league, idx) => ({
      eventIndex: idx + 1,
      eventType: 'League',
      leagueName: league.leagueName,
      leagueStartDate: league.leagueStartDate,
      leagueEndDate: league.leagueEndDate,
      leagueDaysOfWeek: league.leagueDaysOfWeek?.join(', '),
      leaguePlayerGender: league.leaguePlayerGender?.join(', '),
      leagueLevelOfPlay: league.leagueLevelOfPlay?.join(', '),
    }))
  } else if (data.eventType === 'Tournament' && data.tournaments) {
    events = data.tournaments.map((tournament, idx) => ({
      eventIndex: idx + 1,
      eventType: 'Tournament',
      tournamentName: tournament.tournamentName,
      tournamentStartDate: tournament.tournamentStartDate,
      tournamentEndDate: tournament.tournamentEndDate,
      tournamentNumberOfGames: tournament.tournamentNumberOfGames,
      tournamentPlayerGender: tournament.tournamentPlayerGender?.join(', '),
      tournamentLevelOfPlay: tournament.tournamentLevelOfPlay?.join(', '),
    }))
  } else if (data.eventType === 'Exhibition Game(s)' && data.exhibitions) {
    events = data.exhibitions.map((exhibition, idx) => ({
      eventIndex: idx + 1,
      eventType: 'Exhibition Game(s)',
      exhibitionGameLocation: exhibition.exhibitionGameLocation,
      exhibitionGames: exhibition.exhibitionGames,
      exhibitionPlayerGender: exhibition.exhibitionPlayerGender?.join(', '),
      exhibitionLevelOfPlay: exhibition.exhibitionLevelOfPlay?.join(', '),
    }))
  }

  return {
    organizationName: data.organizationName,
    billingContactName: data.billingContactName,
    billingEmail: data.billingEmail,
    billingPhone: data.billingPhone,
    billingAddress: data.billingAddress,
    billingCity: data.billingCity,
    billingProvince: data.billingProvince,
    billingPostalCode: data.billingPostalCode,
    eventContactName: data.eventContactName,
    eventContactEmail: data.eventContactEmail,
    eventContactPhone: data.eventContactPhone,
    disciplinePolicy: data.disciplinePolicy,
    agreement: data.agreement,
    submissionTime: opts.submissionTime ?? new Date().toISOString(),
    events,
  }
}
