export interface RuleModification {
  id: string
  title: string
  category: string
  summary: string
  content: string
  approvedBy?: string
  date: string
  slug: string
  createdAt?: string
  updatedAt?: string
}

export interface DataAdapter {
  getRuleModifications(): Promise<RuleModification[]>
  getRuleModification(slug: string): Promise<RuleModification | null>
  createRuleModification(rule: Omit<RuleModification, 'id' | 'createdAt' | 'updatedAt'>): Promise<RuleModification>
  updateRuleModification(id: string, updates: Partial<RuleModification>): Promise<RuleModification>
  deleteRuleModification(id: string): Promise<void>
}

export interface Announcement {
  id: string
  title: string
  content: string
  type?: string
  category: 'general' | 'rules' | 'schedule' | 'training' | 'administrative'
  priority: 'high' | 'normal' | 'low'
  date: string
  author: string
  audience?: string[]
  expires?: string
  createdAt?: string
  updatedAt?: string
}

export interface AnnouncementAdapter {
  getAnnouncements(): Promise<Announcement[]>
  getAnnouncement(id: string): Promise<Announcement | null>
  createAnnouncement(announcement: Omit<Announcement, 'id' | 'createdAt' | 'updatedAt'>): Promise<Announcement>
  updateAnnouncement(id: string, updates: Partial<Announcement>): Promise<Announcement>
  deleteAnnouncement(id: string): Promise<void>
}