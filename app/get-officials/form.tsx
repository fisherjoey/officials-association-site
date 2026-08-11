'use client'

import { useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { ORG_SHORT_NAME } from '@/lib/siteConfig'

interface FormErrors {
  billingEmail?: string
  organizationName?: string
  billingContactName?: string
  billingAddress?: string
  eventDates?: string
  numberOfGames?: string
  numberOfCourts?: string
}

function validateOfficialForm(form: HTMLFormElement): FormErrors {
  const errors: FormErrors = {}
  const get = (name: string) => (form.elements.namedItem(name) as HTMLInputElement)?.value?.trim() ?? ''

  const email = get('billingEmail')
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.billingEmail = 'Please enter a valid email address'
  }

  if (get('organizationName').length < 2) {
    errors.organizationName = 'Organization name must be at least 2 characters'
  }
  if (get('billingContactName').length < 2) {
    errors.billingContactName = 'Billing contact name must be at least 2 characters'
  }
  if (get('billingAddress').length < 5) {
    errors.billingAddress = 'Please enter a valid billing address'
  }

  const startDate = get('eventStartDate')
  const endDate = get('eventEndDate')
  if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
    errors.eventDates = 'End date must be on or after start date'
  }

  const games = parseInt(get('numberOfGames'))
  if (isNaN(games) || games < 1 || games > 500) {
    errors.numberOfGames = 'Number of games must be between 1 and 500'
  }
  const courts = parseInt(get('numberOfCourts'))
  if (isNaN(courts) || courts < 1 || courts > 50) {
    errors.numberOfCourts = 'Number of courts must be between 1 and 50'
  }

  return errors
}

export default function OfficialsRequestForm() {
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
          <h3 className="text-2xl font-bold text-brand-secondary mb-2">Request Submitted!</h3>
          <p className="text-gray-600 mb-4">
            Thank you for requesting {ORG_SHORT_NAME} officiating services. We&apos;ll review your request and contact you within 24-48 hours.
          </p>
          <p className="text-sm text-gray-500">
            A confirmation has been sent to your email address.
          </p>
        </div>
      </Card>
    )
  }
  
  return (
    <Card>
      <form 
        name="officials-request"
        method="POST"
        data-netlify="true"
        netlify-honeypot="bot-field"
        action="/get-officials?success=true"
        onSubmit={(e) => {
          e.preventDefault()
          const form = e.target as HTMLFormElement
          const validationErrors = validateOfficialForm(form)
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
        <input type="hidden" name="form-name" value="officials-request" />
        <input type="hidden" name="bot-field" />
        
        {/* Organization Information */}
        <div className="mb-8">
          <h3 className="text-xl font-bold text-brand-secondary mb-4">Organization Information</h3>
          <div className="mb-4">
            <label htmlFor="organizationName" className="block text-sm font-semibold text-gray-700 mb-2">
              Organization Name *
            </label>
            <input
              type="text"
              id="organizationName"
              name="organizationName"
              required
              minLength={2}
              maxLength={100}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:border-brand-primary ${errors.organizationName ? 'border-red-500' : 'border-gray-300'}`}
            />
            {errors.organizationName && <p className="mt-1 text-sm text-red-600">{errors.organizationName}</p>}
          </div>
        </div>
        
        {/* Billing Information */}
        <div className="mb-8">
          <h3 className="text-xl font-bold text-brand-secondary mb-4">Billing Information</h3>
          <p className="text-sm text-gray-600 mb-4">
            To secure {ORG_SHORT_NAME} services, we require accurate billing contact information. 
            Payment is due within 30 days of invoice date. For events starting after April 1st, 
            payment is required in advance.
          </p>
          
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="billingContactName" className="block text-sm font-semibold text-gray-700 mb-2">
                Billing Contact Name *
              </label>
              <input
                type="text"
                id="billingContactName"
                name="billingContactName"
                required
                minLength={2}
                maxLength={100}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:border-brand-primary ${errors.billingContactName ? 'border-red-500' : 'border-gray-300'}`}
              />
              {errors.billingContactName && <p className="mt-1 text-sm text-red-600">{errors.billingContactName}</p>}
            </div>
            <div>
              <label htmlFor="billingEmail" className="block text-sm font-semibold text-gray-700 mb-2">
                Billing Email *
              </label>
              <input
                type="email"
                id="billingEmail"
                name="billingEmail"
                required
                maxLength={254}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:border-brand-primary ${errors.billingEmail ? 'border-red-500' : 'border-gray-300'}`}
              />
              {errors.billingEmail && <p className="mt-1 text-sm text-red-600">{errors.billingEmail}</p>}
            </div>
          </div>
          
          <div className="mb-4">
            <label htmlFor="billingAddress" className="block text-sm font-semibold text-gray-700 mb-2">
              Billing Address *
            </label>
            <textarea
              id="billingAddress"
              name="billingAddress"
              rows={3}
              required
              minLength={5}
              maxLength={500}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:border-brand-primary ${errors.billingAddress ? 'border-red-500' : 'border-gray-300'}`}
            />
            {errors.billingAddress && <p className="mt-1 text-sm text-red-600">{errors.billingAddress}</p>}
          </div>
        </div>
        
        {/* Event Information */}
        <div className="mb-8">
          <h3 className="text-xl font-bold text-brand-secondary mb-4">Event Information</h3>
          
          <div className="mb-4">
            <label htmlFor="eventType" className="block text-sm font-semibold text-gray-700 mb-2">
              Event Type *
            </label>
            <select
              id="eventType"
              name="eventType"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-brand-primary"
            >
              <option value="">Select event type</option>
              <option value="tournament">Tournament</option>
              <option value="exhibition">Exhibition Game(s)</option>
              <option value="league">League Season</option>
              <option value="camp">Camp/Clinic</option>
              <option value="other">Other</option>
            </select>
          </div>
          
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="eventStartDate" className="block text-sm font-semibold text-gray-700 mb-2">
                Event Start Date *
              </label>
              <input
                type="date"
                id="eventStartDate"
                name="eventStartDate"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-brand-primary"
              />
            </div>
            <div>
              <label htmlFor="eventEndDate" className="block text-sm font-semibold text-gray-700 mb-2">
                Event End Date *
              </label>
              <input
                type="date"
                id="eventEndDate"
                name="eventEndDate"
                required
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:border-brand-primary ${errors.eventDates ? 'border-red-500' : 'border-gray-300'}`}
              />
            </div>
          </div>
          {errors.eventDates && <p className="-mt-2 mb-4 text-sm text-red-600">{errors.eventDates}</p>}
          
          <div className="mb-4">
            <label htmlFor="venueName" className="block text-sm font-semibold text-gray-700 mb-2">
              Venue Name *
            </label>
            <input
              type="text"
              id="venueName"
              name="venueName"
              required
              minLength={2}
              maxLength={200}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-brand-primary"
            />
          </div>
          
          <div className="mb-4">
            <label htmlFor="venueAddress" className="block text-sm font-semibold text-gray-700 mb-2">
              Venue Address *
            </label>
            <input
              type="text"
              id="venueAddress"
              name="venueAddress"
              required
              minLength={5}
              maxLength={200}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-brand-primary"
            />
          </div>
          
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="numberOfGames" className="block text-sm font-semibold text-gray-700 mb-2">
                Estimated Number of Games *
              </label>
              <input
                type="number"
                id="numberOfGames"
                name="numberOfGames"
                min="1"
                max="500"
                required
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:border-brand-primary ${errors.numberOfGames ? 'border-red-500' : 'border-gray-300'}`}
              />
              {errors.numberOfGames && <p className="mt-1 text-sm text-red-600">{errors.numberOfGames}</p>}
            </div>
            <div>
              <label htmlFor="numberOfCourts" className="block text-sm font-semibold text-gray-700 mb-2">
                Number of Courts *
              </label>
              <input
                type="number"
                id="numberOfCourts"
                name="numberOfCourts"
                min="1"
                max="50"
                required
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:border-brand-primary ${errors.numberOfCourts ? 'border-red-500' : 'border-gray-300'}`}
              />
              {errors.numberOfCourts && <p className="mt-1 text-sm text-red-600">{errors.numberOfCourts}</p>}
            </div>
          </div>
          
          <div className="mb-4">
            <label htmlFor="ageGroups" className="block text-sm font-semibold text-gray-700 mb-2">
              Age Groups/Divisions *
            </label>
            <input
              type="text"
              id="ageGroups"
              name="ageGroups"
              placeholder="e.g., U12, U14, U16, High School"
              required
              maxLength={200}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-brand-primary"
            />
          </div>
          
          <div className="mb-4">
            <label htmlFor="additionalInfo" className="block text-sm font-semibold text-gray-700 mb-2">
              Additional Information
            </label>
            <textarea
              id="additionalInfo"
              name="additionalInfo"
              rows={4}
              maxLength={2000}
              placeholder="Please provide any additional details about your event or specific requirements"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-brand-primary"
            />
          </div>
        </div>
        
        <div className="bg-blue-50 rounded-lg p-4 mb-6">
          <p className="text-sm text-gray-700">
            <strong>Important:</strong> Our assignor will contact you within 24-48 hours to confirm availability 
            and discuss specific requirements for your event.
          </p>
        </div>
        
        <Button type="submit" size="lg" className="w-full">
          Submit Request
        </Button>
      </form>
    </Card>
  )
}