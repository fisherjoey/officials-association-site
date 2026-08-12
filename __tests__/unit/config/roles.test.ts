/**
 * The role model, and the thing that keeps it from becoming three role models
 * again.
 *
 * The bug this whole change exists to fix was not a missing check. It was the
 * same idea written down in `contexts/RoleContext.tsx`, in the RLS helpers and
 * in `members.role`, with nothing holding the three copies together, so
 * `evaluator` could sit in the TypeScript union for months while no policy in
 * the database had ever heard of it.
 *
 * So the interesting tests here are not the ones checking that `hasRole` sorts
 * three strings. They are the ones at the bottom that read
 * `supabase/migrations/20260810001500_role_model.sql` off disk and fail when it
 * and `lib/roles.ts` stop agreeing.
 */

import fs from 'fs'
import path from 'path'
import {
  ANONYMOUS,
  AUDIENCE_GROUPS,
  CAPABILITIES,
  CAPABILITIES_ENFORCED_IN_SQL,
  CAPABILITY_LABELS,
  DEFAULT_STRUCTURAL_ROLE,
  STRUCTURAL_ROLES,
  STRUCTURAL_ROLE_LABELS,
  audienceGroupsFor,
  can,
  canViewAllEvaluations,
  describePrincipal,
  describeRole,
  hasRole,
  isAdmin,
  isAdminOrExecutive,
  normalizeCapability,
  normalizeStructuralRole,
  principalInAudienceGroup,
  toPrincipal,
  type Capability,
  type Principal,
  type StructuralRole,
} from '@/lib/roles'

const MIGRATION_PATH = path.join(
  process.cwd(),
  'supabase/migrations/20260810001500_role_model.sql'
)
const migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf8')

const principal = (
  role: StructuralRole | null,
  capabilities: Capability[] = []
): Principal => ({ role, capabilities })

describe('structural roles', () => {
  it('is ordered lowest to highest', () => {
    expect(STRUCTURAL_ROLES).toEqual(['member', 'executive', 'admin'])
  })

  it('answers hasRole as "at or above", not "equal to"', () => {
    expect(hasRole(principal('admin'), 'member')).toBe(true)
    expect(hasRole(principal('admin'), 'executive')).toBe(true)
    expect(hasRole(principal('admin'), 'admin')).toBe(true)

    expect(hasRole(principal('executive'), 'member')).toBe(true)
    expect(hasRole(principal('executive'), 'admin')).toBe(false)

    expect(hasRole(principal('member'), 'member')).toBe(true)
    expect(hasRole(principal('member'), 'executive')).toBe(false)
  })

  it('treats a signed-out principal as nothing at all', () => {
    // The old RoleContext handed logged-out visitors `role: 'official'`, so
    // every `hasRole('member')` in the portal would have said yes to a stranger.
    expect(hasRole(ANONYMOUS, 'member')).toBe(false)
    expect(hasRole(ANONYMOUS, 'executive')).toBe(false)
    expect(hasRole(ANONYMOUS, 'admin')).toBe(false)
    expect(hasRole(null, 'member')).toBe(false)
    expect(hasRole(undefined, 'member')).toBe(false)
    expect(can(ANONYMOUS, 'evaluator')).toBe(false)
    expect(canViewAllEvaluations(ANONYMOUS)).toBe(false)
  })

  it('normalises case and the retired `official` spelling', () => {
    expect(normalizeStructuralRole('Admin')).toBe('admin')
    expect(normalizeStructuralRole('  EXECUTIVE ')).toBe('executive')
    expect(normalizeStructuralRole('official')).toBe('member')
    expect(normalizeStructuralRole('Official')).toBe('member')
  })

  it('does not accept a capability as a rung', () => {
    expect(normalizeStructuralRole('evaluator')).toBeNull()
    expect(normalizeStructuralRole('mentor')).toBeNull()
    expect(normalizeStructuralRole('')).toBeNull()
    expect(normalizeStructuralRole(null)).toBeNull()
    expect(normalizeStructuralRole(42)).toBeNull()
  })
})

describe('capabilities', () => {
  it('is orthogonal to the ladder — an admin holds none by default', () => {
    expect(can(principal('admin'), 'evaluator')).toBe(false)
    expect(can(principal('member', ['evaluator']), 'evaluator')).toBe(true)
    expect(can(principal('executive', ['evaluator']), 'evaluator')).toBe(true)
  })

  it('lets a plain member and an executive hold the same grant', () => {
    // The combination the flat model could not express: you had to give up
    // being an executive in order to be an evaluator.
    expect(canViewAllEvaluations(principal('member', ['evaluator']))).toBe(true)
    expect(canViewAllEvaluations(principal('executive', ['evaluator']))).toBe(true)
    expect(canViewAllEvaluations(principal('executive'))).toBe(true)
    expect(canViewAllEvaluations(principal('member'))).toBe(false)
  })

  it('normalises case and rejects unknown slugs', () => {
    expect(normalizeCapability('Evaluator')).toBe('evaluator')
    expect(normalizeCapability('administrator')).toBeNull()
    expect(normalizeCapability(undefined)).toBeNull()
  })
})

describe('the admin/executive shorthands match the SQL helper names', () => {
  it.each([
    ['admin', true, true],
    ['executive', false, true],
    ['member', false, false],
  ] as const)('%s', (role, expectedAdmin, expectedEither) => {
    expect(isAdmin(principal(role))).toBe(expectedAdmin)
    expect(isAdminOrExecutive(principal(role))).toBe(expectedEither)
  })
})

describe('toPrincipal', () => {
  it('splits a legacy flat role into a rung plus a grant', () => {
    expect(toPrincipal({ role: 'evaluator' })).toEqual({
      role: 'member',
      capabilities: ['evaluator'],
    })
    expect(toPrincipal({ role: 'mentor' })).toEqual({
      role: 'member',
      capabilities: ['mentor'],
    })
    expect(toPrincipal({ role: 'official' })).toEqual({
      role: 'member',
      capabilities: [],
    })
  })

  it('reads the roles array when the direct field says nothing', () => {
    expect(toPrincipal({ roles: ['admin'] }).role).toBe('admin')
    expect(toPrincipal({ roles: ['member', 'executive'] }).role).toBe('executive')
    expect(toPrincipal({ roles: ['executive', 'evaluator'] })).toEqual({
      role: 'executive',
      capabilities: ['evaluator'],
    })
  })

  it('lets the direct role field win outright, exactly as the old resolver did', () => {
    // This is the important one. The flat resolver returned early on a
    // recognised `role`, so `{ role: 'official', roles: ['admin'] }` was an
    // official. Merging the two sources during the refactor would have
    // silently promoted every account shaped like that to admin.
    expect(toPrincipal({ role: 'official', roles: ['admin'] }).role).toBe('member')
    expect(toPrincipal({ role: 'evaluator', roles: ['admin'] }).role).toBe('member')
    expect(toPrincipal({ role: 'evaluator', roles: ['admin'] }).capabilities).toEqual([
      'evaluator',
    ])
  })

  it('adds explicit capability grants on top', () => {
    expect(toPrincipal({ role: 'executive', capabilities: ['evaluator', 'scheduler'] })).toEqual({
      role: 'executive',
      capabilities: ['evaluator', 'scheduler'],
    })
  })

  it('drops unknown and duplicated grants', () => {
    expect(
      toPrincipal({ role: 'member', capabilities: ['evaluator', 'evaluator', 'wizard'] })
        .capabilities
    ).toEqual(['evaluator'])
  })

  it('falls back to the default rung, and to null when asked to', () => {
    expect(toPrincipal({}).role).toBe(DEFAULT_STRUCTURAL_ROLE)
    expect(toPrincipal(null).role).toBe(DEFAULT_STRUCTURAL_ROLE)
    expect(toPrincipal({}, null).role).toBeNull()
    expect(toPrincipal({ capabilities: ['evaluator'] }, null)).toEqual({
      role: null,
      capabilities: ['evaluator'],
    })
  })
})

describe('audience groups', () => {
  it('offers one group per rung and one per capability', () => {
    const ids = AUDIENCE_GROUPS.map((g) => g.id)
    for (const role of STRUCTURAL_ROLES) expect(ids).toContain(`${role}s`)
    for (const cap of CAPABILITIES) expect(ids).toContain(`${cap}s`)
    expect(ids).toHaveLength(STRUCTURAL_ROLES.length + CAPABILITIES.length)
  })

  it('matches a rung exactly rather than "at or above"', () => {
    // Mailing the executives should not also mail the admins.
    expect(principalInAudienceGroup(principal('executive'), 'executives')).toBe(true)
    expect(principalInAudienceGroup(principal('admin'), 'executives')).toBe(false)
    expect(principalInAudienceGroup(principal('admin'), 'admins')).toBe(true)
  })

  it('matches capability groups by grant, at any rung', () => {
    expect(principalInAudienceGroup(principal('member', ['evaluator']), 'evaluators')).toBe(true)
    expect(principalInAudienceGroup(principal('executive', ['evaluator']), 'evaluators')).toBe(true)
    expect(principalInAudienceGroup(principal('executive'), 'evaluators')).toBe(false)
  })

  it('still understands the retired `officials` group id', () => {
    expect(principalInAudienceGroup(principal('member'), 'officials')).toBe(true)
    expect(principalInAudienceGroup(principal('admin'), 'officials')).toBe(false)
  })

  it('puts everyone in `all` and nobody in a group that does not exist', () => {
    expect(principalInAudienceGroup(principal('member'), 'all')).toBe(true)
    expect(principalInAudienceGroup(ANONYMOUS, 'all')).toBe(true)
    expect(principalInAudienceGroup(principal('admin'), 'nonsense')).toBe(false)
  })

  it('lists every group a person is in, rung and grants together', () => {
    expect(audienceGroupsFor(principal('executive', ['evaluator']))).toEqual([
      STRUCTURAL_ROLE_LABELS.executive + 's',
      CAPABILITY_LABELS.evaluator + 's',
    ])
  })
})

describe('display', () => {
  it('names a signed-out principal Guest rather than a member', () => {
    expect(describeRole(ANONYMOUS)).toBe('Guest')
    expect(describeRole(null)).toBe('Guest')
  })

  it('shows the rung and the grants together', () => {
    expect(describePrincipal(principal('member'))).toBe(STRUCTURAL_ROLE_LABELS.member)
    expect(describePrincipal(principal('executive', ['evaluator', 'mentor']))).toBe(
      `${STRUCTURAL_ROLE_LABELS.executive} (${CAPABILITY_LABELS.evaluator}, ${CAPABILITY_LABELS.mentor})`
    )
  })
})

/**
 * The drift guards. Everything above tests TypeScript against itself; these
 * test it against the database, which is where the original bug lived.
 */
describe('the migration and lib/roles.ts agree', () => {
  it('constrains members.role to exactly the structural roles in this file', () => {
    const constraint = migrationSql.match(
      /CHECK \(role IS NULL OR LOWER\(role\) IN \(([^)]*)\)\)/
    )
    expect(constraint).not.toBeNull()

    const namesInSql = Array.from(constraint![1].matchAll(/'([a-z_]+)'/g)).map((m) => m[1])
    expect(namesInSql.sort()).toEqual([...STRUCTURAL_ROLES].sort())
  })

  it('names no capability in SQL that this file does not define', () => {
    // Renaming a capability is meant to be a config change. That holds right up
    // until a policy writes the slug down, and one does — see
    // CAPABILITIES_ENFORCED_IN_SQL. If this fails after a rename, the policy in
    // the migration needs the new name too.
    const slugsInSql = Array.from(
      migrationSql.matchAll(/has_capability\(\s*auth\.uid\(\)\s*,\s*'([a-z_]+)'\s*\)/g)
    ).map((m) => m[1])

    expect(slugsInSql.length).toBeGreaterThan(0)
    for (const slug of slugsInSql) {
      expect(CAPABILITIES).toContain(slug as Capability)
    }
    expect(Array.from(new Set(slugsInSql)).sort()).toEqual(
      [...CAPABILITIES_ENFORCED_IN_SQL].sort()
    )
  })

  it('names no capability anywhere else in the chain either', () => {
    // The test above reads one file, because when it was written one file
    // called `has_capability()`. 0016 added a second — the shared predicate
    // both the evaluations row policy and the evaluations storage policy sit
    // on — and it calls the helper on a `uid` argument rather than on
    // `auth.uid()` directly, so the narrower pattern above cannot see it.
    //
    // Scan the whole chain instead. A slug written into any migration is a slug
    // a rename has to reach, and this is the test that will say where.
    const dir = path.dirname(MIGRATION_PATH)
    const slugsInSql = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .flatMap((f) =>
        Array.from(
          fs
            .readFileSync(path.join(dir, f), 'utf8')
            .matchAll(/has_capability\(\s*[^,()]*(?:\(\))?\s*,\s*'([a-z_]+)'\s*\)/g)
        ).map((m) => m[1])
      )

    expect(slugsInSql.length).toBeGreaterThan(0)
    expect(Array.from(new Set(slugsInSql)).sort()).toEqual(
      [...CAPABILITIES_ENFORCED_IN_SQL].sort()
    )
  })

  it('keeps the capability list out of the schema, so renames stay free', () => {
    // The shape constraint must not enumerate capabilities. If someone adds a
    // membership test here, "rename a capability in config" stops being true
    // and the README's claim becomes a lie.
    const shapeCheck = migrationSql.match(
      /CREATE OR REPLACE FUNCTION public\.capabilities_are_wellformed[\s\S]*?\$\$;/
    )
    expect(shapeCheck).not.toBeNull()
    for (const capability of CAPABILITIES) {
      expect(shapeCheck![0]).not.toContain(`'${capability}'`)
    }
  })

  it('defaults members.role to the same rung this file defaults to', () => {
    expect(migrationSql).toContain(`ALTER COLUMN role SET DEFAULT '${DEFAULT_STRUCTURAL_ROLE}'`)
  })

  it('guards capabilities in the privileged-column trigger', () => {
    // Acceptance criterion 5 lives in an integration test against a real
    // stack; this is the cheap version that fails the moment the guard is
    // dropped from the migration.
    expect(migrationSql).toContain('NEW.capabilities IS DISTINCT FROM OLD.capabilities')
    expect(migrationSql).toMatch(/members\.capabilities can only be (changed|granted) by an admin/)
  })
})
