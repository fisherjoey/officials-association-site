'use client'

import React from 'react'
import { Controller } from 'react-hook-form'
import { formatPhoneNumber } from '@/lib/constants'

// Reusable styles
const inputStyles = "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent transition-colors"
const labelStyles = "block text-sm font-semibold text-gray-700 mb-1"
const errorStyles = "text-red-500 text-sm mt-1"

interface Step3EventContactProps {
  register: any
  control: any
  errors: any
}

export default function Step3EventContact({ register, control, errors }: Step3EventContactProps) {
  return (
    <div>
      <h3 className="text-xl font-bold text-brand-secondary mb-4">Event Contact</h3>
      <p className="text-sm text-gray-600 mb-4">
        This person will be contacted regarding scheduling and game day coordination.
      </p>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="eventContactName" className={labelStyles}>
            Contact Name <span className="text-red-500">*</span>
          </label>
          <input
            id="eventContactName"
            type="text"
            {...register('eventContactName')}
            className={inputStyles}
          />
          {errors.eventContactName && <p className={errorStyles}>{errors.eventContactName.message}</p>}
        </div>

        <div>
          <label htmlFor="eventContactEmail" className={labelStyles}>
            Contact Email <span className="text-red-500">*</span>
          </label>
          <input
            id="eventContactEmail"
            type="email"
            {...register('eventContactEmail')}
            className={inputStyles}
          />
          {errors.eventContactEmail && <p className={errorStyles}>{errors.eventContactEmail.message}</p>}
        </div>

        <div>
          <label htmlFor="eventContactPhone" className={labelStyles}>
            Contact Phone
          </label>
          <Controller
            name="eventContactPhone"
            control={control}
            render={({ field }) => (
              <input
                id="eventContactPhone"
                type="tel"
                value={field.value || ''}
                onChange={(e) => field.onChange(formatPhoneNumber(e.target.value))}
                onBlur={field.onBlur}
                className={inputStyles}
                placeholder="(403) 555-1234"
                maxLength={14}
              />
            )}
          />
          {errors.eventContactPhone && <p className={errorStyles}>{errors.eventContactPhone.message}</p>}
        </div>
      </div>
    </div>
  )
}
