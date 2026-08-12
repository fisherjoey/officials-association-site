/**
 * Netlify Identity Signup Function (Legacy)
 *
 * Automatically triggered when a new user signs up via Netlify Identity.
 * Assigns the default structural role to all new signups.
 *
 * Note: This is legacy infrastructure from before the Supabase Auth migration.
 * New signups go through supabase-auth-admin.ts instead.
 *
 * The `app_metadata.role` this hands back confers nothing. Roles are resolved
 * from `members.role` now — see `getPrincipal()` in `_shared/handler.ts` — and
 * this webhook's response shape is fixed by Netlify Identity, which no longer
 * runs here. It is left as-is because rewriting a dead contract to write a
 * column it was never able to reach would be worse than leaving it inert.
 */

import { Handler } from '@netlify/functions'
import { errorResponse } from './_shared/handler'
import { DEFAULT_STRUCTURAL_ROLE } from '../../lib/roles'

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return errorResponse({ code: 'method_not_allowed' })
  }

  try {
    const data = JSON.parse(event.body || '{}')
    const { user } = data

    if (!user?.email) {
      return errorResponse({
        code: 'invalid_input',
        message: 'Signup request was missing user details.',
      })
    }

    // Assign the default structural role to all new signups
    const responseBody = {
      app_metadata: {
        role: DEFAULT_STRUCTURAL_ROLE,
        roles: [DEFAULT_STRUCTURAL_ROLE],
        assigned_at: new Date().toISOString()
      },
      user_metadata: {
        ...user.user_metadata,
        signup_method: 'identity'
      }
    }

    return { statusCode: 200, body: JSON.stringify(responseBody) }
  } catch (error) {
    console.error('Error in identity-signup function:', error)

    // Return success anyway to not block user signup
    return {
      statusCode: 200,
      body: JSON.stringify({ app_metadata: {}, user_metadata: {} })
    }
  }
}
