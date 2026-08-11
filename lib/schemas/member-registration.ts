import { z } from 'zod'
import { phoneSchema, postalCodeSchema, nameSchema, provinceSchema } from './common'

export const memberRegistrationSchema = z.object({
  first_name: nameSchema,
  last_name: nameSchema,
  phone: phoneSchema,
  address: z.string()
    .min(5, 'Please enter a valid street address'),
  city: z.string()
    .min(2, 'Please enter a valid city name'),
  province: provinceSchema,
  postal_code: postalCodeSchema,
  emergency_contact_name: z.string()
    .min(2, 'Please enter a valid contact name'),
  emergency_contact_phone: phoneSchema,
})

export type MemberRegistrationFormData = z.infer<typeof memberRegistrationSchema>
