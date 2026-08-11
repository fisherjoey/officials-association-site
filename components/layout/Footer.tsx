import Link from 'next/link'
import Image from 'next/image'
import SocialLinks from './SocialLinks'
import { ORG_NAME, ORG_LOGO_URL, ORG_LOGO_ALT, AFFILIATIONS, SOCIAL_LINKS, getCopyrightYear } from '@/lib/siteConfig'

const hasSocialLinks = Object.values(SOCIAL_LINKS).some(Boolean)

export default function Footer() {
  return (
    <footer className="bg-brand-dark text-white">
      <div className="container mx-auto px-4 py-8 sm:py-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 sm:gap-8 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-3 sm:mb-4">
              <Image
                src={ORG_LOGO_URL}
                alt={ORG_LOGO_ALT}
                width={50} 
                height={50}
                className="rounded invert sm:w-[60px] sm:h-[60px]"
              />
            </div>
            <p className="text-gray-300 font-semibold text-sm sm:text-base mb-2">{ORG_NAME}</p>
            <Link href="/contact?category=general" className="text-gray-400 hover:text-brand-primary text-xs sm:text-sm transition-colors">Contact Us</Link>
          </div>
          
          <div>
            <h3 className="text-brand-primary font-bold text-base sm:text-lg mb-3 sm:mb-4">Quick Links</h3>
            <ul className="space-y-1.5 sm:space-y-2">
              <li><Link href="/become-a-referee" className="text-gray-300 hover:text-brand-primary transition-colors text-sm sm:text-base">Become an Official</Link></li>
              <li><Link href="/get-officials" className="text-gray-300 hover:text-brand-primary transition-colors text-sm sm:text-base">Book Referees</Link></li>
              <li><Link href="/about" className="text-gray-300 hover:text-brand-primary transition-colors text-sm sm:text-base">About Us</Link></li>
              <li><Link href="/new-officials" className="text-gray-300 hover:text-brand-primary transition-colors text-sm sm:text-base">Blue Whistle Program</Link></li>
            </ul>
          </div>
          
          {AFFILIATIONS.length > 0 && (
            <div>
              <h3 className="text-brand-primary font-bold text-base sm:text-lg mb-3 sm:mb-4">Affiliations</h3>
              <ul className="space-y-1.5 sm:space-y-2">
                {AFFILIATIONS.map((affiliation) => (
                  <li key={affiliation.url}>
                    <a href={affiliation.url} target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-brand-primary transition-colors text-sm sm:text-base">{affiliation.name}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {hasSocialLinks && (
            <div>
              <h3 className="text-brand-primary font-bold text-base sm:text-lg mb-3 sm:mb-4">Follow Us</h3>
              <SocialLinks
                size={28}
                className="flex gap-4"
                linkClassName="text-gray-300 hover:text-brand-primary transition-colors"
              />
            </div>
          )}
        </div>
        
        <div className="border-t border-gray-700 pt-4 sm:pt-6 text-center text-gray-400">
          <p className="text-xs sm:text-sm">&copy; {getCopyrightYear()} {ORG_NAME}. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}