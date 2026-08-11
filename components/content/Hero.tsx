import Button from '../ui/Button'
import Image from 'next/image'
import { ORG_LOGO_URL, ORG_LOGO_ALT } from '@/lib/siteConfig'

interface HeroProps {
  title: string
  subtitle?: string
  primaryAction?: {
    text: string
    href: string
  }
  secondaryAction?: {
    text: string
    href: string
  }
  backgroundImage?: string
  showLogo?: boolean
  gradientClass?: string
  buttonClassName?: string
}

export default function Hero({
  title,
  subtitle,
  primaryAction,
  secondaryAction,
  backgroundImage,
  showLogo = false,
  gradientClass = 'bg-gradient-to-br from-brand-secondary to-brand-accent',
  buttonClassName,
}: HeroProps) {
  return (
    <section
      className={`relative ${gradientClass} text-white py-20 md:py-32`}
      style={backgroundImage ? { backgroundImage: `url(${backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}
    >
      {backgroundImage && (
        <div className="absolute inset-0 bg-black bg-opacity-50" />
      )}
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {showLogo && (
            <div className="mb-8 flex justify-center">
              {/*
                The logo is drawn as it is, on a light disc that gives it
                contrast against whatever gradient the brand colours produce.
                Do not put a colour filter on it. `brightness(0) invert(1)`
                only works for a monochrome silhouette on a transparent
                background; every other logo, the shipped placeholder
                included, comes out as a solid white circle.
              */}
              <div className="w-[150px] h-[150px] rounded-full bg-white/95 p-3 flex items-center justify-center shadow-lg">
                <Image
                  src={ORG_LOGO_URL}
                  alt={ORG_LOGO_ALT}
                  width={150}
                  height={150}
                  className="w-full h-full rounded-full object-contain"
                />
              </div>
            </div>
          )}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
            {title}
          </h1>
          
          {subtitle && (
            <p className="text-xl md:text-2xl mb-8 opacity-90">
              {subtitle}
            </p>
          )}
          
          {(primaryAction || secondaryAction) && (
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {primaryAction && (
                <Button href={primaryAction.href} size="lg" className={buttonClassName}>
                  {primaryAction.text}
                </Button>
              )}
              {secondaryAction && (
                <Button href={secondaryAction.href} variant="secondary" size="lg">
                  {secondaryAction.text}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}