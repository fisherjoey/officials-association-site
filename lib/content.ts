import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { remark } from 'remark'
import html from 'remark-html'
import yaml from 'js-yaml'
import { ORG_NAME, ORG_CITY, ORG_SPORT, ORG_LOCATION, EMAIL_INFO } from './siteConfig'

// Configure gray-matter to use js-yaml 4 properly
const matterWithYaml = (content: string) => {
  return matter(content, {
    engines: {
      yaml: {
        parse: yaml.load.bind(yaml) as (input: string) => object,
        stringify: yaml.dump.bind(yaml)
      }
    }
  })
}

const contentDirectory = path.join(process.cwd(), 'content')

export interface ContentItem {
  slug: string
  [key: string]: any
}

// Get all items from a content collection
export function getAllContent(collection: string): ContentItem[] {
  const dir = path.join(contentDirectory, collection)
  
  // Create directory if it doesn't exist
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
    return []
  }
  
  const filenames = fs.readdirSync(dir)
  
  const items = filenames
    .filter(filename => filename.endsWith('.md'))
    .map(filename => {
      const slug = filename.replace(/\.md$/, '')
      const fullPath = path.join(dir, filename)
      const fileContents = fs.readFileSync(fullPath, 'utf8')
      const { data, content } = matterWithYaml(fileContents)
      
      return {
        slug,
        content,
        ...data
      } as ContentItem
    })
  
  return items
}

// Get a single content item by slug
export function getContentBySlug(collection: string, slug: string): ContentItem | null {
  const fullPath = path.join(contentDirectory, collection, `${slug}.md`)
  
  if (!fs.existsSync(fullPath)) {
    return null
  }
  
  const fileContents = fs.readFileSync(fullPath, 'utf8')
  const { data, content } = matterWithYaml(fileContents)
  
  return {
    slug,
    content,
    ...data
  } as ContentItem
}

// Convert markdown content to HTML
export async function markdownToHtml(markdown: string): Promise<string> {
  const result = await remark().use(html).process(markdown)
  return result.toString()
}

// Get site settings
export function getSiteSettings() {
  const settingsPath = path.join(contentDirectory, 'settings', 'site.json')
  
  if (!fs.existsSync(settingsPath)) {
    // Return default settings if file doesn't exist
    return {
      title: ORG_NAME,
      description: `Professional ${ORG_SPORT} officiating services for ${ORG_CITY} and surrounding areas`,
      contact: {
        email: EMAIL_INFO,
        address: ORG_LOCATION
      },
      social: {
        facebook: '',
        twitter: '',
        instagram: ''
      }
    }
  }
  
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  return settings
}

// Sort content by date (newest first)
export function sortByDate(items: ContentItem[]): ContentItem[] {
  return items.sort((a, b) => {
    const dateA = new Date(a.date || 0).getTime()
    const dateB = new Date(b.date || 0).getTime()
    return dateB - dateA
  })
}

// Filter content by tag
export function filterByTag(items: ContentItem[], tag: string): ContentItem[] {
  return items.filter(item => {
    const tags = item.tags || []
    return tags.includes(tag)
  })
}

// Get all unique tags from content items
export function getAllTags(items: ContentItem[]): string[] {
  const tags = new Set<string>()
  items.forEach(item => {
    if (item.tags && Array.isArray(item.tags)) {
      item.tags.forEach((tag: string) => tags.add(tag))
    }
  })
  return Array.from(tags).sort()
}