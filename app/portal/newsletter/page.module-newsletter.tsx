import { getAllContent, sortByDate } from '@/lib/content'
import NewsletterClient from './NewsletterClient'

export default function NewsletterPage() {
  const newsletters = sortByDate(getAllContent('newsletters'))
  
  return <NewsletterClient newsletters={newsletters} />
}
