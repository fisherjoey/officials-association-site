import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { RuleModification, DataAdapter, Announcement, AnnouncementAdapter } from './types'

export class SupabaseAdapter implements DataAdapter, AnnouncementAdapter {
  private supabase: SupabaseClient

  constructor(supabaseUrl?: string, supabaseKey?: string) {
    const url = supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL!
    const key = supabaseKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    
    if (!url || !key) {
      throw new Error('Supabase URL and key are required')
    }

    this.supabase = createClient(url, key)
  }

  // Rule Modifications
  async getRuleModifications(): Promise<RuleModification[]> {
    const { data, error } = await this.supabase
      .from('rule_modifications')
      .select('*')
      .order('date', { ascending: false })

    if (error) {
      console.error('Error fetching rule modifications:', error)
      return []
    }

    return data || []
  }

  async getRuleModification(slug: string): Promise<RuleModification | null> {
    const { data, error } = await this.supabase
      .from('rule_modifications')
      .select('*')
      .eq('slug', slug)
      .single()

    if (error) {
      console.error('Error fetching rule modification:', error)
      return null
    }

    return data
  }

  async createRuleModification(rule: Omit<RuleModification, 'id' | 'createdAt' | 'updatedAt'>): Promise<RuleModification> {
    const slug = rule.slug || this.generateSlug(rule.title)
    
    const { data, error } = await this.supabase
      .from('rule_modifications')
      .insert([{
        ...rule,
        slug,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }])
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create rule modification: ${error.message}`)
    }

    return data
  }

  async updateRuleModification(id: string, updates: Partial<RuleModification>): Promise<RuleModification> {
    const { data, error } = await this.supabase
      .from('rule_modifications')
      .update({
        ...updates,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to update rule modification: ${error.message}`)
    }

    return data
  }

  async deleteRuleModification(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('rule_modifications')
      .delete()
      .eq('id', id)

    if (error) {
      throw new Error(`Failed to delete rule modification: ${error.message}`)
    }
  }

  // Announcements
  async getAnnouncements(): Promise<Announcement[]> {
    const { data, error } = await this.supabase
      .from('announcements')
      .select('*')
      .order('date', { ascending: false })

    if (error) {
      console.error('Error fetching announcements:', error)
      return []
    }

    return data || []
  }

  async getAnnouncement(id: string): Promise<Announcement | null> {
    const { data, error } = await this.supabase
      .from('announcements')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching announcement:', error)
      return null
    }

    return data
  }

  async createAnnouncement(announcement: Omit<Announcement, 'id' | 'createdAt' | 'updatedAt'>): Promise<Announcement> {
    const { data, error } = await this.supabase
      .from('announcements')
      .insert([{
        ...announcement,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }])
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create announcement: ${error.message}`)
    }

    return data
  }

  async updateAnnouncement(id: string, updates: Partial<Announcement>): Promise<Announcement> {
    const { data, error } = await this.supabase
      .from('announcements')
      .update({
        ...updates,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to update announcement: ${error.message}`)
    }

    return data
  }

  async deleteAnnouncement(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('announcements')
      .delete()
      .eq('id', id)

    if (error) {
      throw new Error(`Failed to delete announcement: ${error.message}`)
    }
  }

  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
  }
}