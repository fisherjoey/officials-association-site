import Link from 'next/link'

interface ButtonProps {
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'utility' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  href?: string
  onClick?: () => void
  type?: 'button' | 'submit' | 'reset'
  className?: string
  disabled?: boolean
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  href,
  onClick,
  type = 'button',
  className = '',
  disabled = false,
}: ButtonProps) {
  const baseStyles = 'inline-block font-semibold tracking-tight rounded-lg transition-all cursor-pointer text-center'

  const variantStyles = {
    primary: 'bg-gradient-to-r from-brand-primary to-orange-500 text-white hover:shadow-lg hover:shadow-orange-500/20 hover:-translate-y-0.5',
    secondary: 'bg-transparent text-white border-2 border-white hover:bg-white hover:text-brand-secondary',
    utility: 'bg-brand-primary text-white rounded-full hover:bg-opacity-90',
    outline: 'bg-transparent text-gray-700 border-2 border-gray-300 hover:bg-gray-50 hover:border-gray-400',
  }
  
  const sizeStyles = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2.5 text-base',
    lg: 'px-6 py-3.5 text-lg',
  }
  
  const combinedStyles = `${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`
  
  if (href) {
    const isExternal = href.startsWith('http://') || href.startsWith('https://')
    if (isExternal) {
      return (
        <a href={href} className={combinedStyles} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      )
    }
    return (
      <Link href={href} className={combinedStyles}>
        {children}
      </Link>
    )
  }
  
  return (
    <button 
      type={type} 
      onClick={onClick} 
      className={combinedStyles}
      disabled={disabled}
    >
      {children}
    </button>
  )
}