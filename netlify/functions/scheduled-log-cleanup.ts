import { schedule } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Runs every Sunday at 3 AM UTC
export const handler = schedule('0 3 * * 0', async () => {
  try {
    const { data, error } = await supabase.rpc('cleanup_old_logs', {
      app_logs_days: 30,
      audit_logs_days: 365
    })

    if (error) {
      console.error('Log cleanup failed:', error)
      return { statusCode: 500, body: JSON.stringify({ error: 'server_error', message: 'Log cleanup failed.' }) }
    }

    console.log('Log cleanup completed:', data)
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Log cleanup completed',
        result: data
      })
    }
  } catch (err) {
    console.error('Log cleanup error:', err)
    return { statusCode: 500, body: JSON.stringify({ error: 'server_error', message: 'Log cleanup failed.' }) }
  }
})
