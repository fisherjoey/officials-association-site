import { DataAdapter, AnnouncementAdapter } from './types'
import { FileSystemAdapter } from './FileSystemAdapter'
import { SupabaseAdapter } from './SupabaseAdapter'

export * from './types'
export { FileSystemAdapter } from './FileSystemAdapter'
export { SupabaseAdapter } from './SupabaseAdapter'

type AdapterType = 'filesystem' | 'supabase'

export class AdapterFactory {
  private static instance: AdapterFactory
  private dataAdapter: DataAdapter | null = null
  private announcementAdapter: AnnouncementAdapter | null = null
  private adapterType: AdapterType = 'filesystem'

  private constructor() {}

  static getInstance(): AdapterFactory {
    if (!AdapterFactory.instance) {
      AdapterFactory.instance = new AdapterFactory()
    }
    return AdapterFactory.instance
  }

  setAdapterType(type: AdapterType): void {
    this.adapterType = type
    this.dataAdapter = null
    this.announcementAdapter = null
  }

  getDataAdapter(): DataAdapter {
    if (!this.dataAdapter) {
      this.dataAdapter = this.createAdapter()
    }
    return this.dataAdapter
  }

  getAnnouncementAdapter(): AnnouncementAdapter {
    if (!this.announcementAdapter) {
      const adapter = this.createAdapter()
      if ('getAnnouncements' in adapter) {
        this.announcementAdapter = adapter as unknown as AnnouncementAdapter
      } else {
        throw new Error('Current adapter does not support announcements')
      }
    }
    return this.announcementAdapter
  }

  private createAdapter(): DataAdapter {
    switch (this.adapterType) {
      case 'filesystem':
        return new FileSystemAdapter()
      case 'supabase':
        return new SupabaseAdapter()
      default:
        throw new Error(`Unknown adapter type: ${this.adapterType}`)
    }
  }
}

// Helper function to get the correct adapter based on environment
export function getAdapter(): DataAdapter {
  const factory = AdapterFactory.getInstance()
  
  // Use Supabase if credentials are available, otherwise fallback to filesystem
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    factory.setAdapterType('supabase')
  } else {
    factory.setAdapterType('filesystem')
  }
  
  return factory.getDataAdapter()
}