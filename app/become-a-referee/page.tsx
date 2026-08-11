'use client'

import Hero from '@/components/content/Hero'
import Card from '@/components/ui/Card'
import { IconCheck } from '@tabler/icons-react'
import Link from 'next/link'
import { ORG_NAME, ORG_SHORT_NAME, ORG_CITY, ORG_SPORT, EXTERNAL_LINKS } from '@/lib/siteConfig'

export default function BecomeARefereePage() {
  const requirements = [
    'Sign the Membership Agreement',
    'Pay the annual dues',
    'Attend a clinic for your level of experience',
    'Purchase the correct referee jersey',
    'Write the rules exam on an annual basis'
  ]

  const timeline = [
    { month: 'September', activity: 'New Officials Course - Online classroom sessions begin' },
    { month: 'October', activity: 'On-court training sessions and practical application' },
    { month: 'October-June', activity: 'Active officiating season - gain experience with game assignments' },
    { month: 'Ongoing', activity: 'Continuous training and development opportunities' },
  ]

  const benefits = [
    { title: 'Competitive Pay', description: 'Earn $40-$60 per game depending on level, division, and location. Top officials can earn $10,000+ per season.' },
    { title: 'Flexible Schedule', description: 'Choose your availability. Work as many or as few games as your schedule allows.' },
    { title: 'Stay Active', description: 'Great way to stay physically fit while being involved in the sport you love.' },
    { title: 'Career Advancement', description: 'Clear pathway from youth games to high school, college, and potentially professional levels.' },
    { title: 'Community Impact', description: `Make a positive difference in young athletes' lives and help grow ${ORG_SPORT} in ${ORG_CITY}.` },
    { title: 'Training & Support', description: 'Ongoing education, mentorship programs, and support from experienced officials.' },
  ]

  return (
    <>
      <Hero
        title={`Join ${ORG_NAME}`}
        subtitle={`Thank you for your interest in becoming a certified ${ORG_SPORT} official`}
        primaryAction={{ text: 'Apply Now', href: '#application' }}
        secondaryAction={{ text: 'Learn More', href: '#requirements' }}
      />

      {/* About Section */}
      <section className="py-16 bg-gray-50" id="requirements">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <Card>
              <h2 className="text-2xl font-bold text-brand-secondary mb-6">
                Becoming an Active Official
              </h2>
              <p className="text-gray-700 mb-6">
                In order to become an active official with {ORG_SHORT_NAME}, you will need to do the following:
              </p>
              <div className="bg-blue-50 rounded-lg p-6 mb-6">
                <ul className="space-y-3">
                  {requirements.map((req, index) => (
                    <li key={index} className="text-gray-800 font-medium flex items-start">
                      <IconCheck size={20} className="text-brand-primary mr-2 flex-shrink-0 mt-0.5" />
                      <span>{req}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-4">
                <p className="text-gray-700">
                  <strong>The {ORG_SHORT_NAME} season begins in September</strong> of each year, with a New Officials course that runs in an online classroom in September and on-court sessions in October. These clinics are vital to anyone new to officiating as they cover the rules and mechanics of officiating and what expectations the association will have of you as a member.
                </p>
                <p className="text-gray-700">
                  This course is geared towards those who have never officiated and is an excellent refresher for those getting back into officiating. The course work is both online through Google Classroom and live on-court sessions.
                </p>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Timeline Section */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-brand-secondary mb-12">
            Training Timeline
          </h2>
          <div className="max-w-3xl mx-auto">
            <div className="space-y-4">
              {timeline.map((item, index) => (
                <Card key={index}>
                  <div className="flex items-start">
                    <div className="w-32 flex-shrink-0">
                      <span className="text-brand-primary font-bold">{item.month}</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-gray-700">{item.activity}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-16 bg-brand-secondary text-white">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">
            Why Become an Official with {ORG_SHORT_NAME}?
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {benefits.map((benefit, index) => (
              <div key={index} className="bg-white/10 backdrop-blur-sm rounded-lg p-6 text-center">
                <h3 className="text-xl font-bold text-brand-primary mb-3">{benefit.title}</h3>
                <p className="text-gray-100">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Blue Whistle Program Section */}
      <section className="py-16 bg-blue-50">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-brand-secondary mb-4">
              New to Officiating?
            </h2>
            <p className="text-gray-700 mb-6">
              The Blue Whistle Program is a provincewide initiative that encourages respectful treatment of new {ORG_SPORT} officials. When you see the blue whistle, you know the official is new and learning.
            </p>
            <Link
              href="/new-officials"
              className="inline-block bg-brand-primary hover:bg-brand-secondary text-white font-bold py-3 px-8 rounded-lg transition-colors"
            >
              Learn About the Blue Whistle Program
            </Link>
          </div>
        </div>
      </section>

      {/* Application Form */}
      <section className="py-16 bg-gray-50" id="application">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-brand-secondary mb-4">
            Official Application Form
          </h2>
          <p className="text-center text-gray-600 mb-12">
            Complete this application to begin your journey as an official with {ORG_SHORT_NAME}
          </p>
          <div className="max-w-2xl mx-auto">
            <Card>
              {/* Externally hosted application form, if one is configured in lib/siteConfig.ts */}
              {EXTERNAL_LINKS.applicationForm ? (
                <iframe
                  src={EXTERNAL_LINKS.applicationForm}
                  title="Official application form"
                  width="100%"
                  height="1400"
                  frameBorder="0"
                  marginHeight={0}
                  marginWidth={0}
                  style={{ border: 'none', maxWidth: '100%', maxHeight: '100vh' }}
                  allowFullScreen
                >
                  Loading…
                </iframe>
              ) : (
                <div className="py-12 text-center">
                  <p className="text-gray-700 mb-2">No application form has been configured yet.</p>
                  <p className="text-sm text-gray-500">
                    Set <code>NEXT_PUBLIC_LINK_APPLICATION_FORM</code> in <code>lib/siteConfig.ts</code> to embed
                    yours, or{' '}
                    <a href="/contact?category=membership" className="text-brand-primary hover:text-brand-secondary">
                      get in touch
                    </a>{' '}
                    in the meantime.
                  </p>
                </div>
              )}
            </Card>

            <div className="mt-8 text-center">
              <p className="text-gray-600">
                Again, thank you for your interest in joining our organization. We look forward to having you as a member.
              </p>
              <p className="text-sm text-gray-500 mt-4">
                Questions? <a href="/contact?category=general" className="text-brand-primary hover:text-brand-secondary">Contact us</a>
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}