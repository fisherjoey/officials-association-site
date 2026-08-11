import { createHandler, supabase } from './_shared/handler'

// Valid `?type=` values. The original handler silently aliased anything
// that wasn't 'audit' to 'app' (so ?type=client read from app_logs even
// though client logs are stored in app_logs with source='client', not a
// separate table). Reject unknown types instead.
//
// NOTE: client logs live in app_logs (see netlify/functions/client-logs.ts
// — source='client'), so there is no separate `client_logs` table to
// query. The frontend filters by source='client' on type=app for that.
const VALID_TYPES = new Set(['app', 'audit'])

// app_logs.level is CHECK-constrained to uppercase ('INFO'/'WARN'/'ERROR')
// but the frontend dropdown sends lowercase. Normalize here so
// ?level=info matches stored 'INFO' rows.
const VALID_LEVELS = new Set(['INFO', 'WARN', 'ERROR'])

/**
 * Escape user-supplied search before interpolating into a supabase-js
 * `.or()` ILIKE pattern. Strips both SQL LIKE wildcards (`%`, `_`) and
 * PostgREST `.or()` delimiters (`,`, `(`, `)`).
 */
function escapeIlikeTerm(term: string): string {
  return term.replace(/[%_,()]/g, '')
}

export const handler = createHandler({
  name: 'logs',
  methods: ['GET'],
  auth: 'admin',
  handler: async ({ event }) => {
    const params = event.queryStringParameters || {}
    const {
      type = 'app',
      level,
      source,
      category,
      action,
      search,
      startDate,
      endDate,
      page = '1',
      pageSize = '50'
    } = params

    if (!VALID_TYPES.has(type)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: `Invalid type. Expected one of: ${Array.from(VALID_TYPES).join(', ')}`,
        }),
      }
    }

    const pageNum = parseInt(page, 10)
    const pageSizeNum = Math.min(parseInt(pageSize, 10), 100)
    const offset = (pageNum - 1) * pageSizeNum

    const tableName = type === 'audit' ? 'audit_logs' : 'app_logs'

    let query = supabase
      .from(tableName)
      .select('*', { count: 'exact' })

    if (type === 'app') {
      if (level) {
        const upperLevel = level.toUpperCase()
        if (!VALID_LEVELS.has(upperLevel)) {
          return {
            statusCode: 400,
            body: JSON.stringify({
              error: `Invalid level. Expected one of: ${Array.from(VALID_LEVELS).join(', ')}`,
            }),
          }
        }
        query = query.eq('level', upperLevel)
      }
      if (source) query = query.eq('source', source)
      if (category) query = query.eq('category', category)
      // app_logs has its own `action` column (e.g. 'login', 'send_email')
      // — see supabase/migrations/add-logging-tables.sql. Apply the
      // filter here so ?type=app&action=login actually narrows results
      // instead of being silently dropped.
      if (action) query = query.eq('action', action)
    } else {
      if (action) query = query.eq('action', action)
    }

    if (startDate) query = query.gte('timestamp', startDate)
    if (endDate) query = query.lte('timestamp', endDate)

    if (search) {
      const safe = escapeIlikeTerm(search)
      if (safe) {
        if (type === 'app') {
          query = query.or(`message.ilike.%${safe}%,function_name.ilike.%${safe}%,user_email.ilike.%${safe}%`)
        } else {
          query = query.or(`description.ilike.%${safe}%,actor_email.ilike.%${safe}%,target_user_email.ilike.%${safe}%`)
        }
      } else {
        // Search collapsed to empty after escaping — return zero rows
        // rather than silently dropping the filter.
        query = query.eq('id', '00000000-0000-0000-0000-000000000000')
      }
    }

    query = query
      .order('timestamp', { ascending: false })
      .range(offset, offset + pageSizeNum - 1)

    const { data, error, count } = await query

    if (error) throw error

    return {
      statusCode: 200,
      body: JSON.stringify({
        logs: data,
        pagination: {
          page: pageNum,
          pageSize: pageSizeNum,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / pageSizeNum)
        }
      })
    }
  }
})
