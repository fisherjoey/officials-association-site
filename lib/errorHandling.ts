// Centralized error handling utilities

export interface ValidationError {
  field: string
  message: string
}

export class AppError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number,
    public details?: any
  ) {
    super(message)
    this.name = 'AppError'
  }
}

// Validation helpers
export const validators = {
  required: (value: any, fieldName: string): string | null => {
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      return `${fieldName} is required`
    }
    return null
  },

  email: (value: string): string | null => {
    if (!value) return null // Use required validator separately
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(value)) {
      return 'Please enter a valid email address'
    }
    return null
  },

  phone: (value: string): string | null => {
    if (!value) return null // Optional field
    // Accept various phone formats: (123) 456-7890, 123-456-7890, 1234567890
    const phoneRegex = /^[\d\s\-\(\)]+$/
    if (!phoneRegex.test(value) || value.replace(/\D/g, '').length < 10) {
      return 'Please enter a valid phone number (at least 10 digits)'
    }
    return null
  },

  url: (value: string): string | null => {
    if (!value) return null // Optional field
    try {
      new URL(value)
      return null
    } catch {
      return 'Please enter a valid URL (e.g., https://example.com)'
    }
  },

  minLength: (value: string, min: number, fieldName: string): string | null => {
    if (!value) return null
    if (value.length < min) {
      return `${fieldName} must be at least ${min} characters`
    }
    return null
  },

  maxLength: (value: string, max: number, fieldName: string): string | null => {
    if (!value) return null
    if (value.length > max) {
      return `${fieldName} must not exceed ${max} characters`
    }
    return null
  },

  postalCode: (value: string): string | null => {
    if (!value) return null // Optional field
    // Canadian postal code format: A1A 1A1
    const postalRegex = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/
    if (!postalRegex.test(value)) {
      return 'Please enter a valid postal code (e.g., A1A 1A1)'
    }
    return null
  },

  fileSize: (file: File, maxSizeMB: number): string | null => {
    const maxSizeBytes = maxSizeMB * 1024 * 1024
    if (file.size > maxSizeBytes) {
      return `File size must not exceed ${maxSizeMB}MB (current: ${(file.size / 1024 / 1024).toFixed(2)}MB)`
    }
    return null
  },

  fileType: (file: File, allowedTypes: string[]): string | null => {
    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    if (!fileExtension || !allowedTypes.includes(fileExtension)) {
      return `File type .${fileExtension} is not allowed. Allowed types: ${allowedTypes.join(', ')}`
    }
    return null
  },

  date: (value: string): string | null => {
    if (!value) return null
    const date = new Date(value)
    if (isNaN(date.getTime())) {
      return 'Please enter a valid date'
    }
    return null
  }
}

// Sanitization helpers to prevent XSS
export const sanitize = {
  // Basic HTML escaping for text inputs
  // Note: Only escape characters that could enable XSS attacks
  // Apostrophes and quotes are safe in React text content (React escapes on render)
  // Only < and > are dangerous as they can create HTML tags
  text: (value: string): string => {
    if (!value) return ''
    return value
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  },

  // Rich-text HTML on its way into storage: passed through untouched, on
  // purpose. The XSS guard is `sanitizeHtml`, applied by `HTMLViewer` when the
  // content is rendered. Escaping or stripping here would corrupt what gets
  // persisted - see the note in lib/sanitizeHtml.ts.
  html: (value: string): string => {
    if (!value) return ''
    return value
  },

  // For URLs - ensure they start with http:// or https://
  url: (value: string): string | null => {
    if (!value) return null
    const trimmed = value.trim()
    // Prevent javascript: and data: URLs
    if (trimmed.match(/^(javascript|data|vbscript):/i)) {
      return null
    }
    // Ensure http:// or https://
    if (!trimmed.match(/^https?:\/\//i)) {
      return `https://${trimmed}`
    }
    return trimmed
  }
}

// API error parsing
export function parseAPIError(error: any): string {
  // Handle different error formats
  if (error instanceof AppError) {
    return error.message
  }

  if (error?.response) {
    // Axios-style error
    const data = error.response.data
    if (typeof data === 'string') return data
    if (data?.error) return data.error
    if (data?.message) return data.message
    return `Request failed with status ${error.response.status}`
  }

  if (error?.message) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return 'An unexpected error occurred. Please try again.'
}

// User-friendly error messages for common scenarios
export const errorMessages = {
  network: 'Network error. Please check your internet connection and try again.',
  timeout: 'Request timed out. Please try again.',
  unauthorized: 'You are not authorized to perform this action.',
  notFound: 'The requested resource was not found.',
  serverError: 'A server error occurred. Please try again later.',
  validation: 'Please check the form for errors and try again.',
  fileUpload: 'File upload failed. Please try again with a different file.',
  generic: 'Something went wrong. Please try again.'
}

// Retry logic for API calls
export async function retryAsync<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number
    retryDelay?: number
    retryableErrors?: string[]
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    retryableErrors = ['network', 'timeout', 'Failed to fetch']
  } = options

  let lastError: any

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error

      // Check if error is retryable
      const errorMessage = parseAPIError(error)
      const isRetryable = retryableErrors.some(msg =>
        errorMessage.toLowerCase().includes(msg.toLowerCase())
      )

      // Don't retry if error is not retryable or if this was the last attempt
      if (!isRetryable || attempt === maxRetries - 1) {
        throw error
      }

      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempt)))
    }
  }

  throw lastError
}

// Form validation helper
export function validateForm(
  data: Record<string, any>,
  rules: Record<string, Array<(value: any) => string | null>>
): ValidationError[] {
  const errors: ValidationError[] = []

  for (const [field, fieldRules] of Object.entries(rules)) {
    const value = data[field]

    for (const rule of fieldRules) {
      const error = rule(value)
      if (error) {
        errors.push({ field, message: error })
        break // Only show first error per field
      }
    }
  }

  return errors
}

// Check if error is a network error
export function isNetworkError(error: any): boolean {
  return (
    error?.message === 'Failed to fetch' ||
    error?.message === 'Network request failed' ||
    error?.code === 'ECONNREFUSED' ||
    error?.code === 'ETIMEDOUT'
  )
}
