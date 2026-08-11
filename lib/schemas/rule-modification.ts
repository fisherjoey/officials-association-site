import { z } from 'zod'

export const RULE_CATEGORIES = [
  'School League',
  'School Tournament',
  'Club League',
  'Club Tournament',
  'Adult',
] as const

export const ruleModificationSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  category: z.enum(RULE_CATEGORIES, { message: 'Category is required' }),
  summary: z.string().min(1, 'Summary is required'),
  content: z.string().min(1, 'Content is required'),
  date: z.string().optional(),
})

export type RuleModificationFormData = z.infer<typeof ruleModificationSchema>
