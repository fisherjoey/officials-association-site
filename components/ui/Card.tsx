interface CardProps {
  children: React.ReactNode
  className?: string
  padding?: 'none' | 'sm' | 'md' | 'lg'
  shadow?: boolean
  hover?: boolean
}

export default function Card({
  children,
  className = '',
  padding = 'md',
  shadow = true,
  hover = false,
}: CardProps) {
  const paddingStyles = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  }
  
  const baseStyles = 'bg-white dark:bg-portal-surface rounded-xl border border-zinc-200 dark:border-portal-border transition-all duration-200'
  const shadowStyle = shadow ? '' : ''
  const hoverStyle = hover ? 'hover:border-orange-200 dark:hover:border-portal-accent/30 hover:shadow-sm hover:-translate-y-0.5' : ''
  
  return (
    <div className={`${baseStyles} ${paddingStyles[padding]} ${shadowStyle} ${hoverStyle} ${className}`}>
      {children}
    </div>
  )
}