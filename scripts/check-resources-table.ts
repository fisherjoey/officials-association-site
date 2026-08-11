import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkResourcesTable() {
  console.log('🔍 Checking if resources table exists...\n')

  try {
    // Try to select from resources table
    const { data, error } = await supabase
      .from('resources')
      .select('*')
      .limit(1)

    if (error) {
      console.error('❌ Error accessing resources table:')
      console.error(error)
      console.log('\n⚠️  The resources table may not exist or RLS policies may be blocking access.')
      console.log('📝 Please run the SQL in supabase/complete-schema-fixed.sql to create it.')
    } else {
      console.log('✅ Resources table exists!')
      console.log(`   Found ${data.length} record(s)`)
      if (data.length > 0) {
        console.log('\n📋 Sample data:')
        console.log(JSON.stringify(data[0], null, 2))
      }
    }
  } catch (err: any) {
    console.error('❌ Exception:', err.message)
  }
}

checkResourcesTable()
