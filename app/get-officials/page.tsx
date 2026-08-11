'use client'

import Hero from '@/components/content/Hero'
import ElevateCTA from '@/components/ui/ElevateCTA'
import OSARequestFormWizard from '@/components/forms/OSARequestFormWizard'
import Card from '@/components/ui/Card'
import { IconBallBasketball, IconCalendar, IconTrophy, IconCheck } from '@tabler/icons-react'
import { ORG_NAME, ORG_SHORT_NAME, ORG_SPORT, ORG_LOCATION } from '@/lib/siteConfig'

export default function GetOfficialsPage() {

  return (
    <>
      <Hero
        title={`${ORG_SHORT_NAME} Officiating Services`}
        subtitle={`Request certified ${ORG_SPORT} officials for your games, leagues, and tournaments`}
        primaryAction={{ text: 'Request Officials', href: '#request-form' }}
      />

      {/* About Section */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <Card>
              <h2 className="text-2xl font-bold text-brand-secondary mb-6">
                {ORG_SHORT_NAME} Officiating Services Agreement
              </h2>
              <div className="space-y-4 text-gray-700">
                <p>
                  {ORG_NAME} is the officiating body serving {ORG_LOCATION}. Our members are
                  registered with the provincial and national bodies that sanction {ORG_SPORT} in this region,
                  and we work with those bodies to keep local officiating aligned with the wider game.
                </p>
                <p>
                  Every {ORG_SHORT_NAME} member is trained, assessed and certified against the national standard
                  for {ORG_SPORT} officials. Booking through us means the officials on your court hold that
                  certification and are covered by the association&apos;s insurance and performance programs.
                </p>
                <div className="bg-blue-50 rounded-lg p-6 mt-6">
                  <h3 className="font-bold text-brand-secondary mb-3">Why Choose {ORG_SHORT_NAME} Officials?</h3>
                  <ul className="space-y-2">
                    <li className="flex items-start">
                      <IconCheck size={20} className="text-brand-primary mr-2 flex-shrink-0" />
                      <span>Nationally certified and trained officials</span>
                    </li>
                    <li className="flex items-start">
                      <IconCheck size={20} className="text-brand-primary mr-2 flex-shrink-0" />
                      <span>Comprehensive insurance coverage</span>
                    </li>
                    <li className="flex items-start">
                      <IconCheck size={20} className="text-brand-primary mr-2 flex-shrink-0" />
                      <span>Professional game management</span>
                    </li>
                    <li className="flex items-start">
                      <IconCheck size={20} className="text-brand-primary mr-2 flex-shrink-0" />
                      <span>Consistent rule interpretation and application</span>
                    </li>
                    <li className="flex items-start">
                      <IconCheck size={20} className="text-brand-primary mr-2 flex-shrink-0" />
                      <span>Ongoing performance evaluation and development</span>
                    </li>
                  </ul>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Service Types */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-brand-secondary mb-12">
            Our Services
          </h2>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <Card>
              <div className="text-center">
                <div className="flex justify-center mb-4">
                  <IconBallBasketball size={48} className="text-brand-primary" />
                </div>
                <h3 className="text-xl font-bold text-brand-secondary mb-3">Exhibition Games</h3>
                <p className="text-gray-700">
                  Single games or small sets of games for tournaments, showcases, or special events
                </p>
              </div>
            </Card>
            <Card>
              <div className="text-center">
                <div className="flex justify-center mb-4">
                  <IconCalendar size={48} className="text-brand-primary" />
                </div>
                <h3 className="text-xl font-bold text-brand-secondary mb-3">League Coverage</h3>
                <p className="text-gray-700">
                  Complete season coverage for your basketball league with consistent officiating
                </p>
              </div>
            </Card>
            <Card>
              <div className="text-center">
                <div className="flex justify-center mb-4">
                  <IconTrophy size={48} className="text-brand-primary" />
                </div>
                <h3 className="text-xl font-bold text-brand-secondary mb-3">Tournament Services</h3>
                <p className="text-gray-700">
                  Full officiating services for tournaments of any size with experienced crews
                </p>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <ElevateCTA primaryButtonHref="#request-form" />

      {/* Request Form */}
      <section className="py-16 bg-gray-50" id="request-form">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-brand-secondary mb-4">
            Request Officiating Services
          </h2>
          <p className="text-center text-gray-600 mb-12">
            Complete this form to schedule {ORG_SHORT_NAME} officials for your {ORG_SPORT} event
          </p>

          <div className="max-w-3xl mx-auto">
            <OSARequestFormWizard />

            <div className="mt-8 text-center">
              <p className="text-gray-600">
                Questions about our services?{' '}
                <a href="/contact?category=scheduling" className="text-brand-primary hover:text-brand-secondary">
                  Contact our scheduling team
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}