import { z } from 'zod'

// Common validation patterns
export const phoneRegex = /^\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$/
export const postalCodeRegex = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/
export const nameRegex = /^[A-Za-z][A-Za-z\s\-']*[A-Za-z]$/

// Reusable field schemas
export const phoneSchema = z.string()
  .min(1, 'Phone number is required')
  .refine((val) => {
    const digits = val.replace(/\D/g, '')
    return digits.length >= 10
  }, 'Please enter a valid phone number (at least 10 digits)')

export const optionalPhoneSchema = z.string()
  .refine((val) => {
    if (!val) return true
    const digits = val.replace(/\D/g, '')
    return digits.length >= 10
  }, 'Please enter a valid phone number (at least 10 digits)')
  .optional()
  .or(z.literal(''))

export const postalCodeSchema = z.string()
  .min(1, 'Postal code is required')
  .refine((val) => postalCodeRegex.test(val.trim()), 'Please enter a valid postal code (e.g., T2P 1J9)')

export const nameSchema = z.string()
  .min(2, 'Name must be at least 2 characters')
  .refine((val) => nameRegex.test(val.trim()), 'Please enter a valid name (letters only)')

export const emailSchema = z.string()
  .min(1, 'Email is required')
  .email('Please enter a valid email address')

export const optionalEmailSchema = z.string()
  .email('Please enter a valid email address')
  .optional()
  .or(z.literal(''))

export const requiredString = (fieldName: string) =>
  z.string().min(1, `${fieldName} is required`)

export const optionalString = z.string().optional().or(z.literal(''))

// Province validation — codes from shared constants
import { PROVINCE_CODES } from '../constants'

export const provinceSchema = z.string().refine(
  val => PROVINCE_CODES.includes(val),
  'Please select a valid province'
)
