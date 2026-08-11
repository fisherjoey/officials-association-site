import { forwardRef, useId } from 'react'

interface TextInputProps {
  label?: string
  value?: string
  onChange?: (value: string | React.ChangeEvent<HTMLInputElement>) => void
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void
  type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url'
  placeholder?: string
  error?: string
  disabled?: boolean
  required?: boolean
  className?: string
  name?: string
  // Allow additional HTML input attributes (e.g., from react-hook-form's register)
  [key: string]: any
}

export type { TextInputProps }

const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput({
  label,
  value,
  onChange,
  onBlur,
  type = 'text',
  placeholder,
  error,
  disabled = false,
  required = false,
  className = '',
  name,
}, ref) {
  // Generate unique IDs for accessibility
  const inputId = useId()
  const errorId = useId()

  // Handle change events - pass the event to onChange
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!disabled && onChange) {
      onChange(e)
    }
  }

  // Determine input classes based on state
  const inputClasses = [
    'w-full',
    'px-3',
    'py-2',
    'border',
    'rounded-lg',
    'transition-colors',
    'focus:outline-none',
    'focus:ring-2',
    error ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500',
    disabled ? 'bg-gray-50 cursor-not-allowed opacity-60' : 'bg-white',
    className,
  ].filter(Boolean).join(' ')

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <input
        ref={ref}
        id={inputId}
        name={name || label}
        type={type}
        value={value}
        onChange={handleChange}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        className={inputClasses}
        aria-label={label}
        aria-invalid={!!error}
        aria-required={required}
        aria-describedby={error ? errorId : undefined}
      />

      {error && (
        <p
          id={errorId}
          className="mt-1 text-sm text-red-600"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  )
})

export default TextInput
