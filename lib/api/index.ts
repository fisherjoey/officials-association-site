/**
 * API barrel export — all imports from '@/lib/api' continue to work.
 *
 * Individual modules can also be imported directly:
 *   import { membersAPI } from '@/lib/api/members'
 */

// Portal content
export { calendarAPI, announcementsAPI, schedulerUpdatesAPI, ruleModificationsAPI, newslettersAPI } from './portal'

// Members & activities
export { membersAPI, memberActivitiesAPI } from './members'

// Resources
export { resourcesAPI } from './resources'

// Public content
export {
  publicNewsAPI, publicTrainingAPI, publicResourcesAPI, publicPagesAPI,
  officialsAPI, executiveTeamAPI
} from './public-content'

// Auth admin
export {
  supabaseAuthAPI, identityAPI,
  type AuthUser, type IdentityUser,
  type AuthStatus, type IdentityStatus
} from './auth'

// Evaluations
export { evaluationsAPI, type Evaluation } from './evaluations'

export { statsAPI, type SummaryResponse, type ImportResult, type OrgMappingRow } from './stats'
