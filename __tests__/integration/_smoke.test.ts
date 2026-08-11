import { getSupabaseAdmin } from './helpers/supabase'
import { invokeFunction } from './helpers/invokeFunction'
import type { Handler } from '@netlify/functions'

describe('integration test infrastructure', () => {
  it('loads required env vars', () => {
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBeTruthy()
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBeTruthy()
  })

  it('connects to Supabase with the service role', async () => {
    const sb = getSupabaseAdmin()
    const { error } = await sb.from('osa_submissions').select('id').limit(1)
    expect(error).toBeNull()
  })

  it('invokes a netlify-style handler', async () => {
    const echoHandler: Handler = async (event) => ({
      statusCode: 200,
      body: JSON.stringify({ method: event.httpMethod, body: event.body }),
    })
    const result = await invokeFunction(echoHandler, { method: 'POST', body: { hi: 1 } })
    expect(result.statusCode).toBe(200)
    expect(result.body.method).toBe('POST')
    expect(result.body.body).toBe('{"hi":1}')
  })
})
