/**
 * Which unlinked roster rows an account may claim for itself, pinned.
 *
 * `members.user_id` is the column that binds a rung to a person, so the moment
 * a caller can point a row at themselves, the row's rung is theirs. The
 * `members` function used to let anyone who could sign up at a row's address
 * claim it whatever it granted, which turned an unlinked `role: 'admin'` row —
 * the shape `POST /members` leaves whenever an admin creates a member with
 * `skipInvite`, and the shape a bulk roster import leaves behind — into an
 * administrator for whoever got there first.
 *
 * The rule now: a claim may only ever hand over the floor. Anything above it is
 * linked by an admin, or by the invite flow, which links server-side when the
 * invitation is redeemed.
 *
 * `__tests__/integration/principal-escalation.test.ts` runs the claim against a
 * live stack, tokens and all. This file is the cheap half — the predicate the
 * refusal turns on, checked on every `npm test`.
 */

// members.ts pulls in handler.ts, which builds a service-role client at import
// time. Nothing here touches it; the constructor only has to not throw.
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({})),
}))

import { conveysNothingBeyondTheDefault } from '@/netlify/functions/members'

describe('a roster row that grants nothing beyond the default', () => {
  it.each([
    ['the default rung with no grants', { role: 'member', capabilities: [] }],
    ['no rung recorded at all', { role: null, capabilities: [] }],
    ['a rung absent from the row', { capabilities: [] }],
    ['no capabilities column', { role: 'member' }],
    ['a null capabilities column', { role: 'member', capabilities: null }],
    ['the retired spelling of the default rung', { role: 'official', capabilities: [] }],
    ['the default rung, capitalised', { role: 'Member', capabilities: [] }],
  ])('is claimable: %s', (_label, row) => {
    expect(conveysNothingBeyondTheDefault(row)).toBe(true)
  })
})

describe('a roster row that grants more than the default', () => {
  it.each([
    ['an unlinked administrator', { role: 'admin', capabilities: [] }],
    ['an unlinked executive', { role: 'executive', capabilities: [] }],
    ['a rung stored in mixed case', { role: 'Admin', capabilities: [] }],
    ['a capability grant on the bottom rung', { role: 'member', capabilities: ['evaluator'] }],
    ['a grant with no rung', { role: null, capabilities: ['scheduler'] }],
  ])('is not claimable: %s', (_label, row) => {
    expect(conveysNothingBeyondTheDefault(row)).toBe(false)
  })

  /**
   * The CHECK constraint in migration 0015 means these cannot be in the column
   * today. The predicate refuses them anyway: a value the role model cannot
   * name is not the default rung, and guessing in the permissive direction is
   * how a schema change three releases from now becomes an escalation.
   */
  it.each([
    ['a rung the model has never heard of', { role: 'superuser', capabilities: [] }],
    ['a rung that is not a string', { role: ['admin'], capabilities: [] }],
    ['capabilities smuggled in as a Postgres array literal', { role: 'member', capabilities: '{evaluator}' }],
    ['capabilities as a bare string', { role: 'member', capabilities: 'evaluator' }],
    ['capabilities as an object', { role: 'member', capabilities: { 0: 'evaluator' } }],
  ])('is not claimable either: %s', (_label, row) => {
    expect(conveysNothingBeyondTheDefault(row)).toBe(false)
  })
})
