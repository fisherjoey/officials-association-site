import Button from './Button'
import { ORG_SHORT_NAME } from '@/lib/siteConfig'

export default function CTASection() {
  return (
    <div className="text-center py-12">
      <h3 className="text-xl font-bold text-brand-secondary mb-4">
        Ready to Start Your Officiating Journey?
      </h3>
      <div className="flex justify-center">
        <Button 
          href="/become-a-referee" 
          size="lg"
        >
          Apply to Join {ORG_SHORT_NAME}
        </Button>
      </div>
    </div>
  )
}