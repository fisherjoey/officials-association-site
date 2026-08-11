import { IconBrandFacebook, IconBrandInstagram, IconBrandX, IconBrandYoutube } from '@tabler/icons-react'
import { SOCIAL_LINKS } from '@/lib/siteConfig'

const NETWORKS = [
  { key: 'facebook', label: 'Facebook', Icon: IconBrandFacebook },
  { key: 'instagram', label: 'Instagram', Icon: IconBrandInstagram },
  { key: 'twitter', label: 'X', Icon: IconBrandX },
  { key: 'youtube', label: 'YouTube', Icon: IconBrandYoutube },
] as const

interface SocialLinksProps {
  size?: number
  /** Classes applied to each icon link. */
  linkClassName?: string
  /** Classes applied to the wrapping flex row. */
  className?: string
}

/**
 * Renders whichever social profiles are configured in lib/siteConfig.ts and
 * nothing at all when none are. An unconfigured deploy must not link to a real
 * account, so there is no placeholder URL to fall back to here.
 */
export default function SocialLinks({
  size = 24,
  linkClassName = '',
  className = 'flex items-center gap-3',
}: SocialLinksProps) {
  const configured = NETWORKS.filter(({ key }) => SOCIAL_LINKS[key])

  if (configured.length === 0) return null

  return (
    <div className={className}>
      {configured.map(({ key, label, Icon }) => (
        <a
          key={key}
          href={SOCIAL_LINKS[key]}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
          aria-label={`Follow us on ${label}`}
        >
          <Icon size={size} />
        </a>
      ))}
    </div>
  )
}
