import Hero from '@/components/content/Hero'
import ElevateCTA from '@/components/ui/ElevateCTA'
import HomeContent from './home-content'
import { ORG_NAME, ORG_TAGLINE } from '@/lib/siteConfig'

export default function HomePage() {
  return (
    <>
      <Hero
        title={ORG_NAME}
        subtitle={ORG_TAGLINE}
        primaryAction={{ text: 'Become a Referee', href: '/become-a-referee' }}
        secondaryAction={{ text: 'View Training', href: '/training' }}
        showLogo={true}
      />

      <ElevateCTA />

      <HomeContent />
    </>
  )
}