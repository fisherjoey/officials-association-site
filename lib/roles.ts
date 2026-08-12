/**
 * The role model — one definition, imported by the UI, the functions and the
 * tests that check the SQL against it.
 *
 * ## Why there are two kinds of role
 *
 * The old model had one free-text `role` field holding `official`, `executive`,
 * `admin`, `evaluator` and `mentor` as if they were five points on one scale.
 * They are not. Three of them describe where you sit in the organisation and
 * two describe something you are allowed to do, and the two questions have
 * different shapes:
 *
 * **Structural role** — `member` < `executive` < `admin`. Ordered, mutually
 * exclusive, exactly one per person. Answers "how much of the association's
 * business is this person's business".
 *
 * **Capability** — `evaluator`, `scheduler`, `instructor`, `assignor`,
 * `mentor`. Unordered, several at a time, orthogonal to the ladder. A member
 * can be an evaluator. So can an executive. Answers "what job has this person
 * been given".
 *
 * Flattening the two is why `evaluator` never reached the RLS helpers. A single
 * ordered field cannot say "a member, but also an evaluator" without inventing
 * a rung for every combination, so the SQL side stopped at `admin` and
 * `executive` and the evaluator check lived only in the function layer. Split
 * apart, `has_capability(uid, 'evaluator')` is one function and the policy is
 * one line.
 *
 * ## `official` is gone; it was `member` under another name
 *
 * `normalizeStructuralRole` still accepts it and returns `member`, because auth
 * users provisioned before this change carry `app_metadata.role = 'official'`
 * and would otherwise resolve to nothing. `evaluator` and `mentor` in that same
 * field resolve to a `member` who holds the matching capability, which is what
 * they always meant.
 *
 * ## What an adopter can change, and what costs a migration
 *
 * Capability slugs are not enumerated in the database. `members.capabilities`
 * is a `TEXT[]` with a shape constraint — lowercase identifiers, no duplicates,
 * no NULLs — and `has_capability()` is generic over any string. So adding,
 * dropping or renaming a capability here is a config change and nothing else.
 *
 * The exception is any slug an RLS policy names by hand, which today is exactly
 * one: `evaluator`, in `evaluations_select_capability_or_subject`. Rename that
 * one and the policy stops matching. `__tests__/unit/config/roles.test.ts`
 * reads the migration and fails if a slug named in SQL is not in this file, so
 * the rename breaks a test with a pointer to the policy rather than silently
 * closing the table.
 *
 * Structural roles *are* enumerated, by a CHECK constraint in
 * `20260810001500_role_model.sql`. Renaming one of those three is a migration.
 * The same test asserts the constraint and this list agree.
 *
 * Display labels for both are environment-overridable and never reach SQL.
 * Calling your executives "the board" is a `.env` line.
 */

// ---------------------------------------------------------------------------
// Structural roles
// ---------------------------------------------------------------------------

/** Lowest to highest. Order is meaningful — `hasRole` compares by index. */
export const STRUCTURAL_ROLES = ['member', 'executive', 'admin'] as const

export type StructuralRole = (typeof STRUCTURAL_ROLES)[number]

/**
 * What a signed-in person is when nothing says otherwise. Everyone on the
 * roster is at least a member; the ladder starts at the bottom, not at nothing.
 */
export const DEFAULT_STRUCTURAL_ROLE: StructuralRole = 'member'

/**
 * Names the old flat model used for a structural role. Kept so auth users
 * stamped before this change keep resolving. Adding to this map is how you
 * retire a structural role name without stranding existing accounts.
 */
export const LEGACY_STRUCTURAL_ROLE_ALIASES: Readonly<Record<string, StructuralRole>> =
  Object.freeze({ official: 'member' })

/**
 * Human-readable names. Overridable per deploy; nothing in SQL reads these, so
 * changing one is a rebrand and not a migration.
 */
export const STRUCTURAL_ROLE_LABELS: Readonly<Record<StructuralRole, string>> = Object.freeze({
  member: process.env.NEXT_PUBLIC_ROLE_LABEL_MEMBER || 'Member',
  executive: process.env.NEXT_PUBLIC_ROLE_LABEL_EXECUTIVE || 'Executive',
  admin: process.env.NEXT_PUBLIC_ROLE_LABEL_ADMIN || 'Administrator',
})

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

/**
 * Jobs someone can be given. Unordered — the array order is display order and
 * carries no precedence.
 *
 * `mentor` is here because it existed in the old union and the portal renders
 * it. It was never a rung on the ladder, so this is where it belongs; dropping
 * it would have deleted a live concept while claiming to unify one.
 */
export const CAPABILITIES = [
  'evaluator',
  'scheduler',
  'instructor',
  'assignor',
  'mentor',
] as const

export type Capability = (typeof CAPABILITIES)[number]

export const CAPABILITY_LABELS: Readonly<Record<Capability, string>> = Object.freeze({
  evaluator: process.env.NEXT_PUBLIC_CAPABILITY_LABEL_EVALUATOR || 'Evaluator',
  scheduler: process.env.NEXT_PUBLIC_CAPABILITY_LABEL_SCHEDULER || 'Scheduler',
  instructor: process.env.NEXT_PUBLIC_CAPABILITY_LABEL_INSTRUCTOR || 'Instructor',
  assignor: process.env.NEXT_PUBLIC_CAPABILITY_LABEL_ASSIGNOR || 'Assignor',
  mentor: process.env.NEXT_PUBLIC_CAPABILITY_LABEL_MENTOR || 'Mentor',
})

/**
 * Capability slugs written into an RLS policy in
 * `supabase/migrations/20260810001500_role_model.sql`. Renaming one of these
 * needs the migration changed too, and the config test enforces that pairing.
 */
export const CAPABILITIES_ENFORCED_IN_SQL: readonly Capability[] = Object.freeze(['evaluator'])

// ---------------------------------------------------------------------------
// Principal
// ---------------------------------------------------------------------------

/**
 * Who is asking. `role: null` means nobody — a signed-out visitor, not a
 * member with no privileges. The distinction is the whole reason this type
 * exists: `RoleContext` used to hand logged-out visitors
 * `{ name: 'Guest', role: 'official' }`, which every `user.role === …` check in
 * the portal then evaluated as a real member.
 */
export interface Principal {
  role: StructuralRole | null
  capabilities: readonly Capability[]
}

/** Nobody. */
export const ANONYMOUS: Principal = Object.freeze({
  role: null,
  capabilities: Object.freeze([]) as readonly Capability[],
})

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

function asSlug(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * `'Admin'`, `'admin'`, `'official'` → a structural role. Anything else,
 * including a capability slug, → null.
 */
export function normalizeStructuralRole(value: unknown): StructuralRole | null {
  const slug = asSlug(value)
  if (!slug) return null
  if ((STRUCTURAL_ROLES as readonly string[]).includes(slug)) return slug as StructuralRole
  return LEGACY_STRUCTURAL_ROLE_ALIASES[slug] ?? null
}

export function normalizeCapability(value: unknown): Capability | null {
  const slug = asSlug(value)
  if (!slug) return null
  return (CAPABILITIES as readonly string[]).includes(slug) ? (slug as Capability) : null
}

export function isStructuralRole(value: unknown): value is StructuralRole {
  return typeof value === 'string' && (STRUCTURAL_ROLES as readonly string[]).includes(value)
}

export function isCapability(value: unknown): value is Capability {
  return typeof value === 'string' && (CAPABILITIES as readonly string[]).includes(value)
}

// ---------------------------------------------------------------------------
// The two questions
// ---------------------------------------------------------------------------

function rank(role: StructuralRole): number {
  return STRUCTURAL_ROLES.indexOf(role)
}

/**
 * Is this principal at least `minimum` on the ladder? A signed-out principal is
 * never anything, so this is false for `role: null` at every level.
 */
export function hasRole(principal: Principal | null | undefined, minimum: StructuralRole): boolean {
  if (!principal || !principal.role) return false
  return rank(principal.role) >= rank(minimum)
}

/** Does this principal hold this capability? Structure grants nothing here. */
export function can(principal: Principal | null | undefined, capability: Capability): boolean {
  if (!principal) return false
  return principal.capabilities.includes(capability)
}

/**
 * Shorthands for the two combinations the SQL helpers also express, so the
 * spelling matches on both sides of the wire.
 */
export const isAdmin = (principal: Principal | null | undefined): boolean =>
  hasRole(principal, 'admin')

export const isAdminOrExecutive = (principal: Principal | null | undefined): boolean =>
  hasRole(principal, 'executive')

/**
 * Read access to every evaluation, not just your own — the union the function
 * layer has always applied and that `evaluations_select_capability_or_subject`
 * now applies in SQL as well. One definition, two enforcement points.
 */
export const canViewAllEvaluations = (principal: Principal | null | undefined): boolean =>
  isAdminOrExecutive(principal) || can(principal, 'evaluator')

// ---------------------------------------------------------------------------
// Building a principal from stored roles
// ---------------------------------------------------------------------------

export interface RoleSource {
  /** A single role name — `members.role`. */
  role?: unknown
  /** A list of role names, the older shape. Not a source of privilege today. */
  roles?: unknown
  /** Capability grants — `members.capabilities`. */
  capabilities?: unknown
}

function collectCapabilities(value: unknown): Capability[] {
  if (!Array.isArray(value)) return []
  const out: Capability[] = []
  for (const entry of value) {
    const cap = normalizeCapability(entry)
    if (cap && !out.includes(cap)) out.push(cap)
  }
  return out
}

function highestStructural(values: unknown): StructuralRole | null {
  if (!Array.isArray(values)) return null
  let best: StructuralRole | null = null
  for (const entry of values) {
    const role = normalizeStructuralRole(entry)
    if (role && (best === null || rank(role) > rank(best))) best = role
  }
  return best
}

/**
 * Turn stored metadata into a principal.
 *
 * The precedence is deliberately the same as the flat resolver it replaces: a
 * single `role` field, when it names anything this model recognises, decides
 * the structural answer on its own and the `roles` array is not consulted. That
 * is not cosmetic. Under the old resolver `{ role: 'official', roles: ['admin'] }`
 * resolved to `official`; merging the two sources would have promoted every one
 * of those accounts to admin as a side effect of a refactor.
 *
 * `capabilities` is additive and is read from whichever source won, plus the
 * explicit list.
 *
 * `fallback` is what an unrecognised or absent role resolves to. Callers
 * resolving a real person pass `null` through `principalFromMemberRow()` below;
 * the `'member'` default is kept for the display-only callers that are already
 * looking at a roster row and only want its rung named.
 */
export function toPrincipal(
  source: RoleSource | null | undefined,
  fallback: StructuralRole | null = DEFAULT_STRUCTURAL_ROLE
): Principal {
  if (!source) return { role: fallback, capabilities: [] }

  const directStructural = normalizeStructuralRole(source.role)
  const directCapability = normalizeCapability(source.role)

  let role: StructuralRole | null
  let granted: Capability[]

  if (directStructural) {
    role = directStructural
    granted = []
  } else if (directCapability) {
    // The old model let a capability sit in the role field. It never conferred
    // rank then and it does not now.
    role = fallback
    granted = [directCapability]
  } else {
    role = highestStructural(source.roles) ?? fallback
    granted = collectCapabilities(source.roles)
  }

  for (const cap of collectCapabilities(source.capabilities)) {
    if (!granted.includes(cap)) granted.push(cap)
  }

  return { role, capabilities: granted }
}

/** The two columns a roster row has to carry for anyone to be anyone. */
export interface MemberRoleRow {
  role?: unknown
  capabilities?: unknown
}

/**
 * Who a roster row says this person is. **The only way to become somebody.**
 *
 * `members.role` and `members.capabilities` are the columns the RLS policies
 * read — through `structural_role()` and `has_capability()` in migration 0015 —
 * and neither is writable by the account they describe: `authenticated` holds
 * no UPDATE grant on `members`, and the guard trigger refuses the write even if
 * someone re-grants one. Resolving the function layer from the same two columns
 * is what makes the two layers agree without anybody keeping them in step.
 *
 * A missing row is `ANONYMOUS`, not a member. Being signed in is not a rung:
 * that state is a real one — `MemberGuard` renders the registration form for
 * exactly it — and a person who has not been put on the roster has not been
 * given anything yet. The SQL side says the same thing; `structural_role()`
 * returns NULL for a caller with no row.
 */
export function principalFromMemberRow(row: MemberRoleRow | null | undefined): Principal {
  if (!row) return ANONYMOUS
  return toPrincipal(row, null)
}

// ---------------------------------------------------------------------------
// Audience groups
// ---------------------------------------------------------------------------

/**
 * "Everyone who is an X" — the groups the mail composer offers and the
 * `send-email` function resolves to addresses.
 *
 * Derived from the model rather than listed by hand, because the hand-written
 * version existed twice (once in `app/portal/mail/page.tsx`, once in
 * `netlify/functions/send-email.ts`) and the two had to be edited in step. Add
 * a capability to `CAPABILITIES` and its group appears in both.
 *
 * A structural group is an exact match on the rung, not "at or above it".
 * Addressing the executives should not also mail the admins; the ordering on
 * the ladder is about privilege, not about who a message is for.
 */
export interface AudienceGroup {
  id: string
  label: string
  description: string
  role?: StructuralRole
  capability?: Capability
}

export const AUDIENCE_GROUPS: readonly AudienceGroup[] = Object.freeze([
  ...STRUCTURAL_ROLES.map((role) => ({
    id: `${role}s`,
    label: `${STRUCTURAL_ROLE_LABELS[role]}s`,
    description: `Everyone whose role is ${STRUCTURAL_ROLE_LABELS[role].toLowerCase()}`,
    role,
  })),
  ...CAPABILITIES.map((capability) => ({
    id: `${capability}s`,
    label: `${CAPABILITY_LABELS[capability]}s`,
    description: `Everyone holding the ${CAPABILITY_LABELS[capability].toLowerCase()} capability`,
    capability,
  })),
])

/** Group ids from before `official` became `member`. */
export const LEGACY_AUDIENCE_GROUP_ALIASES: Readonly<Record<string, string>> =
  Object.freeze({ officials: 'members' })

export function findAudienceGroup(groupId: string): AudienceGroup | undefined {
  const id = LEGACY_AUDIENCE_GROUP_ALIASES[groupId] ?? groupId
  return AUDIENCE_GROUPS.find((g) => g.id === id)
}

/** Is this principal in the named group? `'all'` is everyone. */
export function principalInAudienceGroup(
  principal: Principal | null | undefined,
  groupId: string
): boolean {
  if (groupId === 'all') return true
  if (!principal) return false
  const group = findAudienceGroup(groupId)
  if (!group) return false
  if (group.role) return principal.role === group.role
  if (group.capability) return can(principal, group.capability)
  return false
}

/** Every group label this principal belongs to, for "member is in: …" chips. */
export function audienceGroupsFor(principal: Principal | null | undefined): string[] {
  if (!principal) return []
  return AUDIENCE_GROUPS.filter((g) => principalInAudienceGroup(principal, g.id)).map(
    (g) => g.label
  )
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

/** Label for a principal's rung, or `'Guest'` when there is nobody. */
export function describeRole(principal: Principal | null | undefined): string {
  if (!principal || !principal.role) return 'Guest'
  return STRUCTURAL_ROLE_LABELS[principal.role]
}

/** `"Member"`, or `"Member (Evaluator, Mentor)"`. */
export function describePrincipal(principal: Principal | null | undefined): string {
  const base = describeRole(principal)
  if (!principal || principal.capabilities.length === 0) return base
  return `${base} (${principal.capabilities.map((c) => CAPABILITY_LABELS[c]).join(', ')})`
}

export const roleModel = {
  structuralRoles: STRUCTURAL_ROLES,
  structuralRoleLabels: STRUCTURAL_ROLE_LABELS,
  defaultStructuralRole: DEFAULT_STRUCTURAL_ROLE,
  legacyStructuralRoleAliases: LEGACY_STRUCTURAL_ROLE_ALIASES,
  capabilities: CAPABILITIES,
  capabilityLabels: CAPABILITY_LABELS,
  capabilitiesEnforcedInSql: CAPABILITIES_ENFORCED_IN_SQL,
} as const
