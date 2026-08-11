import { createHandler, supabase } from './_shared/handler'

// Status values allowed by the email_history app convention.
// See supabase/migrations/add-email-history-table.sql and lib/emailHistory.ts
// (EmailStatus = 'sent' | 'failed' | 'partial').
const VALID_STATUSES = new Set(['sent', 'failed', 'partial'])

/**
 * Escape a user-supplied search term before interpolating into a
 * supabase-js `.or()` ILIKE pattern. We strip both the SQL `LIKE`
 * wildcards (`%`, `_`) and the PostgREST `.or()` delimiters
 * (`,`, `(`, `)`) — otherwise `?search=%` matches every row, and a
 * value containing a comma silently widens the OR or trips the
 * PostgREST parser.
 */
function escapeIlikeTerm(term: string): string {
  return term.replace(/[%_,()]/g, '')
}

export const handler = createHandler({
  name: 'email-history',
  methods: ['GET'],
  auth: 'admin',
  handler: async ({ event }) => {
    const params = event.queryStringParameters || {}
    const {
      email_type,
      status,
      search,
      startDate,
      endDate,
      page = '1',
      pageSize = '50'
    } = params

    const pageNum = parseInt(page, 10)
    const pageSizeNum = Math.min(parseInt(pageSize, 10), 100)

    if (!Number.isFinite(pageNum) || pageNum < 1) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'page must be an integer >= 1' }),
      }
    }
    if (!Number.isFinite(pageSizeNum) || pageSizeNum < 1) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'pageSize must be an integer >= 1' }),
      }
    }

    if (status && !VALID_STATUSES.has(status)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: `Invalid status. Expected one of: ${Array.from(VALID_STATUSES).join(', ')}`,
        }),
      }
    }

    const offset = (pageNum - 1) * pageSizeNum

    let query = supabase
      .from('email_history')
      .select('*', { count: 'exact' })

    if (email_type) query = query.eq('email_type', email_type)
    if (status) query = query.eq('status', status)
    if (startDate) query = query.gte('created_at', startDate)
    if (endDate) query = query.lte('created_at', endDate)
    if (search) {
      const safe = escapeIlikeTerm(search)
      if (safe) {
        query = query.or(`subject.ilike.%${safe}%,sent_by_email.ilike.%${safe}%,recipient_email.ilike.%${safe}%`)
      } else {
        // Search term collapsed to empty after escaping (was pure
        // wildcard / delimiter chars). Force zero rows rather than
        // silently dropping the filter.
        query = query.eq('id', '00000000-0000-0000-0000-000000000000')
      }
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSizeNum - 1)

    const { data, error, count } = await query

    if (error) throw error

    return {
      statusCode: 200,
      body: JSON.stringify({
        emails: data,
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
