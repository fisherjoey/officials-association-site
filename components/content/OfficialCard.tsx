import Image from 'next/image'
import Card from '../ui/Card'

interface OfficialCardProps {
  name: string
  level: number
  photo?: string
  bio?: string
  experience?: string
  email?: string
  availability?: string
}

export default function OfficialCard({
  name,
  level,
  photo,
  bio,
  experience,
  email,
  availability,
}: OfficialCardProps) {
  return (
    <Card hover>
      <div className="flex flex-col items-center text-center">
        <div className="relative w-32 h-32 mb-4">
          {photo ? (
            <Image
              src={photo}
              alt={name}
              fill
              className="rounded-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gray-200 rounded-full flex items-center justify-center">
              <svg className="w-16 h-16 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
              </svg>
            </div>
          )}
          <div className="absolute bottom-0 right-0 bg-brand-primary text-white rounded-full w-8 h-8 flex items-center justify-center font-bold text-sm">
            {level}
          </div>
        </div>
        
        <h3 className="text-xl font-semibold text-brand-secondary mb-2">{name}</h3>
        
        <div className="flex items-center gap-2 mb-3">
          {[...Array(5)].map((_, i) => (
            <span 
              key={i} 
              className={`text-lg ${i < level ? 'text-brand-primary' : 'text-gray-300'}`}
            >
              ★
            </span>
          ))}
        </div>
        
        {experience && (
          <p className="text-sm text-gray-600 mb-2">{experience} years experience</p>
        )}
        
        {bio && (
          <p className="text-gray-700 mb-4 line-clamp-3">{bio}</p>
        )}
        
        {availability && (
          <p className="text-sm text-green-600 font-medium mb-3">
            Available: {availability}
          </p>
        )}
        
        {email && (
          <a 
            href={`mailto:${email}`}
            className="text-brand-primary hover:text-brand-secondary transition-colors text-sm"
          >
            Contact Official
          </a>
        )}
      </div>
    </Card>
  )
}