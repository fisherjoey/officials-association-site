'use client'

import React from 'react'

// Reusable styles
const inputStyles = "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent transition-colors"
const labelStyles = "block text-sm font-semibold text-gray-700 mb-1"
const errorStyles = "text-red-500 text-sm mt-1"

interface Step1OrganizationProps {
  register: any
  errors: any
}

export default function Step1Organization({ register, errors }: Step1OrganizationProps) {
  return (
    <div>
      <h3 className="text-xl font-bold text-brand-secondary mb-4">Organization Information</h3>
      <div>
        <label htmlFor="organizationName" className={labelStyles}>
          Organization Name <span className="text-red-500">*</span>
        </label>
        <input
          id="organizationName"
          type="text"
          {...register('organizationName')}
          className={inputStyles}
          placeholder="e.g., City Youth League"
        />
        {errors.organizationName && <p className={errorStyles}>{errors.organizationName.message}</p>}
      </div>
    </div>
  )
}
