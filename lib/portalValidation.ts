// Portal-specific validation rules and helpers
import { validators, validateForm, ValidationError } from './errorHandling'

// Resource form validation
export function validateResourceForm(data: {
  title?: string
  description?: string
  category?: string
  fileUrl?: string
  externalLink?: string
  accessLevel?: string
  file?: File | null
}): ValidationError[] {
  const rules: Record<string, Array<(value: any) => string | null>> = {
    title: [
      (v) => validators.required(v, 'Title'),
      (v) => validators.minLength(v, 3, 'Title'),
      (v) => validators.maxLength(v, 200, 'Title')
    ],
    description: [
      (v) => validators.required(v, 'Description'),
      (v) => validators.minLength(v, 10, 'Description'),
      (v) => validators.maxLength(v, 1000, 'Description')
    ],
    category: [
      (v) => validators.required(v, 'Category')
    ]
  }

  // Validate that at least one of file, fileUrl, or externalLink is provided
  const errors = validateForm(data, rules)

  if (!data.file && !data.fileUrl && !data.externalLink) {
    errors.push({
      field: 'file',
      message: 'Please provide either a file, select an existing file, or enter an external link'
    })
  }

  // Validate external link if provided
  if (data.externalLink) {
    const urlError = validators.url(data.externalLink)
    if (urlError) {
      errors.push({ field: 'externalLink', message: urlError })
    }
  }

  // Validate file if provided
  if (data.file) {
    const allowedTypes = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'mp4', 'avi', 'mov']
    const fileSizeError = validators.fileSize(data.file, 25) // 25MB max
    const fileTypeError = validators.fileType(data.file, allowedTypes)

    if (fileSizeError) {
      errors.push({ field: 'file', message: fileSizeError })
    }
    if (fileTypeError) {
      errors.push({ field: 'file', message: fileTypeError })
    }
  }

  return errors
}

// Announcement form validation
export function validateAnnouncementForm(data: {
  title?: string
  content?: string
  category?: string
  priority?: string
  author?: string
}): ValidationError[] {
  const rules: Record<string, Array<(value: any) => string | null>> = {
    title: [
      (v) => validators.required(v, 'Title'),
      (v) => validators.minLength(v, 5, 'Title'),
      (v) => validators.maxLength(v, 200, 'Title')
    ],
    content: [
      (v) => validators.required(v, 'Content'),
      (v) => validators.minLength(v, 20, 'Content'),
      (v) => validators.maxLength(v, 10000, 'Content')
    ],
    category: [
      (v) => validators.required(v, 'Category')
    ],
    priority: [
      (v) => validators.required(v, 'Priority')
    ],
    author: [
      (v) => validators.required(v, 'Author'),
      (v) => validators.minLength(v, 2, 'Author')
    ]
  }

  return validateForm(data, rules)
}

// Member form validation
export function validateMemberForm(data: {
  name?: string
  email?: string
  phone?: string
  certification_level?: string
  status?: string
  address?: string
  city?: string
  province?: string
  postal_code?: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
}): ValidationError[] {
  const rules: Record<string, Array<(value: any) => string | null>> = {
    name: [
      (v) => validators.required(v, 'Name'),
      (v) => validators.minLength(v, 2, 'Name'),
      (v) => validators.maxLength(v, 100, 'Name')
    ],
    email: [
      (v) => validators.required(v, 'Email'),
      (v) => validators.email(v)
    ],
    phone: [
      (v) => validators.phone(v || '')
    ],
    postal_code: [
      (v) => validators.postalCode(v || '')
    ],
    emergency_contact_phone: [
      (v) => validators.phone(v || '')
    ]
  }

  return validateForm(data, rules)
}

// Activity form validation
export function validateActivityForm(data: {
  member_id?: string
  activity_type?: string
  activity_date?: string
  notes?: string
}): ValidationError[] {
  const rules: Record<string, Array<(value: any) => string | null>> = {
    member_id: [
      (v) => validators.required(v, 'Member')
    ],
    activity_type: [
      (v) => validators.required(v, 'Activity Type')
    ],
    activity_date: [
      (v) => validators.required(v, 'Activity Date'),
      (v) => validators.date(v)
    ]
  }

  return validateForm(data, rules)
}

// Newsletter form validation
export function validateNewsletterForm(data: {
  title?: string
  issue_number?: string | number
  month?: string
  year?: string | number
  file?: File | null
  fileUrl?: string
}): ValidationError[] {
  const rules: Record<string, Array<(value: any) => string | null>> = {
    title: [
      (v) => validators.required(v, 'Title'),
      (v) => validators.minLength(v, 3, 'Title'),
      (v) => validators.maxLength(v, 200, 'Title')
    ],
    month: [
      (v) => validators.required(v, 'Month')
    ],
    year: [
      (v) => validators.required(v, 'Year')
    ]
  }

  const errors = validateForm(data, rules)

  // Validate that either file or fileUrl is provided
  if (!data.file && !data.fileUrl) {
    errors.push({
      field: 'file',
      message: 'Please provide a PDF file or select an existing file'
    })
  }

  // Validate file if provided
  if (data.file) {
    const allowedTypes = ['pdf']
    const fileSizeError = validators.fileSize(data.file, 15) // 15MB max for PDFs
    const fileTypeError = validators.fileType(data.file, allowedTypes)

    if (fileSizeError) {
      errors.push({ field: 'file', message: fileSizeError })
    }
    if (fileTypeError) {
      errors.push({ field: 'file', message: fileTypeError })
    }
  }

  return errors
}

// Helper to display validation errors
export function getFieldError(errors: ValidationError[], fieldName: string): string | null {
  const error = errors.find(e => e.field === fieldName)
  return error ? error.message : null
}

// Helper to check if form has errors
export function hasErrors(errors: ValidationError[]): boolean {
  return errors.length > 0
}

// Helper to format validation errors for display
export function formatValidationErrors(errors: ValidationError[]): string {
  if (errors.length === 0) return ''
  if (errors.length === 1) return errors[0].message

  return 'Please fix the following errors:\n' + errors.map(e => `• ${e.message}`).join('\n')
}
