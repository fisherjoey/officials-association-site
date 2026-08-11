'use client'

import Link from 'next/link'
import { IconCheck, IconMail, IconCalendar, IconFileText } from '@tabler/icons-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { ORG_SHORT_NAME } from '@/lib/siteConfig'

export default function OSASuccessPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-16">
      <div className="container mx-auto px-4">
        <div className="max-w-2xl mx-auto">
          <Card>
            {/* Success Icon */}
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <IconCheck size={40} className="text-green-600" />
              </div>
              <h1 className="text-3xl font-bold text-brand-secondary mb-4">
                Request Submitted Successfully!
              </h1>
              <p className="text-gray-600">
                Thank you for submitting your Officiating Services Agreement request.
                We&apos;ve received your information and will be in touch shortly.
              </p>
            </div>

            {/* What Happens Next */}
            <div className="border-t border-gray-200 pt-8 mb-8">
              <h2 className="text-xl font-bold text-brand-secondary mb-6">What Happens Next?</h2>
              <div className="space-y-4">
                <div className="flex items-start">
                  <div className="w-10 h-10 bg-brand-primary/10 rounded-full flex items-center justify-center flex-shrink-0 mr-4">
                    <IconMail size={20} className="text-brand-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800">Confirmation Email</h3>
                    <p className="text-gray-600 text-sm">
                      You&apos;ll receive a confirmation email with a summary of your request,
                      along with our fee schedule and invoice policy.
                    </p>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className="w-10 h-10 bg-brand-primary/10 rounded-full flex items-center justify-center flex-shrink-0 mr-4">
                    <IconCalendar size={20} className="text-brand-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800">Scheduling Contact</h3>
                    <p className="text-gray-600 text-sm">
                      Our scheduling team will contact you within 2-3 business days to
                      collect your game schedule and finalize details.
                    </p>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className="w-10 h-10 bg-brand-primary/10 rounded-full flex items-center justify-center flex-shrink-0 mr-4">
                    <IconFileText size={20} className="text-brand-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800">Provide Your Schedule</h3>
                    <p className="text-gray-600 text-sm">
                      For leagues and tournaments, please send your game schedule in
                      spreadsheet format through our{' '}
                      <a href="/contact?category=scheduling" className="text-brand-primary hover:text-brand-secondary">
                        contact form
                      </a>{' '}
                      (select &quot;Officiating Services / Booking&quot;)
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Important Reminders */}
            <div className="bg-blue-50 rounded-lg p-6 mb-8">
              <h3 className="font-bold text-brand-secondary mb-3">Important Reminders</h3>
              <ul className="space-y-2 text-sm text-gray-700">
                <li>
                  <strong>Discipline Policy:</strong> If using your own discipline policy,
                  please provide a copy to the {ORG_SHORT_NAME} Vice President before your event.
                </li>
                <li>
                  <strong>Payment:</strong> Payments can be made by cheque or e-transfer.{' '}
                  <a href="/contact?category=billing" className="text-brand-primary hover:text-brand-secondary">
                    Contact our billing team
                  </a>{' '}
                  for details.
                </li>
                <li>
                  <strong>Questions:</strong>{' '}
                  <a href="/contact?category=scheduling" className="text-brand-primary hover:text-brand-secondary">
                    Contact our scheduling team
                  </a>{' '}
                  for any inquiries.
                </li>
              </ul>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button href="/" variant="secondary">
                Return Home
              </Button>
              <Button href="/documents/Fee-Schedule.pdf" variant="primary">
                View Fee Schedule
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
