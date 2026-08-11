import Hero from '@/components/content/Hero'
import Card from '@/components/ui/Card'
import CTASection from '@/components/ui/CTASection'
import AboutContent from './about-content'
import ExecutiveTeamSection from './executive-team-section'
import { IconStar, IconScale, IconTrendingUp, IconUsers, IconBallBasketball, IconTrophy, IconCheck } from '@tabler/icons-react'
import { ORG_NAME, ORG_SHORT_NAME, ORG_CITY, ORG_REGION, ORG_SPORT, ORG_FOUNDED_YEAR } from '@/lib/siteConfig'

export default function AboutPage() {

  const values = [
    {
      title: 'Excellence',
      description: 'Striving for the highest standards in officiating through continuous improvement and professional development.',
      icon: IconStar
    },
    {
      title: 'Integrity',
      description: 'Maintaining fair and impartial judgment in every call, building trust with players, coaches, and fans.',
      icon: IconScale
    },
    {
      title: 'Development',
      description: 'Fostering continuous learning and growth for officials at all levels of experience.',
      icon: IconTrendingUp
    },
    {
      title: 'Community',
      description: `Supporting ${ORG_SPORT} growth in ${ORG_CITY} and building strong relationships within the ${ORG_SPORT} community.`,
      icon: IconUsers
    },
    {
      title: 'Respect',
      description: 'Showing respect for the game, players, coaches, and fellow officials in all interactions.',
      icon: IconBallBasketball
    },
    {
      title: 'Leadership',
      description: `Setting the standard for ${ORG_SPORT} officiating excellence in ${ORG_REGION} and beyond.`,
      icon: IconTrophy
    }
  ]

  return (
    <>
      <Hero
        title={`About ${ORG_SHORT_NAME}`}
        subtitle={`Serving ${ORG_CITY} since ${ORG_FOUNDED_YEAR}`}
      />

      {/* Mission Section */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-brand-secondary mb-6">Our Mission</h2>
            <p className="text-xl text-gray-700 leading-relaxed">
              To develop and maintain a strong community of {ORG_SPORT} officials who demonstrate
              excellence, integrity, and professionalism in every game they officiate. {ORG_NAME} is
              committed to providing the highest quality officiating services to {ORG_SPORT}
              programs throughout {ORG_CITY} and surrounding areas.
            </p>
          </div>
        </div>
      </section>

      {/* CMS Content Section - Fetched client-side */}
      <AboutContent />

      {/* Values Section */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-brand-secondary mb-12 text-center">Our Values</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {values.map((value, index) => (
              <Card key={index}>
                <div className="text-center">
                  <div className="flex justify-center mb-4">
                    <value.icon size={48} className="text-brand-primary" />
                  </div>
                  <h3 className="text-xl font-bold text-brand-secondary mb-3">{value.title}</h3>
                  <p className="text-gray-700">{value.description}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* What We Do Section */}
      <section className="py-16 bg-brand-secondary text-white">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold mb-12 text-center">What We Do</h2>
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            <div>
              <h3 className="text-xl font-bold mb-4 text-brand-primary">Training & Development</h3>
              <ul className="space-y-2">
                <li className="flex items-start">
                  <IconCheck size={20} className="text-brand-primary mr-2 flex-shrink-0" />
                  Comprehensive training programs for new officials
                </li>
                <li className="flex items-start">
                  <IconCheck size={20} className="text-brand-primary mr-2 flex-shrink-0" />
                  Ongoing professional development workshops
                </li>
                <li className="flex items-start">
                  <IconCheck size={20} className="text-brand-primary mr-2 flex-shrink-0" />
                  <span>Mentorship programs pairing experienced officials with newcomers, including the <a href="/new-officials" className="text-brand-primary hover:underline">Blue Whistle Program</a></span>
                </li>
                <li className="flex items-start">
                  <IconCheck size={20} className="text-brand-primary mr-2 flex-shrink-0" />
                  Annual rules clinics and certification courses
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-xl font-bold mb-4 text-brand-primary">Services & Support</h3>
              <ul className="space-y-2">
                <li className="flex items-start">
                  <IconCheck size={20} className="text-brand-primary mr-2 flex-shrink-0" />
                  Game assignments for all levels of {ORG_SPORT}
                </li>
                <li className="flex items-start">
                  <IconCheck size={20} className="text-brand-primary mr-2 flex-shrink-0" />
                  Support for {ORG_SPORT} programs across {ORG_CITY}
                </li>
                <li className="flex items-start">
                  <IconCheck size={20} className="text-brand-primary mr-2 flex-shrink-0" />
                  Maintain officiating standards and best practices
                </li>
                <li className="flex items-start">
                  <IconCheck size={20} className="text-brand-primary mr-2 flex-shrink-0" />
                  Liaison with our provincial and national governing bodies
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Executive Team Section - fetched from database */}
      <ExecutiveTeamSection />

      {/* CTA Section */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <CTASection />
        </div>
      </section>
    </>
  )
}