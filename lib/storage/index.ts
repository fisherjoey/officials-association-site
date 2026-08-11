import { StorageAdapter } from './interface'
import { SupabaseStorageAdapter, resourcesStorage, newsletterStorage } from './supabase'
import { LocalStorageAdapter, localResourcesStorage, localNewsletterStorage } from './localStorage'
import { STORAGE_PREFIX } from '../siteConfig'

// Check if Supabase is configured
const useSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL && 
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
                    process.env.NEXT_PUBLIC_USE_SUPABASE === 'true'

// Export the appropriate storage adapter based on environment
export const storage: {
  resources: StorageAdapter
  newsletters: StorageAdapter
  training: StorageAdapter
} = useSupabase ? {
  resources: resourcesStorage,
  newsletters: newsletterStorage,
  training: new SupabaseStorageAdapter('training-materials')
} : {
  resources: localResourcesStorage,
  newsletters: localNewsletterStorage,
  training: new LocalStorageAdapter(`${STORAGE_PREFIX}training_files`)
}

// Export types
export * from './interface'

// Helper to check which storage is being used
export const isUsingSupabase = () => useSupabase

// Helper to get storage info
export const getStorageInfo = () => ({
  type: useSupabase ? 'supabase' : 'localStorage',
  configured: useSupabase,
  message: useSupabase 
    ? 'Using Supabase Storage (production)' 
    : 'Using localStorage (development/demo)'
})