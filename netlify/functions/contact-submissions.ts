import { createHandler, supabase, errorResponse } from './_shared/handler'

const VALID_STATUSES = new Set(['new', 'read', 'responded', 'archived'])

/**
 * Strip characters that PostgREST treats specially when interpolated
 * into an `.or()` filter or an `ilike` pattern. PostgREST splits `or`
 * arguments on commas and uses parens for grouping; ilike uses % and _
 * as wildcards. Backslash-escaping is unreliable across PostgREST
 * versions — strip is safer for a free-text search box.
 */
function escapePostgrestSearch(s: string): string {
  return s.replace(/[%_,()]/g, '')
}

function isValidISODate(s: string): boolean {
  const t = Date.parse(s)
  return !Number.isNaN(t)
}

export const handler = createHandler({
  name: 'contact-submissions',
  methods: ['GET', 'PATCH'],
  auth: 'admin',
  handler: async ({ event }) => {
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {}
      const {
        category,
        status,
        search,
        startDate,
        endDate,
        page = '1',
        pageSize = '50',
      } = params

      const pageRaw = parseInt(page, 10)
      const pageSizeRaw = parseInt(pageSize, 10)
      if (Number.isNaN(pageRaw) || Number.isNaN(pageSizeRaw)) {
        return { statusCode: 400, body: JSON.stringify({ error: 'page and pageSize must be numbers' }) }
      }
      const pageNum = Math.max(1, pageRaw)
      const pageSizeNum = Math.max(1, Math.min(pageSizeRaw, 100))
      const offset = (pageNum - 1) * pageSizeNum

      if (startDate && !isValidISODate(startDate)) {
        return { statusCode: 400, body: JSON.stringify({ error: 'startDate must be a valid date' }) }
      }
      if (endDate && !isValidISODate(endDate)) {
        return { statusCode: 400, body: JSON.stringify({ error: 'endDate must be a valid date' }) }
      }

      let query = supabase
        .from('contact_submissions')
        .select('*', { count: 'exact' })

      if (category) query = query.eq('category', category)
      if (status) query = query.eq('status', status)
      if (startDate) query = query.gte('created_at', startDate)
      if (endDate) query = query.lte('created_at', endDate)
      if (search) {
        const safe = escapePostgrestSearch(search)
        query = query.or(
          `sender_name.ilike.%${safe}%,sender_email.ilike.%${safe}%,subject.ilike.%${safe}%,message.ilike.%${safe}%`
        )
      }

      query = query
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSizeNum - 1)

      const { data, error, count } = await query

      if (error) throw error

      return {
        statusCode: 200,
        body: JSON.stringify({
          submissions: data,
          pagination: {
            page: pageNum,
            pageSize: pageSizeNum,
            total: count || 0,
            totalPages: Math.ceil((count || 0) / pageSizeNum),
          },
        }),
      }
    }

    // PATCH - Update submission (status, notes)
    const body = JSON.parse(event.body || '{}')
    const { id, status, notes } = body

    if (!id) {
      return errorResponse({ code: 'invalid_input', message: 'A submission must be selected.' })
    }

    if (status !== undefined && !VALID_STATUSES.has(status)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: `Invalid status. Expected one of: ${Array.from(VALID_STATUSES).join(', ')}`,
        }),
      }
    }

    const updates: Record<string, string> = {}
    if (status !== undefined) updates.status = status
    if (notes !== undefined) updates.notes = notes

    const { data, error } = await supabase
      .from('contact_submissions')
      .update(updates)
      .eq('id', id)
      .select('id')

    if (error) throw error
    if (!data || data.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Submission not found' }) }
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) }
  }
})
