import { getAllTags, getNewsSummaries } from '@/lib/content'
import NewsClient from './news-client'

/**
 * The public news index.
 *
 * Read at build time from `content/news/*.md`, the same directory
 * `app/news/[slug]/generateStaticParams` walks. Both halves of `/news` come
 * out of one place, so every card in the list has a page in `out/` and
 * `scripts/check-exported-links.mjs` can see the links well enough to check
 * them - neither of which was true while the list was fetched from
 * `public_news` in the browser.
 */
export default function NewsPage() {
  const articles = getNewsSummaries()

  return <NewsClient articles={articles} tags={getAllTags(articles)} />
}
