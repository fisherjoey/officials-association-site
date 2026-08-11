import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { RuleModification, DataAdapter, Announcement, AnnouncementAdapter } from './types'
import { DEFAULT_AUTHOR } from '../siteConfig'

export class FileSystemAdapter implements DataAdapter, AnnouncementAdapter {
  private contentPath: string

  constructor(contentPath: string = 'content/portal/rule-modifications') {
    this.contentPath = contentPath
  }

  async getRuleModifications(): Promise<RuleModification[]> {
    const directory = path.join(process.cwd(), this.contentPath)
    
    if (!fs.existsSync(directory)) {
      return []
    }

    const files = fs.readdirSync(directory)
    const rules: RuleModification[] = []

    for (const file of files) {
      if (file.endsWith('.md')) {
        const filePath = path.join(directory, file)
        const fileContents = fs.readFileSync(filePath, 'utf8')
        const { data, content } = matter(fileContents)
        
        rules.push({
          id: file.replace('.md', ''),
          slug: file.replace('.md', ''),
          title: data.title || '',
          category: data.category || '',
          summary: data.summary || '',
          content: content,
          approvedBy: data.approvedBy,
          date: data.date || new Date().toISOString(),
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        })
      }
    }

    return rules.sort((a, b) => {
      const dateA = new Date(a.date).getTime()
      const dateB = new Date(b.date).getTime()
      return dateB - dateA
    })
  }

  async getRuleModification(slug: string): Promise<RuleModification | null> {
    const filePath = path.join(process.cwd(), this.contentPath, `${slug}.md`)
    
    if (!fs.existsSync(filePath)) {
      return null
    }

    const fileContents = fs.readFileSync(filePath, 'utf8')
    const { data, content } = matter(fileContents)
    
    return {
      id: slug,
      slug: slug,
      title: data.title || '',
      category: data.category || '',
      summary: data.summary || '',
      content: content,
      approvedBy: data.approvedBy,
      date: data.date || new Date().toISOString(),
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    }
  }

  async createRuleModification(rule: Omit<RuleModification, 'id' | 'createdAt' | 'updatedAt'>): Promise<RuleModification> {
    const id = rule.slug || this.generateSlug(rule.title)
    const filePath = path.join(process.cwd(), this.contentPath, `${id}.md`)
    
    const frontMatter: any = {
      title: rule.title,
      category: rule.category,
      summary: rule.summary,
      date: rule.date || new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    // Only add approvedBy if it exists
    if (rule.approvedBy) {
      frontMatter.approvedBy = rule.approvedBy
    }

    const fileContent = matter.stringify(rule.content, frontMatter)
    fs.writeFileSync(filePath, fileContent)

    return {
      ...rule,
      id,
      slug: id,
      createdAt: frontMatter.createdAt,
      updatedAt: frontMatter.updatedAt,
    }
  }

  async updateRuleModification(id: string, updates: Partial<RuleModification>): Promise<RuleModification> {
    const existing = await this.getRuleModification(id)
    if (!existing) {
      throw new Error(`Rule modification ${id} not found`)
    }

    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() }
    const filePath = path.join(process.cwd(), this.contentPath, `${id}.md`)
    
    const frontMatter: any = {}

    // Only add defined values to frontMatter
    if (updated.title !== undefined) frontMatter.title = updated.title
    if (updated.category !== undefined) frontMatter.category = updated.category
    if (updated.summary !== undefined) frontMatter.summary = updated.summary
    if (updated.date !== undefined) frontMatter.date = updated.date
    if (updated.createdAt !== undefined) frontMatter.createdAt = updated.createdAt
    if (updated.updatedAt !== undefined) frontMatter.updatedAt = updated.updatedAt
    if (updated.approvedBy) frontMatter.approvedBy = updated.approvedBy

    const fileContent = matter.stringify(updated.content, frontMatter)
    fs.writeFileSync(filePath, fileContent)

    return updated
  }

  async deleteRuleModification(id: string): Promise<void> {
    const filePath = path.join(process.cwd(), this.contentPath, `${id}.md`)
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  }

  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
  }

  // Announcement methods
  async getAnnouncements(): Promise<Announcement[]> {
    const directory = path.join(process.cwd(), 'content/portal/announcements')

    if (!fs.existsSync(directory)) {
      return []
    }

    const files = fs.readdirSync(directory)
    const announcements: Announcement[] = []

    for (const file of files) {
      if (file.endsWith('.md')) {
        const filePath = path.join(directory, file)
        const fileContents = fs.readFileSync(filePath, 'utf8')
        const { data, content } = matter(fileContents)

        announcements.push({
          id: file.replace('.md', ''),
          title: data.title || '',
          content: content,
          type: data.type || 'info',
          category: data.category || 'general',
          priority: data.priority || 'normal',
          date: data.date || new Date().toISOString(),
          author: data.author || DEFAULT_AUTHOR,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        })
      }
    }

    return announcements.sort((a, b) => {
      const dateA = new Date(a.date).getTime()
      const dateB = new Date(b.date).getTime()
      return dateB - dateA
    })
  }

  async getAnnouncement(id: string): Promise<Announcement | null> {
    const filePath = path.join(process.cwd(), 'content/portal/announcements', `${id}.md`)

    if (!fs.existsSync(filePath)) {
      return null
    }

    const fileContents = fs.readFileSync(filePath, 'utf8')
    const { data, content } = matter(fileContents)

    return {
      id: id,
      title: data.title || '',
      content: content,
      type: data.type || 'info',
      category: data.category || 'general',
      priority: data.priority || 'normal',
      date: data.date || new Date().toISOString(),
      author: data.author || DEFAULT_AUTHOR,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    }
  }

  async createAnnouncement(announcement: Omit<Announcement, 'id' | 'createdAt' | 'updatedAt'>): Promise<Announcement> {
    const id = this.generateSlug(announcement.title)
    const directory = path.join(process.cwd(), 'content/portal/announcements')

    // Ensure directory exists
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true })
    }

    const filePath = path.join(directory, `${id}.md`)

    const frontMatter = {
      title: announcement.title,
      type: announcement.type,
      date: announcement.date || new Date().toISOString(),
      author: announcement.author,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const fileContent = matter.stringify(announcement.content, frontMatter)
    fs.writeFileSync(filePath, fileContent)

    return {
      ...announcement,
      id,
      createdAt: frontMatter.createdAt,
      updatedAt: frontMatter.updatedAt,
    }
  }

  async updateAnnouncement(id: string, updates: Partial<Announcement>): Promise<Announcement> {
    const existing = await this.getAnnouncement(id)
    if (!existing) {
      throw new Error(`Announcement ${id} not found`)
    }

    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() }
    const filePath = path.join(process.cwd(), 'content/portal/announcements', `${id}.md`)

    const frontMatter = {
      title: updated.title,
      type: updated.type,
      date: updated.date,
      author: updated.author,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    }

    const fileContent = matter.stringify(updated.content, frontMatter)
    fs.writeFileSync(filePath, fileContent)

    return updated
  }

  async deleteAnnouncement(id: string): Promise<void> {
    const filePath = path.join(process.cwd(), 'content/portal/announcements', `${id}.md`)

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  }
}