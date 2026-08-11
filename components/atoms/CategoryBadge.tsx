interface CategoryBadgeProps {
  category: string
}

const CATEGORY_COLORS: Record<string, string> = {
  'School League': 'bg-blue-100 text-blue-800',
  'School Tournament': 'bg-purple-100 text-purple-800',
  'Club League': 'bg-green-100 text-green-800',
  'Club Tournament': 'bg-orange-100 text-orange-800',
  'Adult': 'bg-yellow-100 text-yellow-800',
}

export default function CategoryBadge({ category }: CategoryBadgeProps) {
  // Handle empty or whitespace-only categories
  const trimmedCategory = category?.trim()
  const displayCategory = trimmedCategory || 'Uncategorized'

  // Get color classes or default to gray
  const colorClasses = CATEGORY_COLORS[displayCategory] || 'bg-gray-100 text-gray-800'

  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-semibold ${colorClasses}`}
      aria-label={`Category: ${displayCategory}`}
    >
      {displayCategory}
    </span>
  )
}