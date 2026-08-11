'use client'

import { useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { ORG_SHORT_NAME } from '@/lib/siteConfig'

const NAME_REGEX = /^[A-Za-z][A-Za-z\s\-']*[A-Za-z]$/

interface FormErrors {
  email?: string
  firstName?: string
  lastName?: string
}

function validateForm(form: HTMLFormElement): FormErrors {
  const errors: FormErrors = {}
  const email = (form.elements.namedItem('email') as HTMLInputElement).value.trim()
  const firstName = (form.elements.namedItem('firstName') as HTMLInputElement).value.trim()
  const lastName = (form.elements.namedItem('lastName') as HTMLInputElement).value.trim()

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Please enter a valid email address'
  }
  if (firstName.length < 2) {
    errors.firstName = 'First name must be at least 2 characters'
  } else if (!NAME_REGEX.test(firstName)) {
    errors.firstName = 'Please enter a valid name (letters only)'
  }
  if (lastName.length < 2) {
    errors.lastName = 'Last name must be at least 2 characters'
  } else if (!NAME_REGEX.test(lastName)) {
    errors.lastName = 'Please enter a valid name (letters only)'
  }
  return errors
}

export default function RefereeApplicationForm() {
  const [submitted, setSubmitted] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})

  if (submitted) {
    return (
      <Card>
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-brand-secondary mb-2">Application Submitted!</h3>
          <p className="text-gray-600 mb-4">
            Thank you for your interest in becoming an official with {ORG_SHORT_NAME}. We&apos;ll review your application and contact you soon with next steps.
          </p>
          <p className="text-sm text-gray-500">
            Check your email for confirmation and further instructions.
          </p>
        </div>
      </Card>
    )
  }
  
  return (
    <Card>
      <form 
        name="referee-application"
        method="POST"
        data-netlify="true"
        netlify-honeypot="bot-field"
        action="/become-a-referee?success=true"
        onSubmit={(e) => {
          e.preventDefault()
          const form = e.target as HTMLFormElement
          const validationErrors = validateForm(form)
          setErrors(validationErrors)
          if (Object.keys(validationErrors).length > 0) return

          fetch('/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(new FormData(form) as any).toString()
          })
          .then(() => setSubmitted(true))
          .catch(() => alert('Error submitting form. Please try again.'))
        }}
      >
        <input type="hidden" name="form-name" value="referee-application" />
        <input type="hidden" name="bot-field" />
        
        <h3 className="text-xl font-bold text-brand-secondary mb-6">Contact Information</h3>
        
        <div className="mb-4">
          <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
            Email *
          </label>
          <input
            type="email"
            id="email"
            name="email"
            required
            maxLength={254}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:border-brand-primary ${errors.email ? 'border-red-500' : 'border-gray-300'}`}
          />
          {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
        </div>
        
        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div>
            <label htmlFor="lastName" className="block text-sm font-semibold text-gray-700 mb-2">
              Last Name *
            </label>
            <input
              type="text"
              id="lastName"
              name="lastName"
              required
              minLength={2}
              maxLength={50}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:border-brand-primary ${errors.lastName ? 'border-red-500' : 'border-gray-300'}`}
            />
            {errors.lastName && <p className="mt-1 text-sm text-red-600">{errors.lastName}</p>}
          </div>
          <div>
            <label htmlFor="firstName" className="block text-sm font-semibold text-gray-700 mb-2">
              First Name *
            </label>
            <input
              type="text"
              id="firstName"
              name="firstName"
              required
              minLength={2}
              maxLength={50}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:border-brand-primary ${errors.firstName ? 'border-red-500' : 'border-gray-300'}`}
            />
            {errors.firstName && <p className="mt-1 text-sm text-red-600">{errors.firstName}</p>}
          </div>
        </div>
        
        <h3 className="text-xl font-bold text-brand-secondary mb-6 mt-8">Eligibility Questions</h3>
        
        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Are you over the age of 17 at the time of this submission? *
          </label>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="radio"
                name="overSeventeen"
                value="yes"
                required
                className="mr-2"
              />
              <span>Yes</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="overSeventeen"
                value="no"
                required
                className="mr-2"
              />
              <span>No</span>
            </label>
          </div>
        </div>
        
        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Do you have basketball officiating experience? *
          </label>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="radio"
                name="hasExperience"
                value="yes"
                required
                className="mr-2"
              />
              <span>Yes</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="hasExperience"
                value="no"
                required
                className="mr-2"
              />
              <span>No</span>
            </label>
          </div>
        </div>
        
        <div className="mb-6">
          <label htmlFor="howHeard" className="block text-sm font-semibold text-gray-700 mb-2">
            How did you hear about us? *
          </label>
          <select
            id="howHeard"
            name="howHeard"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-brand-primary"
          >
            <option value="">Select an option</option>
            <option value="websearch">Web Search</option>
            <option value="friend">Friend</option>
            <option value="member">A current member</option>
            <option value="league">A local league or club</option>
            <option value="community">A community sport program</option>
            <option value="other">Other</option>
          </select>
        </div>
        
        <div className="bg-blue-50 rounded-lg p-4 mb-6">
          <p className="text-sm text-gray-700">
            <strong>Next Steps:</strong> After submitting your application, we will review it and contact you with information about upcoming training sessions and orientation.
          </p>
        </div>
        
        <Button type="submit" size="lg" className="w-full">
          Submit Application
        </Button>
      </form>
    </Card>
  )
}