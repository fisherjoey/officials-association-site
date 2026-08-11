import type {
  OSAFormState,
  OSAFormLeague,
  OSAFormTournament,
  OSAFormExhibition,
} from '@/lib/forms/osaPayload'
import { tag } from './supabase'

const futureDate = (daysFromNow: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  return d.toISOString().slice(0, 10)
}

interface FixtureOptions {
  organizationName?: string
  /** dead inbox; tests pass the recipient they want emails routed to */
  contactEmail: string
  billingEmail?: string
}

/** Common contact + billing block reused across every fixture. */
function commonFields(opts: FixtureOptions) {
  return {
    organizationName: opts.organizationName ?? tag('Org'),
    billingContactName: 'E2E Billing Contact',
    billingEmail: opts.billingEmail ?? opts.contactEmail,
    billingPhone: '403-555-1234',
    billingAddress: '123 Test St',
    billingCity: 'Example City',
    billingProvince: 'AB',
    billingPostalCode: 'T2P 1A1',
    eventContactName: 'E2E Event Contact',
    eventContactEmail: opts.contactEmail,
    eventContactPhone: '403-555-5678',
    disciplinePolicy: 'Own Policy (will provide copy)',
    agreement: true,
  }
}

const exhibition = (overrides: Partial<OSAFormExhibition> = {}): OSAFormExhibition => ({
  exhibitionGameLocation: 'E2E Test Gym',
  exhibitionGames: [
    { date: futureDate(14), time: '18:00', numberOfGames: '2' },
  ],
  exhibitionPlayerGender: ['Male'],
  exhibitionLevelOfPlay: ['U13'],
  ...overrides,
})

const league = (overrides: Partial<OSAFormLeague> = {}): OSAFormLeague => ({
  leagueName: 'E2E Test League',
  leagueStartDate: futureDate(14),
  leagueEndDate: futureDate(60),
  leagueDaysOfWeek: ['Monday', 'Wednesday'],
  leaguePlayerGender: ['Female'],
  leagueLevelOfPlay: ['U15'],
  ...overrides,
})

const tournament = (overrides: Partial<OSAFormTournament> = {}): OSAFormTournament => ({
  tournamentName: 'E2E Test Tournament',
  tournamentStartDate: futureDate(21),
  tournamentEndDate: futureDate(23),
  tournamentNumberOfGames: '12',
  tournamentPlayerGender: ['Male', 'Female'],
  tournamentLevelOfPlay: ['U17'],
  ...overrides,
})

export function exhibitionFixture(opts: FixtureOptions): OSAFormState {
  return {
    ...commonFields(opts),
    eventType: 'Exhibition Game(s)',
    exhibitions: [exhibition()],
  }
}

export function leagueFixture(opts: FixtureOptions): OSAFormState {
  return {
    ...commonFields(opts),
    eventType: 'League',
    leagues: [league()],
  }
}

export function tournamentFixture(opts: FixtureOptions): OSAFormState {
  return {
    ...commonFields(opts),
    eventType: 'Tournament',
    tournaments: [tournament()],
  }
}

export function multiLeagueFixture(opts: FixtureOptions): OSAFormState {
  return {
    ...commonFields(opts),
    eventType: 'League',
    leagues: [
      league({ leagueName: 'E2E League A' }),
      league({ leagueName: 'E2E League B', leagueDaysOfWeek: ['Saturday'] }),
    ],
  }
}
