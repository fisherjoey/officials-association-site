import { createHandler, supabase, errorResponse } from './_shared/handler'

export const handler = createHandler({
  name: 'osa-submissions',
  methods: ['GET', 'PATCH'],
  auth: 'admin',
  handler: async ({ event }) => {
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {}
      const {
        event_type,
        status,
        search,
        startDate,
        endDate,
        page = '1',
        pageSize = '50'
      } = params

      const pageNum = parseInt(page, 10)
      const pageSizeNum = Math.min(parseInt(pageSize, 10), 100)
      const offset = (pageNum - 1) * pageSizeNum

      let query = supabase
        .from('osa_submissions')
        .select('*', { count: 'exact' })

      if (event_type) query = query.eq('event_type', event_type)
      if (status) query = query.eq('status', status)
      if (startDate) query = query.gte('created_at', startDate)
      if (endDate) query = query.lte('created_at', endDate)
      if (search) {
        query = query.or(`organization_name.ilike.%${search}%,event_contact_email.ilike.%${search}%,event_contact_name.ilike.%${search}%,league_name.ilike.%${search}%,tournament_name.ilike.%${search}%`)
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
            totalPages: Math.ceil((count || 0) / pageSizeNum)
          }
        })
      }
    }

    // PATCH - Update submission (status, notes)
    const body = JSON.parse(event.body || '{}')
    const { id, status, notes } = body

    if (!id) {
      return errorResponse({ code: 'invalid_input', message: 'A submission must be selected.' })
    }

    const updateData: Record<string, any> = {}
    if (status !== undefined) updateData.status = status
    if (notes !== undefined) updateData.notes = notes

    if (Object.keys(updateData).length === 0) {
      return errorResponse({ code: 'invalid_input', message: 'No update data was provided.' })
    }

    const { data, error } = await supabase
      .from('osa_submissions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return { statusCode: 200, body: JSON.stringify({ submission: data }) }
  }
})
