import { Suspense } from 'react'
import Hero from '@/components/content/Hero'
import Card from '@/components/ui/Card'
import ContactForm from '@/components/forms/ContactForm'
import { IconMail, IconClock, IconMapPin } from '@tabler/icons-react'
import { ORG_NAME, ORG_SHORT_NAME, ORG_LOCATION } from '@/lib/siteConfig'

export const metadata = {
  title: `Contact Us | ${ORG_SHORT_NAME}`,
  description: `Get in touch with ${ORG_NAME}. We're here to help with officiating services, membership inquiries, and more.`,
}

export default function ContactPage() {
  const contactInfo = [
    {
      icon: IconMail,
      title: 'Get In Touch',
      description: 'Use the form below and we\'ll route your message to the right team.',
    },
    {
      icon: IconClock,
      title: 'Response Time',
      description: 'We typically respond within 1-2 business days.',
    },
    {
      icon: IconMapPin,
      title: 'Location',
      description: ORG_LOCATION,
    },
  ]

  return (
    <>
      <Hero
        title="Contact Us"
        subtitle="Have a question or need assistance? We're here to help."
      />

      {/* Contact Info Cards */}
      <section className="py-12 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {contactInfo.map((info, index) => (
              <Card key={index}>
                <div className="text-center">
                  <div className="flex justify-center mb-3">
                    <info.icon size={36} className="text-brand-primary" />
                  </div>
                  <h3 className="text-lg font-bold text-brand-secondary mb-2">{info.title}</h3>
                  <p className="text-gray-600 text-sm">{info.description}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Form Section */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-brand-secondary mb-4">Send Us a Message</h2>
              <p className="text-gray-600">
                Select a category below and we&apos;ll make sure your message reaches the right team.
              </p>
            </div>
            <Card>
              <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading form...</div>}>
                <ContactForm />
              </Suspense>
            </Card>
          </div>
        </div>
      </section>
    </>
  )
}
