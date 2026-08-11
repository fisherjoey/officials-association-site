'use client'

import React from 'react'
import { Controller } from 'react-hook-form'
import { PROVINCES, formatPhoneNumber, formatPostalCode } from '@/lib/constants'

// Reusable styles
const inputStyles = "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent transition-colors"
const labelStyles = "block text-sm font-semibold text-gray-700 mb-1"
const errorStyles = "text-red-500 text-sm mt-1"

interface Step2BillingProps {
  register: any
  control: any
  errors: any
}

export default function Step2Billing({ register, control, errors }: Step2BillingProps) {
  return (
    <div>
      <h3 className="text-xl font-bold text-brand-secondary mb-4">Billing Information</h3>
      <p className="text-sm text-gray-600 mb-4">
        Payment is due within 30 days of invoice date. For events starting after April 1st, payment is required in advance.
      </p>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="billingContactName" className={labelStyles}>
            Billing Contact Name <span className="text-red-500">*</span>
          </label>
          <input
            id="billingContactName"
            type="text"
            {...register('billingContactName')}
            className={inputStyles}
          />
          {errors.billingContactName && <p className={errorStyles}>{errors.billingContactName.message}</p>}
        </div>

        <div>
          <label htmlFor="billingEmail" className={labelStyles}>
            Billing Email <span className="text-red-500">*</span>
          </label>
          <input
            id="billingEmail"
            type="email"
            {...register('billingEmail')}
            className={inputStyles}
          />
          {errors.billingEmail && <p className={errorStyles}>{errors.billingEmail.message}</p>}
        </div>

        <div>
          <label htmlFor="billingPhone" className={labelStyles}>
            Billing Phone
          </label>
          <Controller
            name="billingPhone"
            control={control}
            render={({ field }) => (
              <input
                id="billingPhone"
                type="tel"
                value={field.value || ''}
                onChange={(e) => field.onChange(formatPhoneNumber(e.target.value))}
                onBlur={field.onBlur}
                className={inputStyles}
                placeholder="(555) 123-4567"
                maxLength={14}
              />
            )}
          />
          {errors.billingPhone && <p className={errorStyles}>{errors.billingPhone.message}</p>}
        </div>

        <div>
          <label htmlFor="billingAddress" className={labelStyles}>
            Billing Address <span className="text-red-500">*</span>
          </label>
          <input
            id="billingAddress"
            type="text"
            {...register('billingAddress')}
            className={inputStyles}
          />
          {errors.billingAddress && <p className={errorStyles}>{errors.billingAddress.message}</p>}
        </div>

        <div>
          <label htmlFor="billingCity" className={labelStyles}>
            City <span className="text-red-500">*</span>
          </label>
          <input
            id="billingCity"
            type="text"
            {...register('billingCity')}
            className={inputStyles}
          />
          {errors.billingCity && <p className={errorStyles}>{errors.billingCity.message}</p>}
        </div>

        <div>
          <label htmlFor="billingProvince" className={labelStyles}>
            Province <span className="text-red-500">*</span>
          </label>
          <select
            id="billingProvince"
            {...register('billingProvince')}
            className={inputStyles}
          >
            <option value="">Select province</option>
            {PROVINCES.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          {errors.billingProvince && <p className={errorStyles}>{errors.billingProvince.message}</p>}
        </div>

        <div>
          <label htmlFor="billingPostalCode" className={labelStyles}>
            Postal Code <span className="text-red-500">*</span>
          </label>
          <Controller
            name="billingPostalCode"
            control={control}
            render={({ field }) => (
              <input
                id="billingPostalCode"
                type="text"
                value={field.value || ''}
                onChange={(e) => field.onChange(formatPostalCode(e.target.value))}
                onBlur={field.onBlur}
                className={inputStyles}
                placeholder="A1A 1A1"
                maxLength={7}
              />
            )}
          />
          {errors.billingPostalCode && <p className={errorStyles}>{errors.billingPostalCode.message}</p>}
        </div>
      </div>
    </div>
  )
}
