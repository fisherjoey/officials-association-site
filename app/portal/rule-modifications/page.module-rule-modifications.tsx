import { getAllContent, sortByDate } from '@/lib/content'
import RuleModificationsClient from './RuleModificationsClient'

export default function RuleModificationsPage() {
  const modifications = sortByDate(getAllContent('portal/rule-modifications'))
    .filter(mod => mod.active !== false)
  
  const categories = Array.from(new Set(modifications.map(mod => mod.category)))
    .filter(Boolean)
    .sort()
  
  return <RuleModificationsClient modifications={modifications} categories={categories} />
}