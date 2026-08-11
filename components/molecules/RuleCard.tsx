import CategoryBadge from '@/components/atoms/CategoryBadge'
import DateDisplay from '@/components/atoms/DateDisplay'
import { RuleModification } from '@/lib/adapters/types'

interface RuleCardProps {
  rule: RuleModification
  onClick?: () => void
  showActions?: boolean
  onEdit?: () => void
  onDelete?: () => void
}

export default function RuleCard({
  rule,
  onClick,
  showActions = false,
  onEdit,
  onDelete,
}: RuleCardProps) {
  return (
    <div
      className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
      role="article"
      aria-label={`Rule: ${rule.title}`}
    >
      <div className="flex justify-between items-start mb-3">
        <h3 className="text-lg font-semibold text-gray-900 flex-1">
          {rule.title}
        </h3>
        {showActions && (
          <div className="flex gap-2 ml-4" onClick={(e) => e.stopPropagation()}>
            {onEdit && (
              <button
                onClick={onEdit}
                className="text-blue-400 hover:text-blue-800 text-sm font-medium"
                aria-label={`Edit ${rule.title}`}
              >
                Edit
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="text-red-600 hover:text-red-800 text-sm font-medium"
                aria-label={`Delete ${rule.title}`}
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 mb-3">
        <CategoryBadge category={rule.category} />
        <DateDisplay
          date={rule.date}
          format="short"
          className="text-sm text-gray-500"
        />
      </div>

      <p className="text-gray-600 line-clamp-3">
        {rule.summary}
      </p>
    </div>
  )
}