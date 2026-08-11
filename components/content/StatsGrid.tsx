interface Stat {
  label: string
  value: string | number
  icon?: React.ReactNode
}

interface StatsGridProps {
  stats: Stat[]
  columns?: 2 | 3 | 4
}

export default function StatsGrid({ stats, columns = 4 }: StatsGridProps) {
  const columnClasses = {
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-3',
    4: 'grid-cols-2 md:grid-cols-4',
  }
  
  // For 3 stats, use a centered layout
  const gridClass = stats.length === 3 
    ? 'grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto'
    : `grid ${columnClasses[columns]} gap-6`
  
  return (
    <div className={gridClass}>
      {stats.map((stat, index) => (
        <div 
          key={index}
          className="bg-white rounded-lg p-6 text-center shadow-md hover:shadow-lg transition-shadow"
        >
          {stat.icon && (
            <div className="text-brand-primary mb-3 flex justify-center">
              {stat.icon}
            </div>
          )}
          <div className="text-3xl font-bold text-brand-secondary mb-2">
            {stat.value}
          </div>
          <div className="text-gray-600">
            {stat.label}
          </div>
        </div>
      ))}
    </div>
  )
}