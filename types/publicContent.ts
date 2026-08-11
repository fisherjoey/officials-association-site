/**
 * TypeScript types for public content management
 * Maps to Supabase tables: public_news, public_training_events, public_resources, public_pages, officials
 */

export interface PublicNewsItem {
  id: string
  title: string
  slug: string
  published_date: string
  author: string
  image_url?: string
  excerpt: string
  body: string  // Rich HTML content
  featured: boolean
  tags?: string[]
  active: boolean
  priority: number
  created_at: string
  updated_at: string
}

export interface PublicTrainingEvent {
  id: string
  title: string
  slug: string
  event_date: string
  event_time?: string
  start_time: string
  end_time: string
  location: string
  event_type: 'workshop' | 'certification' | 'refresher' | 'meeting'
  description: string  // Rich HTML content
  details?: string
  registration_link?: string
  registration_url?: string
  max_participants?: number
  capacity?: number
  current_registrations: number
  instructor?: string
  requirements?: string  // Rich HTML content
  active: boolean
  priority: number
  created_at: string
  updated_at: string
}

export interface PublicResource {
  id: string
  title: string
  slug: string
  category: string
  description: string  // Rich HTML content
  file_url?: string
  file_type?: string
  file_size?: string
  external_link?: string
  last_updated: string
  access_level: 'public' | 'members' | 'officials'
  active: boolean
  featured: boolean
  priority: number
  created_at: string
  updated_at: string
}

export interface PublicPage {
  id: string
  page_name: string  // 'home', 'about', etc.
  title: string
  content: string | HomePageContent | AboutPageContent | Record<string, any>  // JSONB - structure varies
  meta_description?: string
  last_edited_by?: string
  active: boolean
  created_at: string
  updated_at: string
}

// Specific content structures for different page types
export interface HomePageContent {
  heroTitle: string
  heroSubtitle: string
  heroImage?: string
  stats: Array<{
    label: string
    value: string
  }>
  aboutSection: string  // Rich HTML
}

export interface AboutPageContent {
  body: string  // Rich HTML
}

export interface Official {
  id: string
  name: string
  level?: string | number  // 1-5
  photo_url?: string
  bio?: string  // Rich HTML content
  years_experience?: number
  phone?: string
  email?: string
  availability?: string
  certifications?: string[]
  active: boolean
  priority: number
  created_at: string
  updated_at: string
}

export interface ExecutiveMember {
  id: string
  name: string
  position: string
  email: string
  image_url?: string
  bio?: string
  active: boolean
  priority: number
  created_at: string
  updated_at: string
}

// Form input types (without auto-generated fields)
export type PublicNewsItemInput = Omit<PublicNewsItem, 'id' | 'created_at' | 'updated_at'>
export type PublicTrainingEventInput = Omit<PublicTrainingEvent, 'id' | 'created_at' | 'updated_at'>
export type PublicResourceInput = Omit<PublicResource, 'id' | 'created_at' | 'updated_at'>
export type PublicPageInput = Omit<PublicPage, 'id' | 'created_at' | 'updated_at'>
export type OfficialInput = Omit<Official, 'id' | 'created_at' | 'updated_at'>
export type ExecutiveMemberInput = Omit<ExecutiveMember, 'id' | 'created_at' | 'updated_at'>
