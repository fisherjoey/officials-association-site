import Card from '../ui/Card'
import Button from '../ui/Button'

interface TrainingCardProps {
  title: string
  date: string
  time: string
  location: string
  type: 'workshop' | 'certification' | 'refresher' | 'meeting'
  description: string
  registrationLink?: string
  spotsAvailable?: number
}

export default function TrainingCard({
  title,
  date,
  time,
  location,
  type,
  description,
  registrationLink,
  spotsAvailable,
}: TrainingCardProps) {
  const typeColors = {
    workshop: 'bg-blue-100 text-blue-800',
    certification: 'bg-green-100 text-green-800',
    refresher: 'bg-yellow-100 text-yellow-800',
    meeting: 'bg-purple-100 text-purple-800',
  }
  
  const formattedDate = new Date(date).toLocaleDateString('en-CA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  
  return (
    <Card hover>
      <div className="flex justify-between items-start mb-4">
        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${typeColors[type]}`}>
          {type.charAt(0).toUpperCase() + type.slice(1)}
        </span>
        {spotsAvailable !== undefined && (
          <span className={`text-sm font-semibold ${spotsAvailable > 0 ? 'text-green-600' : 'text-red-600'}`}>
            {spotsAvailable > 0 ? `${spotsAvailable} spots left` : 'Full'}
          </span>
        )}
      </div>
      
      <h3 className="text-xl font-bold text-brand-secondary mb-3">{title}</h3>
      
      <div className="space-y-2 mb-4 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span>{formattedDate}</span>
        </div>
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{time}</span>
        </div>
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>{location}</span>
        </div>
      </div>
      
      <p className="text-gray-700 mb-4">{description}</p>
      
      {registrationLink && spotsAvailable !== 0 && (
        <Button 
          href={registrationLink}
          variant="primary"
          size="sm"
          className="w-full"
        >
          Register Now
        </Button>
      )}
    </Card>
  )
}