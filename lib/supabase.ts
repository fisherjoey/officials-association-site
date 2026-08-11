import { createClient } from '@supabase/supabase-js'
import { getSupabaseBrowserClient } from './api/client'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// Server-side Supabase client (for Netlify Functions only). Only
// initialize if the service key is available — this module is
// imported by client code too, where the service key is undefined.
export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null

// Type-safe table accessors. These run client-side and use the
// shared singleton browser client so we don't fan out into multiple
// GoTrueClient instances.
export const publicNewsTable = () => getSupabaseBrowserClient().from('public_news')
export const publicTrainingTable = () => getSupabaseBrowserClient().from('public_training_events')
export const publicResourcesTable = () => getSupabaseBrowserClient().from('public_resources')
export const publicPagesTable = () => getSupabaseBrowserClient().from('public_pages')
export const officialsTable = () => getSupabaseBrowserClient().from('officials')