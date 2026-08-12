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

/**
 * Render a markdown body to HTML.
 *
 * `remark-html` runs with `allowDangerousHtml` off, which is the default and
 * which we want: raw HTML in a content file is dropped rather than emitted, so
 * a `<script>` someone pastes into `content/news/*.md` never reaches the
 * sanitiser in the first place. The sanitiser still runs afterwards - see the
 * call in `app/news/[slug]/page.tsx` - because defence here is cheap and the
 * two guards fail independently.
 */
export async function markdownToHtml(markdown: string): Promise<string> {
  const result = await remark().use(html).process(markdown)
  return result.toString()
}

/**
 * The fields a news card needs, and nothing else.
 *
 * `/news` is a client component so it can filter by tag without a round trip,
 * which means everything it is handed crosses into the browser bundle. Handing
 * it `ContentItem` would ship every article body twice - once in the list
 * payload, once in the article page that actually renders it.
 */
export interface NewsSummary {
  slug: string
  title: string
  date: string
  excerpt: string
  author?: string
  image?: string
  tags: string[]
  featured: boolean
}

/**
 * Every news article the export can serve, newest first.
 *
 * This is the single source for both halves of `/news`: the list reads it at
 * build time and `generateStaticParams` walks the same directory, so a slug in
 * the list is a slug with a page. That agreement is the point: a static export
 * has no way to serve an article it did not write to disk, so anything the list
 * can offer has to come from here. See the news entry under "Documented
 * assumptions" in the README.
 */
export function getNewsSummaries(): NewsSummary[] {
  return sortByDate(getAllContent('news')).map((item) => ({
    slug: item.slug,
    title: item.title ?? item.slug,
    date: item.date ?? '',
    excerpt: item.excerpt ?? '',
    author: item.author || undefined,
    image: item.image || undefined,
    tags: Array.isArray(item.tags) ? item.tags : [],
    featured: item.featured === true,
  }))
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

// Get all unique tags from content items. Takes the widest shape that can
// answer the question so it works on `NewsSummary` as well as `ContentItem`.
export function getAllTags(items: Array<{ tags?: unknown }>): string[] {
  const tags = new Set<string>()
  items.forEach(item => {
    if (item.tags && Array.isArray(item.tags)) {
      item.tags.forEach((tag: string) => tags.add(tag))
    }
  })
  return Array.from(tags).sort()
}